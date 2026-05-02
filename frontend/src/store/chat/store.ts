// =================================================================
// CHAT ZUSTAND STORE
// Why: Centralizes the management of chat interactions, specifically 
// optimizing for the high-frequency state updates required by 
// streaming responses. By using Zustand, we achieve low-latency 
// updates and precise control over component re-renders during the 
// critical LLM response phase.
// =================================================================

import { create } from 'zustand';
import { generateUUID } from '@/utils/id';
import type { ChatStore, DisplayMessage } from './types';
import type { CitationSource } from '@/components/Citations';

/**
 * Initial state for the chat store
 */
const initialState = {
  messages: [] as DisplayMessage[],
  isStreaming: false,
  currentStreamingId: null as string | null,
  thinkingContent: '',
  thinkingStartTime: null as number | null,
  isThinking: false,
  currentContent: '',
  currentCitations: [] as string[],
  quotedText: null as string | null,
  error: null as Error | null,
  tokenUsage: null as { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null,
  useRag: false,
  forceThink: false,
  ragStatus: 'idle' as 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done',
  ragMessage: '',
  ragSources: [] as CitationSource[],
};

/**
 * Chat store for managing conversation messages and streaming state
 */
export const useChatStore = create<ChatStore>((set) => ({
  ...initialState,

  // =================================================================
  // MESSAGE OPERATIONS
  // Why: Basic CRUD operations for messages. These updates trigger 
  // the MessageList component to re-render.
  // =================================================================
  
  addUserMessage: (content: string, conversationId: string) => {
    const id = generateUUID();
    const message: DisplayMessage = {
      id,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));

    return id;
  },

  addAssistantMessage: (conversationId: string) => {
    const id = generateUUID();
    const message: DisplayMessage = {
      id,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));

    return id;
  },

  updateAssistantMessage: (id: string, updates: Partial<DisplayMessage>) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },

  setMessages: (messages: DisplayMessage[]) => {
    set({ messages });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  removeMessage: (id: string) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    }));
  },

  updateMessageContent: (id: string, content: string) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content } : msg
      ),
    }));
  },

  // =================================================================
  // STREAMING LIFECYCLE MANAGEMENT
  // Why: Orchestrates the transition between different streaming 
  // phases (RAG retrieval -> Thinking -> Answering -> Done). 
  // Uses atomic state updates to prevent race conditions when chunks 
  // arrive in rapid succession.
  // =================================================================

  startStreaming: (messageId: string) => {
    set({
      isStreaming: true,
      currentStreamingId: messageId,
      thinkingContent: '',
      thinkingStartTime: null,
      isThinking: false,
      currentContent: '',
      currentCitations: [],
      error: null,
      tokenUsage: null,
      ragStatus: 'idle',
      ragMessage: '',
      ragSources: [],
    });
  },

  /**
   * Append thinking content during streaming
   */
  appendThinkingContent: (content: string) => {
    set((state) => {
      // IF: This is the first chunk of thinking content
      // Why: Record the start time to calculate the total duration 
      // of the thinking phase for the user.
      const thinkingStartTime = state.thinkingStartTime ?? Date.now();

      return {
        thinkingContent: state.thinkingContent + content,
        thinkingStartTime,
        isThinking: true,
      };
    });
  },

  /**
   * End thinking phase and update the message with reasoning content
   */
  endThinking: () => {
    set((state) => {
      const thinkingDuration = state.thinkingStartTime
        ? Date.now() - state.thinkingStartTime
        : undefined;

      // IF: We have an active streaming message ID
      // Why: Ensure the accumulated thinking content is persisted 
      // to the specific message object for history retrieval.
      if (state.currentStreamingId) {
        return {
          messages: state.messages.map((msg) =>
            msg.id === state.currentStreamingId
              ? {
                  ...msg,
                  reasoning: {
                    content: state.thinkingContent,
                    duration: thinkingDuration,
                  },
                }
              : msg
          ),
          isThinking: false,
        };
      }

      return { isThinking: false };
    });
  },

  /**
   * Append content during streaming
   */
  appendContent: (content: string) => {
    set((state) => {
      const newContent = state.currentContent + content;

      // Why: Update both the 'currentContent' tracker (for the stream parser) 
      // and the specific message object (for UI rendering) in a single 
      // atomic operation to maintain synchronization.
      return {
        currentContent: newContent,
        messages: state.currentStreamingId
          ? state.messages.map((msg) =>
              msg.id === state.currentStreamingId
                ? { ...msg, content: newContent }
                : msg
            )
          : state.messages,
      };
    });
  },

  /**
   * End streaming and finalize the message
   */
  endStreaming: () => {
    set((state) => {
      // IF: We are finishing an active stream
      // Why: Finalize all ephemeral state (isStreaming, currentStreamingId) 
      // and ensure all RAG sources and citations are permanently 
      // attached to the message object in the messages array.
      if (state.currentStreamingId) {
        return {
          messages: state.messages.map((msg) =>
            msg.id === state.currentStreamingId
              ? {
                  ...msg,
                  content: state.currentContent,
                  citations:
                    state.currentCitations.length > 0
                      ? state.currentCitations
                      : undefined,
                  sources:
                    state.ragSources.length > 0
                      ? state.ragSources
                      : undefined,
                  isStreaming: false,
                }
              : msg
          ),
          isStreaming: false,
          currentStreamingId: null,
          ragStatus: 'idle' as const,
          ragMessage: '',
          ragSources: [],
        };
      }

      return {
        isStreaming: false,
        currentStreamingId: null,
      };
    });
  },

  // =================================================================
  // METADATA & UI UTILITY ACTIONS
  // =================================================================

  setCitations: (citations: string[]) => {
    set((state) => ({
      currentCitations: citations,
      messages: state.currentStreamingId
        ? state.messages.map((msg) =>
            msg.id === state.currentStreamingId ? { ...msg, citations } : msg
          )
        : state.messages,
    }));
  },

  setQuotedText: (text: string | null) => {
    set({ quotedText: text });
  },

  setError: (error: Error | null) => {
    set({ error, isStreaming: false });
  },

  setTokenUsage: (usage) => {
    set({ tokenUsage: usage });
  },

  restoreStreamingState: (partialState) => {
    set((state) => ({ ...state, ...partialState }));
  },

  resetStreamingState: () => {
    set({
      isStreaming: false,
      currentStreamingId: null,
      thinkingContent: '',
      thinkingStartTime: null,
      isThinking: false,
      currentContent: '',
      currentCitations: [],
      quotedText: null,
      error: null,
      ragStatus: 'idle',
      ragMessage: '',
      ragSources: [],
    });
  },

  // =================================================================
  // MODE TOGGLES & RAG FEEDBACK
  // Why: Controls the active capabilities of the system and provides 
  // real-time feedback during the pre-generation retrieval phase.
  // =================================================================
  
  toggleRag: () => set((state) => ({ useRag: !state.useRag })),
  toggleThink: () => set((state) => ({ forceThink: !state.forceThink })),

  setRagStatus: (status, message) => set({ 
    ragStatus: status, 
    ...(message !== undefined ? { ragMessage: message } : {}) 
  }),
  setRagSources: (sources) => set({ ragSources: sources }),
}));

