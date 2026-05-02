// =================================================================
// MESSAGE REPOSITORY
// Why: Manages the lifecycle of individual messages and handles 
// the synchronization of denormalized statistics in the parent 
// Conversation entity.
// =================================================================

import { db } from '../db';
import type { Message } from '../schema';
import { generateUUID } from '@/utils/id';

/**
 * Repository for Message entities.
 * 
 * Provides methods for chronological retrieval and atomic 
 * state updates that affect both messages and conversations.
 */
export const messageRepo = {
  /**
   * Adds a new message to a conversation.
   * 
   * Why: This is a complex operation that must persist the message 
   * AND update the parent conversation's metadata (count, preview, timestamp)
   * in a single atomic transaction.
   * 
   * @param {string} conversationId - The ID of the conversation.
   * @param {Omit<Message, 'id' | 'conversationId' | 'createdAt'>} messageData - The message payload.
   * @returns {Promise<Message>} The created message object.
   */
  async add(
    conversationId: string,
    messageData: Omit<Message, 'id' | 'conversationId' | 'createdAt'>
  ): Promise<Message> {
    const message: Message = {
      id: generateUUID(),
      conversationId,
      ...messageData,
      createdAt: new Date(),
    };

    // TRANSACTION: Write message and update conversation metadata
    // Why: Ensures that the conversation sidebar stays in sync with 
    // the actual message content.
    await db.transaction('rw', [db.messages, db.conversations], async () => {
      // Step 1: Persist the message
      await db.messages.add(message);

      // Step 2: Update parent conversation atomically
      // Why: Using .modify() ensures we work with the latest state and 
      // prevents lost updates in concurrent scenarios.
      await db.conversations
        .where('id')
        .equals(conversationId)
        .modify((conv) => {
          // Increment message count
          conv.messageCount = (conv.messageCount || 0) + 1;
          
          // Update the preview for the sidebar
          conv.lastMessagePreview = message.content.slice(0, 100);
          
          // Refresh activity timestamp
          conv.updatedAt = new Date();
        });
    });

    return message;
  },

  /**
   * Retrieves messages for a specific conversation.
   * 
   * Why: Essential for rendering the chat history in the UI. 
   * Uses sorting to ensure chronological order.
   * 
   * @param {string} conversationId - The conversation ID.
   * @returns {Promise<Message[]>} Array of messages in chronological order.
   */
  async getByConversationId(conversationId: string): Promise<Message[]> {
    return db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
  },

  /**
   * Updates an existing message.
   * 
   * Why: Useful for patching messages with AI reasoning, 
   * citations, or source metadata as they become available.
   * 
   * @param {string} id - The unique ID of the message.
   * @param {Partial<Message>} updates - The fields to update.
   * @returns {Promise<void>}
   */
  async update(id: string, updates: Partial<Message>): Promise<void> {
    await db.messages.update(id, updates);
  },

  /**
   * Deletes a single message.
   * 
   * Why: Allows users to remove specific entries while 
   * maintaining accurate message counts in the parent conversation.
   * 
   * @param {string} id - The ID of the message to delete.
   * @returns {Promise<void>}
   */
  async delete(id: string): Promise<void> {
    const message = await db.messages.get(id);
    if (!message) return;

    // TRANSACTION: Atomic delete and count decrement
    await db.transaction('rw', [db.messages, db.conversations], async () => {
      // Step 1: Remove the message
      await db.messages.delete(id);

      // Step 2: Decrement the conversation message count
      // Why: Keeps the denormalized count accurate after a deletion.
      await db.conversations
        .where('id')
        .equals(message.conversationId)
        .modify((conv) => {
          conv.messageCount = Math.max(0, (conv.messageCount || 1) - 1);
          conv.updatedAt = new Date();
        });
    });
  },

  /**
   * Deletes all messages for a specific conversation.
   * 
   * Why: Used when clearing a single chat history but 
   * keeping the conversation record itself.
   * 
   * @param {string} conversationId - The ID of the conversation.
   * @returns {Promise<void>}
   */
  async deleteByConversationId(conversationId: string): Promise<void> {
    await db.transaction('rw', [db.messages, db.conversations], async () => {
      // Step 1: Wipe all messages for this ID
      await db.messages.where('conversationId').equals(conversationId).delete();

      // Step 2: Reset conversation metadata
      await db.conversations
        .where('id')
        .equals(conversationId)
        .modify((conv) => {
          conv.messageCount = 0;
          conv.lastMessagePreview = '';
          conv.updatedAt = new Date();
        });
    });
  },
};
