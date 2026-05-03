// =================================================================
// CHAT SERVICE CORE LOGIC
// Why: Encapsulates the fundamental logic for preparing, validating, 
// and sending messages to the LLM backend. This module handles the 
// orchestration of the real-time streaming response and its 
// immediate side effects on the application state and database.
// =================================================================

import { API_CONFIG } from '@/config/api';
import { useChatStore } from '@/store/chat';
import type { DisplayMessage } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { databaseService } from '@/services/database';
import { ValidationError } from '@/utils/error';
import { sanitizeMessagesForAPI } from '@/utils/sanitizer';
import type { ChatMessage } from '@/services/chat-stream/types';

/**
 * Prepare messages for API by filtering out invalid messages
 * @param messages - Raw messages from store
 * @param excludeMessageId - Optional message ID to exclude
 * @returns Filtered messages ready for API
 */
export function prepareMessagesForAPI(
  messages: DisplayMessage[],
  excludeMessageId?: string
): ChatMessage[] {
  const mappedMessages = messages
    // Why: Filter out the temporary placeholder message that will 
    // be replaced by the stream content.
    .filter((msg) => !excludeMessageId || msg.id !== excludeMessageId)
    // Why: Remove empty assistant messages that might have been 
    // created during a cancelled stream.
    .filter((msg) => !(msg.role === 'assistant' && msg.content.trim() === ''))
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })) as ChatMessage[];
    
  // Why: Apply final sanitization (removing <think> blocks) to optimize 
  // token usage and prompt clarity.
  return sanitizeMessagesForAPI(mappedMessages) as ChatMessage[];
}

/**
 * Validate message content before sending
 * @param content - Message content to validate
 * @throws ValidationError if content is invalid
 */
export function validateMessageContent(content: string): void {
  // IF: Content is missing
  // Why: Prevent sending empty requests to the server.
  if (!content) {
    throw new ValidationError('Message content is required', 'content');
  }

  const trimmedContent = content.trim();

  // IF: Content is only whitespace or too short
  // Why: Ensure the query is substantial enough to process.
  if (trimmedContent.length < API_CONFIG.minMessageLength) {
    throw new ValidationError('Message cannot be empty', 'content');
  }

  // IF: Content exceeds maximum allowed size
  // Why: Prevent payload issues and protect LLM context limits.
  if (trimmedContent.length > API_CONFIG.maxMessageLength) {
    throw new ValidationError(
      `Message is too long (max ${API_CONFIG.maxMessageLength} characters)`,
      'content'
    );
  }
}

import { streamManager } from './StreamManager';

/**
 * Send a message and handle streaming response
 * @param content - User message content
 * @param conversationId - Optional conversation ID
 */
export async function sendMessage(
  content: string,
  conversationId?: string
): Promise<void> {
  validateMessageContent(content);
  const sanitizedContent = content.trim();

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();

  let activeConversationId = conversationId ?? conversationStore.activeConversationId;
  let isNewConversation = false;

  // IF: No active conversation ID
  // Why: Lazily create a new conversation record in the database 
  // only when the first message is sent.
  if (!activeConversationId) {
    isNewConversation = true;
    const conversation = await databaseService.conversation.create();
    activeConversationId = conversation.id;
    
    useConversationStore.setState((state) => ({
      conversations: [conversation, ...state.conversations],
    }));
  }

  // Why: Add user message to store and persist to DB immediately 
  // to ensure user intent is saved even if the stream fails.
  chatStore.addUserMessage(sanitizedContent, activeConversationId);
  await databaseService.message.add(activeConversationId, {
    role: 'user',
    content: sanitizedContent,
  });

  // IF: This is a newly created conversation
  // Why: Update the global active selection in the sidebar.
  if (isNewConversation) {
    conversationStore.selectConversation(activeConversationId);
    chatStore.setActiveConversation(activeConversationId);
  }

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  
  // Initialize snapshot and start streaming state
  chatStore.startStreaming(assistantMessageId, activeConversationId);

  const snap = chatStore.conversationSnapshots[activeConversationId];
  const messages = prepareMessagesForAPI(snap?.messages || [], assistantMessageId);

  // IF: Store state update was delayed
  // Why: Robustness check to ensure we always have at least 
  // the current message.
  if (messages.length === 0 && sanitizedContent) {
    // We use a simple fallback if message list is somehow empty
    const fallbackMessages = [{
      role: 'user' as const,
      content: sanitizedContent
    }];
    
    // Start the stream via StreamManager
    await streamManager.startStream(
      activeConversationId,
      assistantMessageId,
      fallbackMessages,
      chatStore.useRag,
      chatStore.forceThink
    );
  } else if (messages.length > 0) {
    // Start the stream via StreamManager
    await streamManager.startStream(
      activeConversationId,
      assistantMessageId,
      messages,
      chatStore.useRag,
      chatStore.forceThink
    );
  } else {
    chatStore.resetStreamingState(activeConversationId);
    chatStore.setError(new Error('無法準備對話內容，請重新嘗試。'), activeConversationId);
    return;
  }

  // Subscribe the UI to updates for this conversation
  // Note: useConversationSwitch also subscribes, but we need an immediate 
  // link here to ensure the very first chunks are captured if they arrive 
  // before the hook re-runs.
  const unsubscribe = streamManager.subscribe(activeConversationId, (update) => {
    // Why: Use specific conversationId to target the correct snapshot.
    // This allows the store to be updated even if the user switches away.
    switch (update.type) {
      case 'content':
        if (update.chunk) chatStore.appendContent(update.chunk, activeConversationId);
        break;
      case 'thinking':
        if (update.chunk) chatStore.appendThinkingContent(update.chunk, activeConversationId);
        break;
      case 'thinking_end':
        chatStore.endThinking(activeConversationId);
        break;
      case 'citations':
        if (update.citations) chatStore.setCitations(update.citations, activeConversationId);
        break;
      case 'status':
        chatStore.setRagStatus(update.status ?? 'idle', update.message, activeConversationId);
        break;
      case 'sources':
        if (update.sources) chatStore.setRagSources(update.sources, activeConversationId);
        break;
      case 'suggestions':
        if (update.suggestions) chatStore.updateAssistantMessage(assistantMessageId, { suggestions: update.suggestions }, activeConversationId);
        break;
      case 'done':
        chatStore.endStreaming(activeConversationId, update.suggestions);
        // Trigger title generation if first message
        if (messages.length === 1 || (messages.length === 0 && sanitizedContent)) {
           const finalContent = streamManager.getSessionState(activeConversationId!)?.content || '';
           const titleMessages = [
              { role: 'user' as const, content: sanitizedContent },
              { role: 'assistant' as const, content: finalContent }
           ];
           useConversationStore.getState().generateTitle(activeConversationId!, titleMessages);
        }
        unsubscribe();
        break;
      case 'error':
        if (update.error) chatStore.setError(update.error, activeConversationId);
        unsubscribe();
        break;
    }
  });
}

