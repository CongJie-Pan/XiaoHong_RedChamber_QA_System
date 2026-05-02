/**
 * Title Generation API Route (BFF - Backend For Frontend)
 * 
 * Why this exists:
 * This route proxies title generation requests to the Python backend. 
 * Even though titles are short, we use SSE (Streaming) to provide 
 * immediate feedback to the user as the title is being summarized.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIdentifier,
  logger,
} from '@/utils';

// =================================================================
// RUNTIME CONFIGURATION
// nodejs: Required for full streaming support.
// force-dynamic: Ensures Next.js doesn't cache the POST response.
// =================================================================
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Standard Error response structure */
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
    retryAfter?: number;
  };
}

/** Factory for standardized API error responses */
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

/** Helper to generate RateLimit headers */
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
  const clientId = getClientIdentifier(request);

  try {
    // =================================================================
    // BLOCK: RATE LIMITING
    // Why: Title generation involves an LLM call. We apply a more 
    // restrictive limit (10 req/min) compared to chat because titles 
    // are only needed once per conversation start.
    // =================================================================
    const rateLimit = checkRateLimit(clientId + '_title', {
      maxRequests: 10,
      windowMs: 60_000,
    });

    // IF: User has reached the limit for title generation
    if (!rateLimit.allowed) {
      logger.warn('Title Rate limit exceeded', { clientId, resetIn: rateLimit.resetIn });
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
    // Why: Extracts chat history to send to the summarizer model.
    // =================================================================
    let body: { 
      messages: Array<{ role: string; content: string }>;
    };
    try {
      body = await request.json();
    } catch {
      // IF: Body is not valid JSON
      return createErrorResponse('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    // =================================================================
    // BLOCK: BACKEND PROXY
    // Why: Forwards the request to the dedicated FastAPI title endpoint.
    // =================================================================
    const fastApiUrl = 'http://127.0.0.1:8000/api/v1/generate-title';
    logger.info(`Forwarding title request to internal backend: ${fastApiUrl}`);

    const fastApiResponse = await fetch(fastApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: body.messages }),
      signal: request.signal,
    });

    // =================================================================
    // BLOCK: UPSTREAM VALIDATION
    // Why: Ensures the backend responded successfully before attempting 
    // to stream content to the client.
    // =================================================================
    if (!fastApiResponse.ok) {
      const status = fastApiResponse.status;
      logger.error('FastAPI title backend error', undefined, { status, clientId });
      return createErrorResponse('An error occurred while generating title', 'SERVICE_ERROR', 502);
    }

    // IF: Backend returned success but no response body
    if (!fastApiResponse.body) {
      return createErrorResponse('Empty response from backend', 'EMPTY_RESPONSE', 502);
    }

    // =================================================================
    // BLOCK: STREAMING RESPONSE
    // Why: We use SSE headers to allow real-time title updates in the 
    // sidebar as the LLM summarizes the conversation.
    // =================================================================
    return new Response(fastApiResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...createRateLimitHeaders(rateLimit.remaining, rateLimit.limit, rateLimit.resetIn),
      },
    });

  } catch (error: unknown) {
    // IF: Request was cancelled by the browser
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }

    logger.error('Title API unexpected error', error instanceof Error ? error : new Error(String(error)));
    return createErrorResponse('An unexpected error occurred.', 'INTERNAL_ERROR', 500);
  }
}
