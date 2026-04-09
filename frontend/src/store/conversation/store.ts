/**
 * Conversation Store
 * Zustand store for managing conversation list and selection
 */

import { create } from 'zustand';
import { databaseService } from '@/services/database';
import type { Conversation } from '@/database/schema';
import type { ConversationStore } from './types';

/**
 * Initial state for the conversation store
 */
const initialState = {
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  isLoading: false,
  error: null as Error | null,
};

/**
 * Conversation store for managing conversation list
 */
export const useConversationStore = create<ConversationStore>((set, get) => ({
  ...initialState,

  loadConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await databaseService.conversation.getAll();
      set({ conversations, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error : new Error(String(error)),
        isLoading: false,
      });
    }
  },

  createConversation: async (title?: string) => {
    try {
      const conversation = await databaseService.conversation.create(title);
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        error: null,
      }));
      return conversation.id;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      set({ error: err });
      throw err;
    }
  },

  selectConversation: (id: string) => {
    set({ activeConversationId: id, error: null });
  },

  deleteConversation: async (id: string) => {
    try {
      await databaseService.conversation.delete(id);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversationId:
          state.activeConversationId === id ? null : state.activeConversationId,
        error: null,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      set({ error: err });
      throw err;
    }
  },

  updateConversation: (id: string, updates: Partial<Conversation>) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null });
  },

  setError: (error: Error | null) => {
    set({ error });
  },
}));

/**
 * Selectors for conversation store
 */
export const conversationSelectors = {
  /** Get active conversation */
  activeConversation: (state: ConversationStore): Conversation | undefined => {
    if (!state.activeConversationId) return undefined;
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },

  /** Check if has conversations */
  hasConversations: (state: ConversationStore): boolean => {
    return state.conversations.length > 0;
  },

  /** Get conversation count */
  conversationCount: (state: ConversationStore): number => {
    return state.conversations.length;
  },
};

/**
 * Hook-friendly selector creators
 */
export const selectConversations = (state: ConversationStore) => state.conversations;
export const selectActiveConversationId = (state: ConversationStore) => state.activeConversationId;
export const selectIsLoading = (state: ConversationStore) => state.isLoading;
export const selectError = (state: ConversationStore) => state.error;
