// =================================================================
// STATE MANAGEMENT BARREL MODULE
// Why: Provides a unified entry point for all Zustand stores and 
// selectors used throughout the React application. This centralizes 
// state access and ensures that components can easily import 
// necessary state hooks and types without deep-nesting imports.
// =================================================================

// =================================================================
// CHAT STORE EXPORTS
// Why: Manages the active chat interaction, including message streams, 
// thinking states, and citations.
// =================================================================
export {
  useChatStore,
  chatSelectors,
  selectDisplayMessages,
  selectIsStreaming,
  selectIsThinking,
  selectThinkingContent,
  selectCurrentContent,
  selectCitations,
  selectError,
} from './chat';
export type {
  ChatStore,
  ChatState,
  ChatActions,
  DisplayMessage,
  ThinkingState,
} from './chat';

// =================================================================
// CONVERSATION STORE EXPORTS
// Why: Manages the lifecycle of multiple conversations, including 
// history, active selection, and persistence metadata.
// =================================================================
export {
  useConversationStore,
  conversationSelectors,
  selectConversations,
  selectActiveConversationId,
  selectIsLoading,
} from './conversation';
export type {
  ConversationStore,
  ConversationState,
  ConversationActions,
} from './conversation';

