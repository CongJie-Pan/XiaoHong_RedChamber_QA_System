// =================================================================
// CHAT ZUSTAND STORE
// Why: Centralizes the management of chat interactions, specifically 
// optimizing for the high-frequency state updates required by 
// streaming responses. By refactoring to a Snapshot Pattern, we 
// allow multiple conversations to maintain their UI state (including 
// background streams) independently.
// =================================================================

import { create } from 'zustand';
import { generateUUID } from '@/utils/id';
import type { ChatStore, ConversationSnapshot, DisplayMessage } from './types';
import type { CitationSource } from '@/components/Citations';

/**
 * Default state for a new conversation snapshot
 */
const createDefaultSnapshot = (): ConversationSnapshot => ({
  messages: [],
  isStreaming: false,
  currentStreamingId: null,
  thinkingContent: '',
  thinkingStartTime: null,
  isThinking: false,
  currentContent: '',
  currentCitations: [],
  ragStatus: 'idle',
  ragMessage: '',
  ragSources: [],
  error: null,
});

/**
 * Maximum number of conversation snapshots to keep in memory
 */
const MAX_CACHED_CONVERSATIONS = 10;

/**
 * Chat store for managing conversation messages and streaming state
 * Uses a snapshot-based architecture to support background streaming.
 */
