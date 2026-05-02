// =================================================================
// CONVERSATION STORE BARREL MODULE
// Why: Simplifies the import structure for conversation-related state 
// management, providing a clean API for the rest of the application.
// =================================================================

export { useConversationStore, conversationSelectors } from './store';
export * from './store';
export * from './types';

