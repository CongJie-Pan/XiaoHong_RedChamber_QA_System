// =================================================================
// CHAT STORE SELECTORS
// Why: Provides a layer of abstraction for accessing and deriving 
// data from the chat state. This promotes memoization and ensures 
// that components only re-render when the specific slice of state 
// they depend on changes.
// =================================================================

import type { ChatState, ThinkingState, DisplayMessage, ConversationSnapshot } from './types';

const EMPTY_MESSAGES: DisplayMessage[] = [];
const EMPTY_CITATIONS: string[] = [];
const DEFAULT_THINKING: ThinkingState = {
  content: '',
  isThinking: false,
  startTime: null,
};

/**
 * Helper to get active snapshot
 */
const getActiveSnapshot = (state: ChatState): ConversationSnapshot | undefined => {
  if (!state.activeConversationId) return undefined;
  return state.conversationSnapshots[state.activeConversationId];
};

/**
 * Chat selectors for accessing derived state
 * 
 * IMPORTANT: These must return stable references for empty/default states 
 * to prevent React infinite re-render loops.
 */
export const chatSelectors = {
  /**
   * Get all messages for display
   */
  displayMessages: (state: ChatState): DisplayMessage[] => 
    getActiveSnapshot(state)?.messages || EMPTY_MESSAGES,

  /**
   * Get the current thinking state
   */
  currentThinking: (state: ChatState): ThinkingState => {
    const snap = getActiveSnapshot(state);
    if (!snap) return DEFAULT_THINKING;
    
    // We only return a new object if the underlying content or status changed.
    // In a real high-perf app, we might use useShallow in components instead.
    return {
      content: snap.thinkingContent,
      isThinking: snap.isThinking,
      startTime: snap.thinkingStartTime,
      duration: snap.thinkingStartTime
        ? Date.now() - snap.thinkingStartTime
        : undefined,
    };
  },

  /**
   * Check if currently loading/streaming
   */
  isLoading: (state: ChatState): boolean => 
    getActiveSnapshot(state)?.isStreaming || false,

  /**
   * Get current citations
   */
  citations: (state: ChatState): string[] => 
    getActiveSnapshot(state)?.currentCitations || EMPTY_CITATIONS,

  /**
   * Get current error
   */
  error: (state: ChatState): Error | null => 
    getActiveSnapshot(state)?.error || null,

  /**
   * Get the message currently being streamed
   */
  streamingMessage: (state: ChatState): DisplayMessage | undefined => {
    const snap = getActiveSnapshot(state);
    if (!snap || !snap.currentStreamingId) return undefined;
    
    return snap.messages.find((msg) => msg.id === snap.currentStreamingId);
  },

  /**
   * Get the last message in the conversation
   */
  lastMessage: (state: ChatState): DisplayMessage | undefined => {
    const messages = getActiveSnapshot(state)?.messages || EMPTY_MESSAGES;
    return messages[messages.length - 1];
  },

  /**
   * Get message count
   */
  messageCount: (state: ChatState): number => 
    getActiveSnapshot(state)?.messages.length || 0,

  /**
   * Check if conversation is empty
   */
  isEmpty: (state: ChatState): boolean => 
    (getActiveSnapshot(state)?.messages.length || 0) === 0,

  /**
   * Get accumulated answer content being streamed
   */
  currentContent: (state: ChatState): string => 
    getActiveSnapshot(state)?.currentContent || '',
};

  /**
   * Get current error
   */
  error: (state: ChatState): Error | null => 
    getActiveSnapshot(state)?.error || null,

  /**
   * Get the message currently being streamed
   */
  streamingMessage: (state: ChatState): DisplayMessage | undefined => {
    const snap = getActiveSnapshot(state);
    if (!snap || !snap.currentStreamingId) return undefined;
    
    return snap.messages.find((msg) => msg.id === snap.currentStreamingId);
  },

  /**
   * Get the last message in the conversation
   */
  lastMessage: (state: ChatState): DisplayMessage | undefined => {
    const messages = getActiveSnapshot(state)?.messages || [];
    return messages[messages.length - 1];
  },

  /**
   * Get message count
   */
  messageCount: (state: ChatState): number => 
    getActiveSnapshot(state)?.messages.length || 0,

  /**
   * Check if conversation is empty
   */
  isEmpty: (state: ChatState): boolean => 
    (getActiveSnapshot(state)?.messages.length || 0) === 0,

  /**
   * Get accumulated answer content being streamed
   */
  currentContent: (state: ChatState): string => 
    getActiveSnapshot(state)?.currentContent || '',
};

// =================================================================
// HOOK-FRIENDLY SELECTOR CREATORS
// =================================================================
export const selectDisplayMessages = (state: ChatState) => chatSelectors.displayMessages(state);
export const selectIsStreaming = (state: ChatState) => chatSelectors.isLoading(state);
export const selectIsThinking = (state: ChatState) => chatSelectors.currentThinking(state).isThinking;
export const selectThinkingContent = (state: ChatState) => chatSelectors.currentThinking(state).content;
export const selectCurrentContent = (state: ChatState) => chatSelectors.currentContent(state);
export const selectCitations = (state: ChatState) => chatSelectors.citations(state);
export const selectError = (state: ChatState) => chatSelectors.error(state);


