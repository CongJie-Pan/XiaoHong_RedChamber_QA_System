// =================================================================
// ERROR HANDLING UTILITIES
// Why: Standardizing error structures and normalization across the 
// frontend ensures that the application can gracefully handle 
// failures, provide meaningful feedback to users, and maintain 
// detailed logs for debugging streaming and RAG operations.
// =================================================================

/**
 * Custom error for Chat Stream API errors
 * Includes status code and response body for debugging
 */
export class ChatStreamError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ChatStreamError';
    
    // IF: Running in a V8 environment (like Chrome or Node.js)
    // Why: Error.captureStackTrace provides a cleaner stack trace by 
    // excluding the constructor call from the trace, making it 
    // easier to identify the actual source of the error.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChatStreamError);
    }
  }
}

/**
 * Custom error for stream parsing failures
 * Includes raw data for debugging
 */
export class StreamParseError extends Error {
  constructor(
    message: string,
    public rawData: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'StreamParseError';
    
    // IF: Running in a V8 environment
    // Why: Ensures consistent stack trace behavior for custom error types.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StreamParseError);
    }
  }
}

/**
 * Custom error for user input validation
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
    
    // IF: Running in a V8 environment
    // Why: Ensures consistent stack trace behavior for custom error types.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

// =================================================================
// ERROR NORMALIZATION & TRANSFORMATION
// Why: Catch blocks in TypeScript/JavaScript receive 'unknown' types.
// Normalizing these to consistent Error objects simplifies downstream 
// logic and logging.
// =================================================================

/**
 * Normalize any error to an Error instance
 * Useful for catch blocks where the error type is unknown
 * @param error - Unknown error value
 * @returns Normalized Error instance
 */
export function normalizeError(error: unknown): Error {
  // IF: Already an Error instance
  // Why: No transformation needed, return as is.
  if (error instanceof Error) {
    return error;
  }
  
  // IF: Error is a simple string
  // Why: Wrap in an Error object to provide a stack trace.
  if (typeof error === 'string') {
    return new Error(error);
  }
  
  // ELSE: Unknown object or primitive
  // Why: Coerce to string to ensure we have at least some descriptive 
  // message in the resulting Error object.
  return new Error(String(error));
}

/**
 * Check if an error is an abort error (user-initiated cancellation)
 * @param error - Error to check
 * @returns True if the error is an abort error
 */
export function isAbortError(error: unknown): boolean {
  // IF: The object is an Error instance
  // Why: Standard fetch/XHR AbortController throws specific error 
  // types or messages that we need to identify to prevent showing 
  // 'failure' alerts for intentional user actions.
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message === 'Request aborted by user';
  }
  return false;
}

/**
 * Format error for logging
 * @param error - Error to format
 * @param context - Additional context
 * @returns Formatted error object
 */
export function formatErrorForLogging(
  error: Error,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // IF: Error is a ChatStreamError
  // Why: Extract specialized fields like status codes for server-side debugging.
  if (error instanceof ChatStreamError) {
    formatted.statusCode = error.statusCode;
    formatted.responseBody = error.responseBody;
  }

  // IF: Error is a StreamParseError
  // Why: Log the raw data that failed parsing to identify malformed server responses.
  if (error instanceof StreamParseError) {
    formatted.rawData = error.rawData;
  }

  // IF: Error is a ValidationError
  // Why: Identify which specific field caused the validation failure.
  if (error instanceof ValidationError) {
    formatted.field = error.field;
  }

  // IF: Additional context is provided
  // Why: Enrich the log with relevant runtime state (e.g., current conversation ID).
  if (context) {
    formatted.context = context;
  }

  return formatted;
}

