/**
 * Chat Stream API Client
 * Handles streaming chat requests and response parsing
 *
 * Features:
 * - Streaming response handling with SSE parsing
 * - Abort support for cancelling requests
 * - Comprehensive error handling with custom error types
 * - Resource cleanup on completion or cancellation
 */

import { API_CONFIG } from '@/config/api';
import { ChatStreamError, StreamParseError, isAbortError } from '@/utils/error';
import { ThinkTagParser } from './parser';
import { useChatStore } from '@/store/chat/store';
import type { ChatMessage, StreamCallbacks } from './types';

// =================================================================
// CORE STREAMING CLIENT
// Why: Provides a low-level fetch-based streaming client that 
// handles the standard SSE (Server-Sent Events) protocol while 
// supporting custom RAG-specific events and thinking tag parsing.
// =================================================================

/**
 * Creates a streaming chat request to the local AI backend
 *
 * @param messages - Array of chat messages
 * @param callbacks - Callbacks for handling stream events
 * @param abortSignal - Optional AbortSignal for cancelling the request
 */
export async function createChatStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  useRag: boolean = false,
  forceThink: boolean = false
): Promise<void> {
  // Why: Initialize a stateful parser to handle <think> tags that 
  // might be split across multiple network chunks.
  const parser = new ThinkTagParser();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  /**
   * Cleanup function to release resources
   * Called on completion, error, or abort
   */
  const cleanup = async (): Promise<void> => {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Ignore errors during cleanup
      }
      reader = null;
    }
    parser.reset();
  };

  /**
   * Handle abort signal
   * Attached early to ensure cleanup happens even if aborted before stream starts
   */
  const handleAbort = (): void => {
    cleanup();
  };

  if (abortSignal) {
    // IF: AbortSignal is already triggered
    // Why: Prevent starting a request that the user has already cancelled.
    if (abortSignal.aborted) {
      return; 
    }
    abortSignal.addEventListener('abort', handleAbort);
  }

  try {
    // =================================================================
    // NETWORK REQUEST
    // Why: Initiate a POST request to the streaming endpoint. 
    // We use the native Fetch API with ReadableStream for maximum 
    // compatibility and performance.
    // =================================================================
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages,
        use_rag: useRag,
        force_think: forceThink
      }),
    };

    if (abortSignal) {
      fetchOptions.signal = abortSignal;
    }

    const response = await fetch(API_CONFIG.chatEndpoint, fetchOptions);

    // Handle HTTP errors
    // Why: Standardize error formats so the UI can display clear 
    // messages for common issues (429 Rate Limit, 500 Server Error).
    if (!response.ok) {
      let errorBody: unknown;
      let errorMessage: string;

      try {
        errorBody = await response.json();
        errorMessage =
          (errorBody as { error?: { message?: string } })?.error?.message ||
          `API Error: ${response.status}`;
      } catch {
        errorMessage = `API Error: ${response.status} ${response.statusText}`;
      }

      throw new ChatStreamError(errorMessage, response.status, errorBody);
    }

    const bodyReader = response.body?.getReader();
    if (!bodyReader) {
      throw new Error('No response body available');
    }
    reader = bodyReader;

    const decoder = new TextDecoder();
    let pendingCitations: string[] = [];

    // =================================================================
    // STREAM PROCESSING LOOP
    // Why: Read the incoming byte stream and reconstruct the SSE 
    // data blocks. Handles incomplete blocks and dispatches events.
    // Use dual-layer parsing (split by \n\n then by \n) to ensure 
    // event types and data are correctly bound together even if 
    // split across network chunks.
    // =================================================================
    let buffer = '';
    let suggestionsFromDone: string[] = [];

    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Request aborted by user');
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Decode and buffer chunks
      buffer += decoder.decode(value, { stream: true });
      
      // Split by double newline to get complete SSE message blocks
      const blocks = buffer.split('\n\n');
      
      // Keep the last potentially incomplete block in the buffer
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        if (!block.trim()) continue;

        const lines = block.split('\n');
        let eventType = 'message';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            data = line.slice(6).trim();
          }
        }

        if (!data) continue;

        // IF: End-of-stream signal received
        if (data === '[DONE]') {
          if (pendingCitations.length > 0) {
            callbacks.onCitations(pendingCitations);
          }
          callbacks.onDone(suggestionsFromDone);
          return;
        }

        try {
          const chunk = JSON.parse(data);

          // IF: Event is a pipeline status update
          if (eventType === 'status') {
            callbacks.onStatus?.(chunk.status, chunk.message);
            continue;
          }

          // IF: Event contains structured search sources
          if (eventType === 'sources') {
            callbacks.onSources?.(chunk); 
            continue;
          }

          // IF: Event contains suggestions (Legacy or Atomic Done)
          if (eventType === 'suggestions') {
            callbacks.onSuggestions?.(chunk);
            continue;
          }

          // IF: Event is the new atomic 'done' payload
          if (eventType === 'done') {
            if (chunk.suggestions) {
              suggestionsFromDone = chunk.suggestions;
            }
            continue;
          }

          if (eventType === 'metadata') {
            // IF: Usage information is provided
            if (chunk.promptTokens !== undefined || chunk.totalTokens !== undefined) {
              useChatStore.getState().setTokenUsage({
                promptTokens: chunk.promptTokens,
                completionTokens: chunk.completionTokens,
                totalTokens: chunk.totalTokens
              });
            }
            continue;
          }

          // Handle standard message content chunks
          const content = chunk.choices?.[0]?.delta?.content || '';

          if (chunk.citations && chunk.citations.length > 0) {
            pendingCitations = chunk.citations;
          }

          if (content) {
            // Why: Pass raw content through the ThinkTagParser to 
            // separate thinking traces from the final answer.
            const parsedChunks = parser.parse(content);
            for (const parsed of parsedChunks) {
              switch (parsed.type) {
                case 'thinking_start':
                  callbacks.onThinkingStart();
                  break;
                case 'thinking_content':
                  if (parsed.content) callbacks.onThinkingContent(parsed.content);
                  break;
                case 'thinking_end':
                  callbacks.onThinkingEnd();
                  break;
                case 'content':
                  if (parsed.content) callbacks.onContent(parsed.content);
                  break;
              }
            }
          }
        } catch (parseError) {
          console.warn('[ChatStream] Failed to parse SSE chunk:', data, parseError);
        }
      }
    }

    // Stream ended without [DONE] signal
    if (pendingCitations.length > 0) {
      callbacks.onCitations(pendingCitations);
    }
    callbacks.onDone(suggestionsFromDone);
  } catch (error) {
    if (isAbortError(error)) {
      console.log('[ChatStream] Request aborted by user');
      return;
    }

    let normalizedError: Error;
    if (error instanceof ChatStreamError) {
      normalizedError = error;
    } else if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('[ChatStream] Request aborted');
        return;
      }
      normalizedError = error;
    } else {
      normalizedError = new Error(String(error));
    }

    callbacks.onError(normalizedError);
  } finally {
    await cleanup();
    if (abortSignal) {
      abortSignal.removeEventListener('abort', handleAbort);
    }
  }
}

/**
 * Export parser class for direct usage if needed
 */
export { ThinkTagParser };

/**
 * Export error types for consumers
 */
export { ChatStreamError, StreamParseError };
