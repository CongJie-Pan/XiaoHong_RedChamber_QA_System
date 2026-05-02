// =================================================================
// INPUT VALIDATION & SANITIZATION UTILITIES
// Why: Implementing robust validation layers at the application 
// boundary prevents malformed data from entering the system, 
// mitigates XSS risks, and ensures that the backend and LLM services 
// receive data that conforms to expected schemas and size limits.
// =================================================================

/** Maximum allowed message content length (100KB) */
export const MAX_MESSAGE_LENGTH = 100_000;

/** Maximum allowed messages per request */
export const MAX_MESSAGES_PER_REQUEST = 100;

/**
 * Sanitizes user input to prevent XSS attacks
 * Escapes HTML special characters
 * @param input - Raw user input
 * @returns Sanitized string safe for storage and display
 */
export function sanitizeInput(input: string): string {
  // IF: Input is not a string
  // Why: Robustness against runtime type mismatches.
  if (typeof input !== 'string') {
    return '';
  }

  // Why: Convert HTML special characters to entities to prevent 
  // browser execution of injected scripts while preserving the 
  // original literal text.
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validates message content
 * @param content - Message content to validate
 * @returns Validation result with error message if invalid
 */
export function validateMessageContent(content: unknown): {
  valid: boolean;
  error?: string;
  sanitized?: string;
} {
  // IF: Content is not a string
  // Why: Basic type safety check before processing.
  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }

  // IF: Content is empty
  // Why: Prevent sending useless empty messages to the LLM.
  if (content.length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }

  // IF: Content exceeds size limits
  // Why: Protect backend resources and prevent context window 
  // overflows in the LLM.
  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return { valid: true, sanitized: sanitizeInput(content) };
}

/**
 * Validates chat message structure
 * @param message - Message object to validate
 * @returns Validation result
 */
export function validateChatMessage(message: unknown): {
  valid: boolean;
  error?: string;
} {
  // IF: Not an object
  // Why: Ensure the message matches the expected Message type structure.
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const msg = message as Record<string, unknown>;

  // IF: Role is missing or invalid
  // Why: The LLM API requires specific roles ('user', 'assistant', 'system').
  if (!msg.role || typeof msg.role !== 'string') {
    return { valid: false, error: 'Message must have a valid role' };
  }

  if (!['user', 'assistant', 'system'].includes(msg.role)) {
    return { valid: false, error: 'Message role must be user, assistant, or system' };
  }

  const contentValidation = validateMessageContent(msg.content);
  // IF: Content validation fails
  // Why: Bubble up content-specific validation errors.
  if (!contentValidation.valid) {
    return { valid: false, error: contentValidation.error };
  }

  return { valid: true };
}

/**
 * Validates an array of chat messages
 * @param messages - Array of messages to validate
 * @returns Validation result with detailed error
 */
export function validateMessagesArray(messages: unknown): {
  valid: boolean;
  error?: string;
} {
  // IF: Not an array
  // Why: Ensure input matches the expected collection format.
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'Messages must be an array' };
  }

  // IF: Array is empty
  // Why: An empty conversation cannot be processed.
  if (messages.length === 0) {
    return { valid: false, error: 'Messages array cannot be empty' };
  }

  // IF: Too many messages
  // Why: Prevent DoS or context window issues.
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return {
      valid: false,
      error: `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`,
    };
  }

  // Why: Iteratively validate each message in the history.
  for (let i = 0; i < messages.length; i++) {
    const validation = validateChatMessage(messages[i]);
    if (!validation.valid) {
      return { valid: false, error: `Message at index ${i}: ${validation.error}` };
    }
  }

  return { valid: true };
}

/**
 * Type guard for checking if a value is a valid role
 */
export function isValidRole(role: unknown): role is 'user' | 'assistant' | 'system' {
  return role === 'user' || role === 'assistant' || role === 'system';
}

