// =================================================================
// CHAT STORE TYPE DEFINITIONS
// Why: Defines the structural contract for the chat state and actions 
// within the Zustand store. These types ensure type safety across 
// the chat components, specifically handling the complexity of 
// multi-modal streaming responses (thinking vs. content) and 
// RAG-specific metadata.
// =================================================================

import type { Message } from '@/database/schema';
import type { CitationSource } from '@/components/Citations';

/**
 * Display message for UI rendering
 * Why: Extends the core database model with UI-specific ephemeral 
 * properties like 'isStreaming' to provide real-time feedback.
 */
export interface DisplayMessage extends Message {
  /** Whether this message is currently being streamed */
  isStreaming?: boolean;
  /** Suggested follow-up questions */
  suggestions?: string[];
}

/**
 * Thinking state information
 * Why: Tracks the duration and content of the model's 'Chain of Thought' 
 * (CoT) phase to allow the UI to show accurate timing and progress.
 */
export interface ThinkingState {
  /** Accumulated thinking content */
  content: string;
  /** Whether AI is currently in thinking phase */
  isThinking: boolean;
  /** Timestamp when thinking started */
  startTime: number | null;
  /** Calculated duration in milliseconds */
  duration?: number;
}

/**
 * Chat state managed by Zustand
 */
export interface ChatState {
  // =================================================================
  // CORE MESSAGE STATE
  // =================================================================
  /** All messages in current conversation */
  messages: DisplayMessage[];

  // =================================================================
  // STREAMING & THINKING STATE
  // Why: Manages the split-stream logic where thinking and content 
  // are received asynchronously and must be kept in sync with the 
  // UI's ThinkingPanel and MessageList.
  // =================================================================
  /** Whether currently receiving streamed response */
  isStreaming: boolean;
  /** ID of message currently being streamed */
  currentStreamingId: string | null;
  /** Accumulated thinking content */
  thinkingContent: string;
  /** Timestamp when thinking started */
  thinkingStartTime: number | null;
  /** Whether AI is in thinking phase */
  isThinking: boolean;
  /** Accumulated answer content */
  currentContent: string;
  /** Citation URLs from response */
  currentCitations: string[];

  // =================================================================
  // INTERACTION & UTILITY STATE
  // =================================================================
  /** Selected text for quoting in ChatInput */
  quotedText: string | null;
  /** Current error if any */
  error: Error | null;
  /** Token usage from the backend */
  tokenUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;

  // =================================================================
  // SYSTEM MODES
  // =================================================================
  /** Whether explicitly requesting RAG contextual augmentation */
  useRag: boolean;
  /** Whether explicitly forcing the model to wrap reasoning in <think> */
  forceThink: boolean;

  // =================================================================
  // RAG VISUALIZATION STATE
  // Why: Provides granular feedback about the background RAG pipeline 
  // (dense/sparse search, reranking) before the first tokens arrive.
  // =================================================================
  /** Current phase of the RAG retrieval pipeline */
  ragStatus: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
  /** RAG domain-specific status message */
  ragMessage: string;
  /** Detailed RAG sources payload containing snippets and scores */
  ragSources: CitationSource[];
}

/**
 * Chat actions for store manipulation
 */
export interface ChatActions {
  // =================================================================
  // MESSAGE OPERATIONS
  // =================================================================
  addUserMessage: (content: string, conversationId: string) => string;
  addAssistantMessage: (conversationId: string) => string;
  updateAssistantMessage: (id: string, updates: Partial<DisplayMessage>) => void;
  setMessages: (messages: DisplayMessage[]) => void;
  clearMessages: () => void;
  removeMessage: (id: string) => void;
  updateMessageContent: (id: string, content: string) => void;

  // =================================================================
  // STREAMING LIFECYCLE
  // =================================================================
  startStreaming: (messageId: string) => void;
  appendThinkingContent: (content: string) => void;
  endThinking: () => void;
  appendContent: (content: string) => void;
  endStreaming: () => void;

  // =================================================================
  // METADATA & UTILITY ACTIONS
  // =================================================================
  setCitations: (citations: string[]) => void;
  setQuotedText: (text: string | null) => void;
  setError: (error: Error | null) => void;
  setTokenUsage: (usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => void;
  resetStreamingState: () => void;
  restoreStreamingState: (state: Partial<ChatState>) => void;

  // =================================================================
  // MODE & RAG ACTIONS
  // =================================================================
  toggleRag: () => void;
  toggleThink: () => void;
  setRagStatus: (status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done', message?: string) => void;
  setRagSources: (sources: CitationSource[]) => void;
}

/**
 * Combined Chat Store type
 */
export type ChatStore = ChatState & ChatActions;

