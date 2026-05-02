// =================================================================
// CONVERSATION STORE TYPE DEFINITIONS
// Why: Defines the state and actions for managing the lifecycle of 
// multiple chat threads. This store handles the persistence link 
// between the UI and the IndexedDB storage, as well as the 
// background task of title generation.
// =================================================================

import type { Conversation, Message } from '@/database/schema';

/**
 * Conversation state managed by Zustand
 */
export interface ConversationState {
  /** All conversations retrieved from the local database */
  conversations: Conversation[];
  /** Currently active conversation ID for the main chat view */
  activeConversationId: string | null;
  /** Global loading state for conversation list operations */
  isLoading: boolean;
  /** Current error state for conversation operations */
  error: Error | null;
  /** 
   * Map of conversation IDs to their currently streaming title 
   * Why: Allows titles to be updated in real-time in the sidebar 
   * while the title-generation LLM is still responding.
   */
  streamingTitles: Record<string, string>;
}

/**
 * Conversation actions for store manipulation
 */
export interface ConversationActions {
  /** Load all conversations from database */
  loadConversations: () => Promise<void>;
  /** Create a new conversation and return its ID */
  createConversation: (title?: string) => Promise<string>;
  /** Select a conversation as active */
  selectConversation: (id: string) => void;
  /** Delete a conversation and its messages from the database */
  deleteConversation: (id: string) => Promise<void>;
  /** Update a conversation's metadata (e.g., title) */
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  /** Clear active conversation (e.g., when returning to home) */
  clearActiveConversation: () => void;
  /** Set error state */
  setError: (error: Error | null) => void;
  /** Generate a conversation title using streaming */
  generateTitle: (conversationId: string, messages: { role: string; content: string }[]) => Promise<void>;
}

/**
 * Combined Conversation Store type
 */
export type ConversationStore = ConversationState & ConversationActions;

/**
 * Message loading state for conversation
 * Why: Used when fetching messages for a specific conversation 
 * to track the request lifecycle.
 */
export interface MessageLoadState {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
}

