/**
 * Chat API Route (BFF - Backend For Frontend)
 * 
 * This route acts as a secure intermediary between the browser and the 
 * internal Python FastAPI RAG service.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateMessagesArray,
  checkRateLimit,
  getClientIdentifier,
  logger,
} from '@/utils';

// Force Node.js runtime for streaming support and disable static caching
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Error response structure for consistent client-side handling */
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
    retryAfter?: number;
  };
}

/** Utility to create standardized error responses */
function createErrorResponse(
  message: string,
  code: string,
  status: number,
  retryAfter?: number,
  headers?: Record<string, string>
): NextResponse<ErrorResponse> {
  const errorBody: ErrorResponse = {
    error: { message, code, status, ...(retryAfter && { retryAfter }) },
  };
  return NextResponse.json(errorBody, { status, headers: headers || {} });
}

/** Utility to generate standard RateLimit headers */
function createRateLimitHeaders(
  remaining: number,
  limit: number,
  resetIn: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetIn),
  };
}

export async function POST(request: NextRequest) {
  // Identify the client (IP or User-Agent) for rate limiting purposes
  const clientId = getClientIdentifier(request);

  try {
    // =================================================================
    // BLOCK: RATE LIMITING
    // Why: To prevent API abuse and control costs associated with 
    // heavy LLM/RAG computations.
    // =================================================================
    const rateLimit = checkRateLimit(clientId, {
      maxRequests: 20,
      windowMs: 60_000,
    });

    // IF: User has exceeded the allowed request quota
    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded', { clientId, resetIn: rateLimit.resetIn });
      return createErrorResponse(
        `Rate limit exceeded. Please retry after ${rateLimit.resetIn} seconds.`,
        'RATE_LIMITED',
        429,
        rateLimit.resetIn,
        createRateLimitHeaders(rateLimit.remaining, rateLimit.limit, rateLimit.resetIn)
      );
    }

    // =================================================================
    // BLOCK: REQUEST PARSING
    // Why: We need to extract parameters to forward them to the backend.
    // =================================================================
    let body: { 
      messages: Array<{ role: string; content: string }>;
      use_rag?: boolean;
      force_think?: boolean;
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      repetition_penalty?: number;
    };
    
    try {
      body = await request.json();
    } catch {
      // IF: The request body is not valid JSON
      return createErrorResponse('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    // =================================================================
    // BLOCK: INPUT VALIDATION
    // Why: Validating the chat history structure before sending it to 
    // the AI model prevents the backend from crashing or returning 
    // garbage results.
    // =================================================================
    const validation = validateMessagesArray(body.messages);
    
    // IF: The message array is empty or has incorrect roles
    if (!validation.valid) {
      logger.warn('Message validation failed', { clientId, error: validation.error });
      return createErrorResponse(validation.error || 'Invalid messages', 'INVALID_MESSAGES', 400);
    }

    // =================================================================
    // BLOCK: BACKEND PROXY (FASTAPI)
    // Why: We forward the processed request to the internal Python 
    // microservice which handles the actual RAG pipeline.
    // =================================================================
    const fastApiUrl = 'http://127.0.0.1:8000/api/v1/stream';
    logger.info(`Forwarding chat request to internal backend: ${fastApiUrl}`);

    const fastApiResponse = await fetch(fastApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: body.messages,
        use_rag: body.use_rag || false,
        force_think: body.force_think || false,
        temperature: body.temperature ?? 0.0,
        top_p: body.top_p ?? 0.9,
        max_tokens: body.max_tokens ?? 2048,
        repetition_penalty: body.repetition_penalty ?? 1.1
      }),
      // Pass the AbortSignal to ensure the backend fetch is cancelled 
      // if the frontend client disconnects.
      signal: request.signal,
    });

    // =================================================================
    // BLOCK: UPSTREAM ERROR HANDLING
    // Why: We translate internal backend errors into user-friendly 
    // messages while hiding technical implementation details.
    // =================================================================
    if (!fastApiResponse.ok) {
      const status = fastApiResponse.status;
      logger.error('FastAPI backend error', undefined, { status, clientId });

      // IF: Unauthorized (e.g., HF_TOKEN expired)
      if (status === 401) return createErrorResponse('Auth failed with AI service.', 'AUTH_ERROR', 401);
      
      // IF: Upstream rate limit (e.g., Hugging Face rate limit)
      if (status === 429) return createErrorResponse('Service busy.', 'SERVICE_BUSY', 429);
      
      // FALLBACK: General service error
      return createErrorResponse('An error occurred during AI generation.', 'SERVICE_ERROR', 502);
    }

    // IF: The response body is unexpectedly empty
    if (!fastApiResponse.body) {
      return createErrorResponse('Empty response from backend', 'EMPTY_RESPONSE', 502);
    }

    // =================================================================
    // BLOCK: ZERO-COPY STREAMING RESPONSE
    // Why: This allows the browser to receive tokens as they are 
    // generated in real-time, significantly improving perceived performance.
    // =================================================================
    return new Response(fastApiResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform', // Critical: prevent caching of the stream
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Critical: Bypasses Nginx buffering for instant SSE
        ...createRateLimitHeaders(rateLimit.remaining, rateLimit.limit, rateLimit.resetIn),
      },
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    // =================================================================
    // IF: User Aborted (Client closed the tab or stopped generation)
    // Why: We log this as info rather than an error to avoid noise in 
    // monitoring systems.
    // =================================================================
    if (err.name === 'AbortError' || err.name === 'ResponseAborted') {
      logger.info('Request aborted by user', { clientId });
      return new Response(null, { status: 499 }); 
    }

    // FINAL CATCH: Log critical unexpected exceptions
    logger.error('Chat API unexpected error', err, { clientId });
    return createErrorResponse('An unexpected error occurred.', 'INTERNAL_ERROR', 500);
  }
}
