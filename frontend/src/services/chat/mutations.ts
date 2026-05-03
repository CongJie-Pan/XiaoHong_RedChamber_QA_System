// =================================================================
// CHAT SERVICE MUTATIONS
// Why: Handles complex operations that modify existing conversation 
// history, such as editing user messages and regenerating AI 
// responses. These operations involve both database purging and 
// triggering new LLM streams.
// =================================================================

import { useChatStore } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { databaseService } from '@/services/database';
import type { ChatMessage } from '@/services/chat-stream/types';
import { prepareMessagesForAPI, validateMessageContent } from './core';

import { streamManager } from './StreamManager';
import { chatSelectors } from '@/store/chat/selectors';

/**
 * Regenerate an AI message
 */
export async function regenerateMessage(messageId: string): Promise<void> {
  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();
  
  const activeConversationId = conversationStore.activeConversationId;
  if (!activeConversationId) {
    throw new Error('No active conversation');
  }

  const messages = chatSelectors.displayMessages(chatStore);
  const messageIndex = messages.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMessage = messages[messageIndex];
  if (targetMessage.role !== 'assistant') {
    throw new Error('Can only regenerate assistant messages');
  }

  // Why: Abort any existing stream for this conversation.
  streamManager.abort(activeConversationId);

  // Why: Purge the old response.
  chatStore.removeMessage(messageId, activeConversationId);
  await databaseService.message.delete(messageId);

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  chatStore.startStreaming(assistantMessageId, activeConversationId);

  const snap = chatStore.conversationSnapshots[activeConversationId];
  const apiMessages = prepareMessagesForAPI(snap?.messages || [], assistantMessageId);

  if (apiMessages.length === 0) {
    chatStore.resetStreamingState(activeConversationId);
    chatStore.setError(new Error('無法準備對話內容（歷史記錄為空），無法重新生成。'), activeConversationId);
    return;
  }

  // Start the stream via StreamManager
  await streamManager.startStream(
    activeConversationId,
    assistantMessageId,
    apiMessages,
    chatStore.useRag,
    chatStore.forceThink
  );

  const unsubscribe = streamManager.subscribe(activeConversationId, (update) => {
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
        if (apiMessages.length === 1) {
           const finalContent = streamManager.getSessionState(activeConversationId!)?.content || '';
           const titleMessages = [
              ...apiMessages,
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

/**
 * Edit a user message and regenerate the AI response
 */
export async function editUserMessage(
  messageId: string,
  newContent: string
): Promise<void> {
  validateMessageContent(newContent);
  const sanitizedContent = newContent.trim();

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();
  
  const activeConversationId = conversationStore.activeConversationId;
  if (!activeConversationId) {
    throw new Error('No active conversation');
  }

  const messages = chatSelectors.displayMessages(chatStore);
  const messageIndex = messages.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMessage = messages[messageIndex];
  if (targetMessage.role !== 'user') {
    throw new Error('Can only edit user messages');
  }

  // Why: Abort any existing stream for this conversation.
  streamManager.abort(activeConversationId);

  const historyMessages = prepareMessagesForAPI(messages.slice(0, messageIndex));
  const apiMessages: ChatMessage[] = [
    ...historyMessages,
    { role: 'user', content: sanitizedContent },
  ];

  chatStore.updateMessageContent(messageId, sanitizedContent, activeConversationId);
  await databaseService.message.update(messageId, { content: sanitizedContent });

  const messagesToRemove = messages
    .slice(messageIndex + 1)
    .filter((msg) => msg.role === 'assistant');

  for (const msg of messagesToRemove) {
    chatStore.removeMessage(msg.id, activeConversationId);
    await databaseService.message.delete(msg.id);
  }

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  chatStore.startStreaming(assistantMessageId, activeConversationId);

  // Start the stream via StreamManager
  await streamManager.startStream(
    activeConversationId,
    assistantMessageId,
    apiMessages,
    chatStore.useRag,
    chatStore.forceThink
  );

  const unsubscribe = streamManager.subscribe(activeConversationId, (update) => {
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
        if (apiMessages.length === 1) {
           const finalContent = streamManager.getSessionState(activeConversationId!)?.content || '';
           const titleMessages = [
              ...apiMessages,
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

