// =================================================================
// CONVERSATION REPOSITORY
// Why: Decouples the UI and business logic from the specific 
// persistence implementation (Dexie). It provides a high-level 
// interface for managing conversation lifecycles.
// =================================================================

import { db } from '../db';
import type { Conversation } from '../schema';
import { generateUUID } from '@/utils/id';

/**
 * Repository for Conversation entities.
 * 
 * Provides atomic operations and helper methods to interact 
 * with the 'conversations' table in IndexedDB.
 */
export const conversationRepo = {
  /**
   * Creates a new conversation record.
   * 
   * Why: Initializes a fresh chat session with default values 
   * and a unique identifier.
   * 
   * @param {string} [title] - Optional title. Defaults to '新對話'.
   * @returns {Promise<Conversation>} The newly created conversation object.
   */
  async create(title?: string): Promise<Conversation> {
    const now = new Date();
    const conversation: Conversation = {
      id: generateUUID(),
      title: title || '新對話',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastMessagePreview: '',
    };
    
    // EXECUTION: Persist to IndexedDB
    await db.conversations.add(conversation);
    return conversation;
  },

  /**
   * Retrieves all conversations.
   * 
   * Why: Used to populate the conversation history list, 
   * sorted by recent activity for better user accessibility.
   * 
   * @returns {Promise<Conversation[]>} List of conversations, most recently updated first.
   */
  async getAll(): Promise<Conversation[]> {
    return db.conversations
      .orderBy('updatedAt')
      .reverse()
      .toArray();
  },

  /**
   * Retrieves a single conversation by its ID.
   * 
   * @param {string} id - The unique ID of the conversation.
   * @returns {Promise<Conversation | undefined>} The conversation object or undefined.
   */
  async getById(id: string): Promise<Conversation | undefined> {
    return db.conversations.get(id);
  },

  /**
   * Updates an existing conversation.
   * 
   * Why: Allows modifying metadata like titles or message counts 
   * while ensuring the 'updatedAt' timestamp is always refreshed.
   * 
   * @param {string} id - The ID of the conversation to update.
   * @param {Partial<Conversation>} updates - The fields to update.
   * @returns {Promise<void>}
   */
  async update(id: string, updates: Partial<Conversation>): Promise<void> {
    await db.conversations.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
  },

  /**
   * Deletes a conversation and its dependent messages.
   * 
   * Why: Ensures data integrity by removing orphan messages 
   * when a conversation is deleted. Uses a transaction for atomicity.
   * 
   * @param {string} id - The ID of the conversation to delete.
   * @returns {Promise<void>}
   */
  async delete(id: string): Promise<void> {
    // TRANSACTION: Atomic deletion of conversation and related messages
    // Why: Prevents partial deletions if the browser crashes or fails mid-operation.
    await db.transaction('rw', [db.conversations, db.messages], async () => {
      // Step 1: Remove all messages linked to this conversation
      await db.messages.where('conversationId').equals(id).delete();
      
      // Step 2: Remove the conversation itself
      await db.conversations.delete(id);
    });
  },

  /**
   * Clears all conversations and messages from the local store.
   * 
   * Why: Provides a "factory reset" capability for users to 
   * wipe their local chat history entirely.
   * 
   * @returns {Promise<void>}
   */
  async clearAll(): Promise<void> {
    // TRANSACTION: Full database wipe for chat data
    await db.transaction('rw', [db.conversations, db.messages], async () => {
      await db.messages.clear();
      await db.conversations.clear();
    });
  },
};
