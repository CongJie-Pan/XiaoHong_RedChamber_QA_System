// =================================================================
// CHAT STREAM API TYPE DEFINITIONS
// Why: Defines the shape of the interface between the frontend 
// and the FastAPI/LLM backend. These types strictly follow the 
// OpenAI/Perplexity-compatible streaming protocol while adding 
// custom extensions for RAG metadata and thinking traces.
// =================================================================

import type { CitationSource } from '@/components/Citations';

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Chat Stream API request body
 */
export interface ChatStreamRequest {
  /** Model to use */
  model: 'sonar-reasoning' | 'sonar' | 'sonar-pro';
  /** Array of messages in the conversation */
  messages: ChatMessage[];
  /** Enable streaming responses */
  stream?: boolean;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
  /** Top-p sampling parameter */
  top_p?: number;
  /** Frequency penalty */
  frequency_penalty?: number;
  /** Presence penalty */
  presence_penalty?: number;
}

/**
 * Search result from retrieval engine
 */
export interface SearchResult {
  /** Title of the source */
  title: string;
  /** URL of the source */
  url: string;
  /** Snippet/excerpt from the source */
  snippet: string;
}

/**
 * Token usage information
 * Why: Allows the frontend to track and display costs/usage metrics.
 */
export interface UsageInfo {
  /** Tokens used in the prompt */
  prompt_tokens: number;
  /** Tokens generated in completion */
  completion_tokens: number;
  /** Total tokens used */
  total_tokens: number;
}

/**
 * Non-streaming response choice
 */
export interface ResponseChoice {
  index: number;
  finish_reason: 'stop' | 'length' | null;
  message: {
    role: 'assistant';
    content: string;
  };
}

/**
 * Streaming response delta
 */
export interface StreamDelta {
  role?: 'assistant';
  content?: string;
}

/**
 * Streaming response choice
 */
export interface StreamChoice {
  index: number;
  delta: StreamDelta;
  finish_reason: 'stop' | 'length' | null;
}

/**
 * Chat Stream API non-streaming response
 */
export interface ChatStreamResponse {
  /** Unique response ID */
  id: string;
  /** Model used */
  model: string;
  /** Response choices */
  choices: ResponseChoice[];
  /** Citation URLs */
  citations?: string[];
  /** Detailed search results */
  search_results?: SearchResult[];
  /** Token usage */
  usage: UsageInfo;
}

/**
 * Chat Stream API streaming chunk
 */
export interface ChatStreamStreamChunk {
  /** Unique response ID */
  id: string;
  /** Model used */
  model?: string;
  /** Stream choices with delta */
  choices: StreamChoice[];
  /** Citation URLs (usually in final chunk) */
  citations?: string[];
  /** Search results (usually in final chunk) */
  search_results?: SearchResult[];
  /** Usage info (usually in final chunk) */
  usage?: UsageInfo;
}

/**
 * Parsed chunk types from the streaming parser
 * Why: Defines the logical states that the frontend UI must handle 
 * during a complex, multi-modal LLM response.
 */
export type ParsedChunkType =
  | 'thinking_start'
  | 'thinking_content'
  | 'thinking_end'
  | 'content'
  | 'done';

/**
 * Parsed chunk from the think tag parser
 */
export interface ParsedChunk {
  type: ParsedChunkType;
  content?: string;
}

/**
 * Callbacks for streaming chat responses
 * Why: Decouples the low-level network/parsing logic from the 
 * high-level state management in the Chat Service.
 */
export interface StreamCallbacks {
  /** Called when <think> tag starts */
  onThinkingStart: () => void;
  /** Called with thinking content */
  onThinkingContent: (content: string) => void;
  /** Called when </think> tag ends */
  onThinkingEnd: () => void;
  /** Called with answer content (after thinking) */
  onContent: (content: string) => void;
  /** Called with citation URLs */
  onCitations: (citations: string[]) => void;
  /** Called when stream completes */
  onDone: () => void;
  /** Called on error */
  onError: (error: Error) => void;
  /** Called when RAG pipeline status changes */
  onStatus?: (status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done', message: string) => void;
  /** Called when structured sources payload is pushed */
  onSources?: (sources: CitationSource[]) => void;
  /** Called when suggested follow-up questions are received */
  onSuggestions?: (suggestions: string[]) => void;
}

