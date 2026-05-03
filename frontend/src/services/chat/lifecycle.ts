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
import type { Message } from '@/database/schema';
import { getAbortController, setAbortController } from './state';

/**
 * Cancel the current streaming request
 * Safe to call even if no request is in progress
 * Preserves accumulated thinking content if stopped during thinking phase
 * Saves partial response to database to prevent data loss
 */
export async function cancelCurrentStream(): Promise<void> {
  const controller = getAbortController();
  
  // IF: A stream is active
  // Why: Stop the ongoing network request immediately.
  if (controller) {
    controller.abort();
    setAbortController(null);
  }

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();

  const streamingMessageId = chatStore.currentStreamingId;
  const hasThinkingContent = chatStore.isThinking && chatStore.thinkingContent;
  const thinkingContent = chatStore.thinkingContent;
  const thinkingStartTime = chatStore.thinkingStartTime;
  const currentContent = chatStore.currentContent;

  // IF: Was stopped during thinking phase
  // Why: Ensure the thinking state is correctly closed in the UI 
  // to prevent a "stuck" loading indicator.
  if (hasThinkingContent) {
    chatStore.endThinking();
  }

  chatStore.endStreaming();

  // IF: Partially received content exists
  // Why: Save the partial response to the database to ensure 
  // the user doesn't lose context from an interrupted long generation.
  const activeConversationId = conversationStore.activeConversationId;
  if (streamingMessageId && activeConversationId) {
    try {
      const messageData: Omit<Message, 'id' | 'conversationId' | 'createdAt'> = {
        role: 'assistant',
        content: currentContent || '',
      };

      if (thinkingContent) {
        const thinkingDuration = thinkingStartTime
          ? Date.now() - thinkingStartTime
          : undefined;
        messageData.reasoning = {
          content: thinkingContent,
          duration: thinkingDuration,
        };
      }

      await databaseService.message.add(activeConversationId, messageData);
    } catch (error) {
      console.error('Failed to save partial message on cancel:', error);
    }
  }

  chatStore.resetStreamingState();
}

/**
 * Load messages for a conversation
 * @param conversationId - Conversation ID
 */
export async function loadMessages(conversationId: string): Promise<void> {
  const chatStore = useChatStore.getState();

  // Why: Aggressively clear UI state before loading new data to 
  // prevent "ghosting" of the previous conversation's content.
  chatStore.clearMessages();
  chatStore.resetStreamingState();

  try {
    const messages = await databaseService.message.getByConversationId(conversationId);
    chatStore.setMessages(messages);
  } catch (error) {
    const err = normalizeError(error);
    chatStore.setError(err);
    throw err;
  }
}

/**
 * Start a new conversation
 * Clears current messages and creates new conversation
 * @returns New conversation ID
 */
export async function startNewConversation(): Promise<string> {
  await cancelCurrentStream();

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();

  chatStore.clearMessages();
  chatStore.resetStreamingState();

  const conversationId = await conversationStore.createConversation();
  return conversationId;
}

/**
 * Switch to a different conversation
 * @param conversationId - Conversation ID to switch to
 */
export async function switchConversation(conversationId: string): Promise<void> {
  await cancelCurrentStream();

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();

  chatStore.clearMessages();
  chatStore.resetStreamingState();

  conversationStore.selectConversation(conversationId);
  await loadMessages(conversationId);
}

/**
 * Delete current conversation and switch to another
 * @param conversationId - Conversation ID to delete
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const conversationStore = useConversationStore.getState();
  const chatStore = useChatStore.getState();
  const wasActiveConversation = conversationStore.activeConversationId === conversationId;

  // IF: Deleting the currently viewed conversation
  // Why: Clean up UI state immediately to avoid displaying data 
  // that is about to be purged from the database.
  if (wasActiveConversation) {
    await cancelCurrentStream();
    chatStore.clearMessages();
    chatStore.resetStreamingState();
  }

  await conversationStore.deleteConversation(conversationId);

  if (wasActiveConversation) {
    chatStore.clearMessages();
    chatStore.resetStreamingState();
  }
}

/**
 * Initialize chat service
 * Loads conversations on app start
 */
export async function initializeChatService(): Promise<void> {
  const conversationStore = useConversationStore.getState();
  await conversationStore.loadConversations();
}
