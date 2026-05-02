// =================================================================
// UTILITIES BARREL MODULE
// Why: Provides a single entry point for all shared logic across the 
// frontend application. This barrel pattern simplifies imports and 
// establishes a clear boundary for reusable logic.
// =================================================================

export { generateUUID } from './id';
export {
  sanitizeInput,
  validateMessageContent,
  validateChatMessage,
  validateMessagesArray,
  isValidRole,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PER_REQUEST,
} from './validation';
export {
  checkRateLimit,
  getClientIdentifier,
  resetRateLimit,
  clearAllRateLimits,
  type RateLimitResult,
} from './rateLimit';
export { logger } from './logger';

