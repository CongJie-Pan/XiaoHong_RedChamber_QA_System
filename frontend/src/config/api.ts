// =================================================================
// API CONFIGURATION SYSTEM
// Why: Centralizes all network and parsing constants to ensure 
// consistent behavior across the application and simplify 
// environment-specific tuning.
// =================================================================

/**
 * API configuration values
 * Why: Provides a single source of truth for network-related settings,
 * allowing for easy adjustments of timeouts and message limits without
 * hunting through service implementations.
 */
// =================================================================
// NETWORK & VALIDATION SETTINGS
// =================================================================
export const API_CONFIG = {
  /**
   * Chat API endpoint
   * Why: Supports both local development (proxy) and production deployments.
   */
  chatEndpoint: process.env.NEXT_PUBLIC_CHAT_API_ENDPOINT || '/api/chat',

  /**
   * Request timeout in milliseconds
   * Why: Prevents dangling connections from consuming client resources 
   * during network instability.
   */
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000', 10),

  /**
   * Maximum message content length
   * Why: Protects the backend from potential payload-based DOS attacks 
   * and ensures prompt context limits are respected.
   */
  maxMessageLength: parseInt(process.env.NEXT_PUBLIC_MAX_MESSAGE_LENGTH || '10000', 10),

  /**
   * Minimum message content length
   * Why: Prevents processing of empty or insignificant inputs.
   */
  minMessageLength: 1,
} as const;

// =================================================================
// STREAM PARSER CONFIGURATION
// Why: Defines the boundaries for the real-time LLM response parser,
// ensuring that special tags (like <think>) are correctly identified.
// =================================================================
export const PARSER_CONFIG = {
  /**
   * Maximum buffer size in bytes before forced flush
   * Why: Guards against memory exhaustion if the stream contains 
   * extremely long tokens or malformed content that never closes a tag.
   */
  maxBufferSize: parseInt(process.env.NEXT_PUBLIC_PARSER_MAX_BUFFER || '102400', 10),

  /**
   * Maximum size for partial tags held in buffer
   * Why: Limits the lookahead buffer to prevent performance degradation 
   * when searching for tag boundaries.
   */
  maxPartialTagSize: 100,

  /**
   * Think tag constants
   * Why: Standardizes the identification of Chain-of-Thought (CoT) 
   * blocks across the streaming parser and UI components.
   */
  tags: {
    open: '<think>',
    close: '</think>',
    openLength: 7, // '<think>'.length
    closeLength: 8, // '</think>'.length
  },
} as const;

// =================================================================
// VALIDATION LOGIC
// Why: Ensures that the application starts with sane configuration 
// values, catching misconfigured environment variables early.
// =================================================================

/**
 * Validates the loaded API configuration.
 * 
 * Why: To provide immediate feedback in the console if environment 
 * variables are set to values that might cause runtime issues.
 * 
 * @returns {void}
 */
export function validateApiConfig(): void {
  // IF: Timeout is less than 1 second
  // Why: Extremely short timeouts will likely cause all requests to fail.
  if (API_CONFIG.timeout < 1000) {
    console.warn('[API Config] Timeout is very short:', API_CONFIG.timeout, 'ms');
  }

  // IF: Max message length is too small
  // Why: Users won't be able to send meaningful queries.
  if (API_CONFIG.maxMessageLength < 100) {
    console.warn('[API Config] Max message length is very short:', API_CONFIG.maxMessageLength);
  }

  // IF: Buffer size is too small
  // Why: Frequent flushes or buffer overflows might occur during streaming.
  if (PARSER_CONFIG.maxBufferSize < 10000) {
    console.warn('[Parser Config] Max buffer size is very small:', PARSER_CONFIG.maxBufferSize);
  }
}
