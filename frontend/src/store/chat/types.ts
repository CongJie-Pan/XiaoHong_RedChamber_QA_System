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
 * Conversation snapshot for UI state persistence
 * Why: Captures the full UI state of a conversation, including 
 * transient streaming data, to allow for background processing 
 * and seamless conversation switching.
 */
export interface ConversationSnapshot {
  // Message state
  messages: DisplayMessage[];

  // Streaming & Thinking state
  isStreaming: boolean;
  currentStreamingId: string | null;
  thinkingContent: string;
  thinkingStartTime: number | null;
  isThinking: boolean;
  currentContent: string;
  currentCitations: string[];

  // RAG Visualization State
  ragStatus: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
  ragMessage: string;
  ragSources: CitationSource[];

  // Error state
  error: Error | null;
}

/**
 * Chat state managed by Zustand
 */
export interface ChatState {
  /** Map of conversation states indexed by conversationId */
  conversationSnapshots: Record<string, ConversationSnapshot>;
  
  /** Currently active conversation ID */
  activeConversationId: string | null;

  /** Selected text for quoting in ChatInput (global across sessions) */
  quotedText: string | null;

  /** Token usage metrics (global or active) */
  tokenUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;

  // Toggle modes (global settings)
  useRag: boolean;
  forceThink: boolean;
}

/**
 * Chat actions for store manipulation
 */
export interface ChatActions {
  // =================================================================
  // SNAPSHOT OPERATIONS
  // =================================================================
  /** Set the active conversation and initialize snapshot if missing */
  setActiveConversation: (id: string | null) => void;
  /** Initialize or update a snapshot for a conversation */
  setSnapshot: (id: string, snapshot: Partial<ConversationSnapshot>) => void;
  /** Prune old snapshots to save memory */
  pruneSnapshots: () => void;

  // =================================================================
  // MESSAGE OPERATIONS (Target active snapshot)
  // =================================================================
  addUserMessage: (content: string, conversationId: string) => string;
  addAssistantMessage: (conversationId: string) => string;
  updateAssistantMessage: (id: string, updates: Partial<DisplayMessage>, conversationId?: string) => void;
  setMessages: (messages: DisplayMessage[], conversationId?: string) => void;
  clearMessages: (conversationId?: string) => void;
  removeMessage: (id: string, conversationId?: string) => void;
  updateMessageContent: (id: string, content: string, conversationId?: string) => void;

  // =================================================================
  // STREAMING LIFECYCLE (Target active snapshot)
  // =================================================================
  startStreaming: (messageId: string, conversationId?: string) => void;
  appendThinkingContent: (content: string, conversationId?: string) => void;
  endThinking: (conversationId?: string) => void;
  appendContent: (content: string, conversationId?: string) => void;
  endStreaming: (conversationId?: string, suggestions?: string[]) => void;

  // =================================================================
  // METADATA & UTILITY ACTIONS
  // =================================================================
  setCitations: (citations: string[], conversationId?: string) => void;
  setQuotedText: (text: string | null) => void;
  setError: (error: Error | null, conversationId?: string) => void;
  setTokenUsage: (usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => void;
  resetStreamingState: (conversationId?: string) => void;

  // =================================================================
  // MODE & RAG ACTIONS
  // =================================================================
  toggleRag: () => void;
  toggleThink: () => void;
  setRagStatus: (status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done', message?: string, conversationId?: string) => void;
  setRagSources: (sources: CitationSource[], conversationId?: string) => void;
}

/**
 * Combined Chat Store type
 */
export type ChatStore = ChatState & ChatActions;

