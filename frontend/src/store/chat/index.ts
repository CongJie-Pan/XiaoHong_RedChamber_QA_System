// =================================================================
// CHAT STORE BARREL MODULE
// Why: Simplifies the import structure for chat-related state 
// management, providing a clean API for the rest of the application.
// =================================================================

export { useChatStore } from './store';
export { chatSelectors } from './selectors';
export * from './selectors';
export * from './types';