export const useChatStore = create<ChatStore>((set, get) => ({
  // =================================================================
  // INITIAL STATE
  // =================================================================
  conversationSnapshots: {},
  activeConversationId: null,
  quotedText: null,
  tokenUsage: null,
  useRag: false,
  forceThink: false,

  // =================================================================
  // SNAPSHOT OPERATIONS
  // =================================================================
  
  setActiveConversation: (id) => {
    set((state) => {
      // IF: Already active
      if (state.activeConversationId === id) return state;

      const newSnapshots = { ...state.conversationSnapshots };
      
      // IF: New conversation ID provided and not in snapshots
      // Why: Ensure every active conversation has a valid state object.
      if (id && !newSnapshots[id]) {
        newSnapshots[id] = createDefaultSnapshot();
      }

      return {
        activeConversationId: id,
        conversationSnapshots: newSnapshots,
      };
    });
    
    // Why: Prevent memory leaks by pruning old snapshots.
    get().pruneSnapshots();
  },

  setSnapshot: (id, updates) => {
    set((state) => {
      const current = state.conversationSnapshots[id] || createDefaultSnapshot();
      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [id]: { ...current, ...updates },
        },
      };
    });
  },

  pruneSnapshots: () => {
    set((state) => {
      const ids = Object.keys(state.conversationSnapshots);
      if (ids.length <= MAX_CACHED_CONVERSATIONS) return state;

      // Why: Remove the oldest snapshots that are not the currently active one.
      const activeId = state.activeConversationId;
      const toRemove = ids
        .filter((id) => id !== activeId)
        .slice(0, ids.length - MAX_CACHED_CONVERSATIONS);

      if (toRemove.length === 0) return state;

      const newSnapshots = { ...state.conversationSnapshots };
      toRemove.forEach((id) => delete newSnapshots[id]);

      return { conversationSnapshots: newSnapshots };
    });
  },

  // =================================================================
  // MESSAGE OPERATIONS
  // Why: Basic CRUD operations, targeting either the active conversation 
  // or a specific background one.
  // =================================================================
  
  addUserMessage: (content, conversationId) => {
    const id = generateUUID();
    const message: DisplayMessage = {
      id,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    set((state) => {
      const snapshot = state.conversationSnapshots[conversationId] || createDefaultSnapshot();
      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [conversationId]: {
            ...snapshot,
            messages: [...snapshot.messages, message],
          },
        },
      };
    });

    return id;
  },

  addAssistantMessage: (conversationId) => {
    const id = generateUUID();
    const message: DisplayMessage = {
      id,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
    };

    set((state) => {
      const snapshot = state.conversationSnapshots[conversationId] || createDefaultSnapshot();
      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [conversationId]: {
            ...snapshot,
            messages: [...snapshot.messages, message],
          },
        },
      };
    });

    return id;
  },

  updateAssistantMessage: (id, updates, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            messages: snapshot.messages.map((msg) =>
              msg.id === id ? { ...msg, ...updates } : msg
            ),
          },
        },
      };
    });
  },

  setMessages: (messages, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId] || createDefaultSnapshot();
      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: { ...snapshot, messages },
        },
      };
    });
  },

  clearMessages: (conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: { ...snapshot, messages: [] },
        },
      };
    });
  },

  removeMessage: (id, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            messages: snapshot.messages.filter((msg) => msg.id !== id),
          },
        },
      };
    });
  },

  updateMessageContent: (id, content, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            messages: snapshot.messages.map((msg) =>
              msg.id === id ? { ...msg, content } : msg
            ),
          },
        },
      };
    });
  },

  // =================================================================
  // STREAMING LIFECYCLE MANAGEMENT
  // Why: Updated to target specific snapshots, allowing background 
  // streams to update their respective snapshots while the user is 
  // looking at a different conversation.
  // =================================================================

  startStreaming: (messageId, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId] || createDefaultSnapshot();
      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            isStreaming: true,
            currentStreamingId: messageId,
            thinkingContent: '',
            thinkingStartTime: null,
            isThinking: false,
            currentContent: '',
            currentCitations: [],
            error: null,
            ragStatus: 'idle',
            ragMessage: '',
            ragSources: [],
          },
        },
      };
    });
  },

  appendThinkingContent: (content, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      const thinkingStartTime = snapshot.thinkingStartTime ?? Date.now();

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            thinkingContent: snapshot.thinkingContent + content,
            thinkingStartTime,
            isThinking: true,
          },
        },
      };
    });
  },

  endThinking: (conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      const thinkingDuration = snapshot.thinkingStartTime
        ? Date.now() - snapshot.thinkingStartTime
        : undefined;

      let newMessages = snapshot.messages;
      if (snapshot.currentStreamingId) {
        newMessages = snapshot.messages.map((msg) =>
          msg.id === snapshot.currentStreamingId
            ? {
                ...msg,
                reasoning: {
                  content: snapshot.thinkingContent,
                  duration: thinkingDuration,
                },
              }
            : msg
        );
      }

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            messages: newMessages,
            isThinking: false,
          },
        },
      };
    });
  },

  appendContent: (content, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      const newContent = snapshot.currentContent + content;
      let newMessages = snapshot.messages;
      
      if (snapshot.currentStreamingId) {
        newMessages = snapshot.messages.map((msg) =>
          msg.id === snapshot.currentStreamingId
            ? { ...msg, content: newContent }
            : msg
        );
      }

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            currentContent: newContent,
            messages: newMessages,
          },
        },
      };
    });
  },

  endStreaming: (conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      let newMessages = snapshot.messages;
      if (snapshot.currentStreamingId) {
        newMessages = snapshot.messages.map((msg) =>
          msg.id === snapshot.currentStreamingId
            ? {
                ...msg,
                content: snapshot.currentContent,
                citations:
                  snapshot.currentCitations.length > 0
                    ? snapshot.currentCitations
                    : undefined,
                sources:
                  snapshot.ragSources.length > 0
                    ? snapshot.ragSources
                    : undefined,
                isStreaming: false,
              }
            : msg
        );
      }

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            messages: newMessages,
            isStreaming: false,
            currentStreamingId: null,
            ragStatus: 'idle',
            ragMessage: '',
            ragSources: [],
          },
        },
      };
    });
  },

  // =================================================================
  // METADATA & UI UTILITY ACTIONS
  // =================================================================

  setCitations: (citations, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      let newMessages = snapshot.messages;
      if (snapshot.currentStreamingId) {
        newMessages = snapshot.messages.map((msg) =>
          msg.id === snapshot.currentStreamingId ? { ...msg, citations } : msg
        );
      }

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            currentCitations: citations,
            messages: newMessages,
          },
        },
      };
    });
  },

  setQuotedText: (text) => set({ quotedText: text }),

  setError: (error, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: { ...snapshot, error, isStreaming: false },
        },
      };
    });
  },

  setTokenUsage: (usage) => set({ tokenUsage: usage }),

  resetStreamingState: (conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            isStreaming: false,
            currentStreamingId: null,
            thinkingContent: '',
            thinkingStartTime: null,
            isThinking: false,
            currentContent: '',
            currentCitations: [],
            error: null,
            ragStatus: 'idle',
            ragMessage: '',
            ragSources: [],
          },
        },
      };
    });
  },

  // =================================================================
  // MODE TOGGLES & RAG FEEDBACK
  // =================================================================
  
  toggleRag: () => set((state) => ({ useRag: !state.useRag })),
  toggleThink: () => set((state) => ({ forceThink: !state.forceThink })),

  setRagStatus: (status, message, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: {
            ...snapshot,
            ragStatus: status,
            ...(message !== undefined ? { ragMessage: message } : {}),
          },
        },
      };
    });
  },

  setRagSources: (sources, conversationId) => {
    const targetId = conversationId ?? get().activeConversationId;
    if (!targetId) return;

    set((state) => {
      const snapshot = state.conversationSnapshots[targetId];
      if (!snapshot) return state;

      return {
        conversationSnapshots: {
          ...state.conversationSnapshots,
          [targetId]: { ...snapshot, ragSources: sources },
        },
      };
    });
  },
}));
