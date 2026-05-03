// =================================================================
// CHAT SERVICE LIFECYCLE MANAGEMENT
// Why: Handles the high-level orchestration of conversation states, 
// including initialization, switching between threads, and cleaning 
// up active streams. This separates navigation and management 
// logic from the core message processing.
// =================================================================

import { useChatStore } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { databaseService } from '@/services/database';
import { normalizeError } from '@/utils/error';
import { streamManager } from './StreamManager';

/**
 * Cancel the current streaming request
 */
export async function cancelCurrentStream(conversationId?: string): Promise<void> {
  const chatStore = useChatStore.getState();
  const targetId = conversationId ?? chatStore.activeConversationId;
  
  if (targetId) {
    streamManager.abort(targetId);
    chatStore.resetStreamingState(targetId);
  }
}

/**
 * Load messages for a conversation
 * Note: Now primarily used for pre-loading or manual refresh, 
 * useConversationSwitch handles the main sync.
 */
export async function loadMessages(conversationId: string): Promise<void> {
  const chatStore = useChatStore.getState();

  try {
    const messages = await databaseService.message.getByConversationId(conversationId);
    chatStore.setMessages(messages, conversationId);
  } catch (error) {
    const err = normalizeError(error);
    chatStore.setError(err, conversationId);
    throw err;
  }
}

/**
 * Start a new conversation
 */
export async function startNewConversation(): Promise<string> {
  const conversationStore = useConversationStore.getState();
  const chatStore = useChatStore.getState();

  const conversationId = await conversationStore.createConversation();
  
  // Initialize snapshot
  chatStore.setActiveConversation(conversationId);
  
  return conversationId;
}

/**
 * Switch to a different conversation
 * @param conversationId - Conversation ID to switch to
 */
export async function switchConversation(conversationId: string): Promise<void> {
  const conversationStore = useConversationStore.getState();
  const chatStore = useChatStore.getState();

  // Why: Just update the pointer. useConversationSwitch hook in the 
  // UI container will detect the change and handle data sync.
  conversationStore.selectConversation(conversationId);
  chatStore.setActiveConversation(conversationId);
}

/**
 * Delete current conversation and switch to another
 * @param conversationId - Conversation ID to delete
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const conversationStore = useConversationStore.getState();
  
  // Abort if streaming
  streamManager.abort(conversationId);

  await conversationStore.deleteConversation(conversationId);
}

/**
 * Initialize chat service
 */
export async function initializeChatService(): Promise<void> {
  const conversationStore = useConversationStore.getState();
  await conversationStore.loadConversations();
}

