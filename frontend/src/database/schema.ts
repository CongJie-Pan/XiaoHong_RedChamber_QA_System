// =================================================================
// DATABASE SCHEMA DEFINITIONS
// Why: Defines the data structures for local persistence, ensuring 
// type safety and architectural consistency across the repository 
// and service layers.
// =================================================================

/**
 * Conversation entity
 * 
 * Why: Represents a high-level chat session, containing metadata 
 * required for UI list rendering and session management.
 */
export interface Conversation {
  /** UUID v4 - Unique identifier for the conversation session */
  id: string;
  
  /** 
   * User-friendly title
   * Why: Usually auto-generated from the first message to provide 
   * context in the navigation sidebar.
   */
  title: string;
  
  /** Timestamp of when the conversation was initiated */
  createdAt: Date;
  
  /** 
   * Timestamp of the most recent message or title update
   * Why: Critical for sorting conversations by "last active" status.
   */
  updatedAt: Date;
  
  /** 
   * Total count of messages in this conversation
   * Why: Denormalized for performance, avoiding expensive COUNT(*) 
   * queries during list rendering.
   */
  messageCount: number;
  
  /** 
   * Snippet of the latest message content
   * Why: Provides a visual preview in the sidebar for better UX.
   */
  lastMessagePreview: string;
}

/**
 * Message entity
 * 
 * Why: The fundamental unit of data in the system, capturing 
 * user inputs, AI responses, and retrieval-augmented metadata.
 */
export interface Message {
  /** UUID v4 - Unique identifier for the message */
  id: string;
  
  /** 
   * Foreign key to the parent conversation
   * Why: Enables relational mapping within the document-oriented IndexedDB.
   */
  conversationId: string;
  
  /** 
   * The role of the message sender
   * Why: Distinguishes between system instructions, user queries, 
   * and AI generated content.
   */
  role: 'user' | 'assistant' | 'system';
  
  /** The actual text content of the message */
  content: string;
  
  /** 
   * AI reasoning/thinking process metadata
   * Why: Captures the Chain-of-Thought (CoT) data separately for 
   * specialized UI rendering (ThinkingPanel).
   */
  reasoning?: {
    /** The raw thinking process text */
    content: string;
    /** How long the model spent in the 'thinking' state */
    duration?: number;
  };
  
  /** 
   * Direct citation URLs
   * Why: Provides quick links to the source material mentioned in the response.
   */
  citations?: string[];
  
  /** 
   * Detailed search result snapshots
   * Why: Preserves the context used for RAG at the time of generation, 
   * allowing for accurate citation cards later.
   */
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  
  /** 
   * Structured RAG sources from the retrieval engine
   * Why: Includes retrieval scores and chunk IDs for technical 
   * verification of source quality.
   */
  sources?: Array<{
    title: string;
    snippet: string;
    score: number;
    chunk_id: string;
  }>;
  
  /** 
   * Suggested follow-up questions
   * Why: Enhances interactivity by predicting what the user might ask next.
   */
  suggestions?: string[];
  
  /** 
   * Token and context usage metrics
   * Why: Monitors cost and performance, and helps debug context window issues.
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    searchContextSize: 'low' | 'medium' | 'high';
  };
  
  /** Timestamp of when the message was recorded */
  createdAt: Date;
}

/**
 * Setting entity
 * 
 * Why: Provides a key-value store for application-wide configurations 
 * that need to persist across browser refreshes.
 */
export interface Setting {
  /** The unique key identifying the setting */
  key: string;
  
  /** 
   * The setting value
   * Why: Uses 'unknown' to allow for various JSON-serializable types 
   * while requiring type-assertion on retrieval for safety.
   */
  value: unknown;
  
  /** Last time the setting was modified */
  updatedAt: Date;
}
