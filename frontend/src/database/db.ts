// =================================================================
// LOCAL PERSISTENCE ENGINE (DEXIE/INDEXEDDB)
// Why: Provides a robust, browser-native storage solution that 
// enables offline-first capabilities and maintains user history 
// without requiring a persistent backend database for every interaction.
// =================================================================

import Dexie, { type EntityTable } from 'dexie';
import type { Conversation, Message, Setting } from './schema';

// =================================================================
// DATABASE INITIALIZATION
// Why: Standardizes table structures and indexing strategies to 
// optimize query performance for common chat-related operations.
// =================================================================

/**
 * PerplexityQA Database class
 * 
 * Why: Encapsulates the Dexie instance to provide type-safe access 
 * to IndexedDB tables.
 */
class PerplexityQADatabase extends Dexie {
  /** Conversations table - Stores metadata for chat sessions */
  conversations!: EntityTable<Conversation, 'id'>;
  
  /** Messages table - Stores individual message items associated with conversations */
  messages!: EntityTable<Message, 'id'>;
  
  /** Settings table - Stores application-level configuration and user preferences */
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('PerplexityQA');

    // =================================================================
    // SCHEMA VERSIONING & INDEXING
    // Why: Defines the "Single Source of Truth" for the local data 
    // structure. Proper indexing is critical for performance as the 
    // number of messages grows.
    // =================================================================
    this.version(1).stores({
      /**
       * conversations: 
       * id: Primary key
       * createdAt/updatedAt: Used for sorting the conversation list sidebar
       */
      conversations: 'id, createdAt, updatedAt',

      /**
       * messages: 
       * id: Primary key
       * conversationId: Used for fetching messages for a specific chat
       * [conversationId+createdAt]: Compound index for optimized chronological 
       * retrieval within a specific conversation.
       */
      messages: 'id, conversationId, createdAt, [conversationId+createdAt]',

      /**
       * settings: 
       * key: Primary key for quick lookup of specific settings
       */
      settings: 'key',
    });
  }
}

// =================================================================
// SINGLETON EXPORT
// Why: Ensures a single connection pool to IndexedDB, preventing 
// resource contention and synchronization issues within the browser tab.
// =================================================================
export const db = new PerplexityQADatabase();
