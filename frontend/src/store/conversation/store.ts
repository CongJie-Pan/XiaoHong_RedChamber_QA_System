// =================================================================
// CONVERSATION ZUSTAND STORE
// Why: Manages the collection of chat threads, handling database 
// synchronization, background title generation, and selection state. 
// This store acts as the primary controller for the sidebar and 
// conversation history management.
// =================================================================

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
  streamingTitles: {} as Record<string, string>,
};

/**
 * Conversation store for managing conversation list
 */
export const useConversationStore = create<ConversationStore>((set) => ({
  ...initialState,

  // =================================================================
  // PERSISTENCE ACTIONS
  // Why: Bridges the in-memory state with the Dexie/IndexedDB storage 
  // to ensure data survives page reloads.
  // =================================================================

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
        // IF: The active conversation is being deleted
        // Why: Reset selection to prevent the UI from trying to 
        // display a non-existent conversation.
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

  // =================================================================
  // BACKGROUND TITLE GENERATION
  // Why: Automatically summarizes the first few messages of a chat into 
  // a concise title. Uses streaming to provide immediate UI feedback.
  // =================================================================
  
  generateTitle: async (conversationId: string, messages: { role: string; content: string }[]) => {
    try {
      // Start streaming state
      set((state) => ({
        streamingTitles: { ...state.streamingTitles, [conversationId]: '' },
      }));

      const response = await fetch('/api/title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      });

      // IF: Fetch request fails
      // Why: Catch network or server-side errors before attempting 
      // to read the body.
      if (!response.ok || !response.body) {
        throw new Error('Failed to generate title');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullTitle = '';

      // Why: Process the stream chunk-by-chunk for a responsive UI.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          // IF: Line follows the SSE 'data: ' format
          // Why: Parse individual events from the stream.
          if (line.trim().startsWith('data: ')) {
            const dataStr = line.trim().slice(6);
            if (dataStr === '[DONE]') continue;
            if (dataStr.startsWith('[ERROR]')) continue;
            
            try {
              const data = JSON.parse(dataStr);
              // IF: Chunk contains valid title content
              // Why: Accumulate and update the transient streaming title.
              if (data.content) {
                fullTitle += data.content;
                set((state) => ({
                  streamingTitles: {
                    ...state.streamingTitles,
                    [conversationId]: fullTitle,
                  },
                }));
              }
            } catch (error) {
              // Ignore parse errors for incomplete chunks
              void error;
            }
          }
        }
      }

      // IF: We successfully generated a non-empty title
      // Why: Persist the final result to the local database and 
      // refresh the conversation list to ensure consistency.
      if (fullTitle.trim()) {
        const finalTitle = fullTitle.trim();
        await databaseService.conversation.update(conversationId, { title: finalTitle });
        
        const conversations = await databaseService.conversation.getAll();
        set({ conversations });
      }

      // Why: Remove the ID from streamingTitles to signal that 
      // background generation is complete.
      set((state) => {
        const newStreamingTitles = { ...state.streamingTitles };
        delete newStreamingTitles[conversationId];
        return { streamingTitles: newStreamingTitles };
      });
    } catch (error) {
      console.error('Error generating title:', error);
      // Why: Ensure cleanup even on failure.
      set((state) => {
        const newStreamingTitles = { ...state.streamingTitles };
        delete newStreamingTitles[conversationId];
        return { streamingTitles: newStreamingTitles };
      });
    }
  },
}));

// =================================================================
// SELECTORS & SELECTOR CREATORS
// =================================================================

export const conversationSelectors = {
  activeConversation: (state: ConversationStore): Conversation | undefined => {
    if (!state.activeConversationId) return undefined;
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },

  hasConversations: (state: ConversationStore): boolean => {
    return state.conversations.length > 0;
  },

  conversationCount: (state: ConversationStore): number => {
    return state.conversations.length;
  },
};

export const selectConversations = (state: ConversationStore) => state.conversations;
export const selectActiveConversationId = (state: ConversationStore) => state.activeConversationId;
export const selectIsLoading = (state: ConversationStore) => state.isLoading;
export const selectError = (state: ConversationStore) => state.error;

