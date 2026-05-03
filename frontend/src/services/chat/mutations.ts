// =================================================================
// CHAT SERVICE MUTATIONS
// Why: Handles complex operations that modify existing conversation 
// history, such as editing user messages and regenerating AI 
// responses. These operations involve both database purging and 
// triggering new LLM streams.
// =================================================================

import { useChatStore } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { createChatStream } from '@/services/chat-stream';
import { databaseService } from '@/services/database';
import { normalizeError } from '@/utils/error';
import type { CitationSource } from '@/components/Citations';
import type { Message } from '@/database/schema';
import type { ChatMessage } from '@/services/chat-stream/types';
import { getAbortController, setAbortController } from './state';
import { prepareMessagesForAPI, validateMessageContent } from './core';

/**
 * Regenerate an AI message
 * Removes the old AI message and generates a new response based on existing conversation
 */
export async function regenerateMessage(messageId: string): Promise<void> {
  const controller = getAbortController();
  if (controller) {
    controller.abort();
    setAbortController(null);
  }

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();
  const messages = chatStore.messages;

  const messageIndex = messages.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMessage = messages[messageIndex];
  if (targetMessage.role !== 'assistant') {
    throw new Error('Can only regenerate assistant messages');
  }

  const activeConversationId = conversationStore.activeConversationId;
  if (!activeConversationId) {
    throw new Error('No active conversation');
  }

  // Why: Purge the old response from store and database before 
  // generating a new one to maintain history integrity.
  chatStore.removeMessage(messageId);
  await databaseService.message.delete(messageId);

  const newController = new AbortController();
  setAbortController(newController);
  const abortSignal = newController.signal;

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  chatStore.startStreaming(assistantMessageId);

  const latestState = useChatStore.getState();
  const apiMessages = prepareMessagesForAPI(latestState.messages, assistantMessageId);

  if (apiMessages.length === 0) {
    chatStore.resetStreamingState();
    chatStore.setError(new Error('無法準備對話內容（歷史記錄為空），無法重新生成。'));
    return;
  }

  let thinkingContent = '';
  let thinkingStartTime: number | null = null;
  let answerContent = '';
  let citations: string[] = [];
  let sourcesPayload: CitationSource[] = [];
  let suggestionsList: string[] = [];

  try {
    await createChatStream(
      apiMessages,
      {
        onThinkingStart: () => {
          if (!latestState.forceThink) return;
          thinkingStartTime = Date.now();
        },

        onThinkingContent: (chunk: string) => {
          if (!latestState.forceThink) return;
          thinkingContent += chunk;
          chatStore.appendThinkingContent(chunk);
        },

        onThinkingEnd: () => {
          if (!latestState.forceThink) return;
          chatStore.endThinking();
        },

        onContent: (chunk: string) => {
          answerContent += chunk;
          chatStore.appendContent(chunk);
        },

        onCitations: (citationUrls: string[]) => {
          citations = citationUrls;
          chatStore.setCitations(citationUrls);
        },

        onStatus: (status, message) => {
          chatStore.setRagStatus(status, message);
        },

        onSources: (sources) => {
          sourcesPayload = sources;
          chatStore.setRagStatus('sources_ready');
          chatStore.setRagSources(sources);
        },

        onSuggestions: (suggestions) => {
          suggestionsList = suggestions;
          chatStore.updateAssistantMessage(assistantMessageId, { suggestions });
        },

        onDone: async () => {
          chatStore.endStreaming();

          const thinkingDuration = thinkingStartTime
            ? Date.now() - thinkingStartTime
            : undefined;

          const messageData: Omit<Message, 'id' | 'conversationId' | 'createdAt'> = {
            role: 'assistant',
            content: answerContent,
          };

          if (thinkingContent) {
            messageData.reasoning = {
              content: thinkingContent,
              duration: thinkingDuration,
            };
          }

          if (citations.length > 0) {
            messageData.citations = citations;
          }

          if (sourcesPayload.length > 0) {
            messageData.sources = sourcesPayload;
          }

          if (suggestionsList.length > 0) {
            messageData.suggestions = suggestionsList;
          }

          await databaseService.message.add(activeConversationId, messageData);
          await conversationStore.loadConversations();

          if (apiMessages.length === 1 && answerContent) {
            const titleMessages = [
              ...apiMessages,
              { role: 'assistant', content: answerContent }
            ];
            useConversationStore.getState().generateTitle(activeConversationId, titleMessages);
          }

          setAbortController(null);
        },

        onError: (error: Error) => {
          chatStore.setError(error);
          chatStore.endStreaming();
          setAbortController(null);
        },
      },
      abortSignal,
      chatStore.useRag,
      chatStore.forceThink
    );
  } catch (error) {
    setAbortController(null);
    const err = normalizeError(error);
    chatStore.setError(err);
    chatStore.endStreaming();
    throw err;
  }
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

  const controller = getAbortController();
  if (controller) {
    controller.abort();
    setAbortController(null);
  }

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();
  const messages = chatStore.messages;

  const messageIndex = messages.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const targetMessage = messages[messageIndex];
  if (targetMessage.role !== 'user') {
    throw new Error('Can only edit user messages');
  }

  const activeConversationId = conversationStore.activeConversationId;
  if (!activeConversationId) {
    throw new Error('No active conversation');
  }

  // Why: Build the API context by taking all messages before the 
  // edited one and appending the new content.
  const historyMessages = prepareMessagesForAPI(messages.slice(0, messageIndex));
  const apiMessages: ChatMessage[] = [
    ...historyMessages,
    { role: 'user', content: sanitizedContent },
  ];

  chatStore.updateMessageContent(messageId, sanitizedContent);
  await databaseService.message.update(messageId, { content: sanitizedContent });

  // Why: Remove all subsequent messages in the thread as they are 
  // now contextually invalidated by the edit.
  const messagesToRemove = messages
    .slice(messageIndex + 1)
    .filter((msg) => msg.role === 'assistant');

  for (const msg of messagesToRemove) {
    chatStore.removeMessage(msg.id);
    await databaseService.message.delete(msg.id);
  }

  const newController = new AbortController();
  setAbortController(newController);
  const abortSignal = newController.signal;

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  chatStore.startStreaming(assistantMessageId);

  const latestState = useChatStore.getState();
  let thinkingContent = '';
  let thinkingStartTime: number | null = null;
  let answerContent = '';
  let citations: string[] = [];
  let sourcesPayload: CitationSource[] = [];
  let suggestionsList: string[] = [];

  try {
    await createChatStream(
      apiMessages,
      {
        onThinkingStart: () => {
          if (!latestState.forceThink) return;
          thinkingStartTime = Date.now();
        },

        onThinkingContent: (chunk: string) => {
          if (!latestState.forceThink) return;
          thinkingContent += chunk;
          chatStore.appendThinkingContent(chunk);
        },

        onThinkingEnd: () => {
          if (!latestState.forceThink) return;
          chatStore.endThinking();
        },

        onContent: (chunk: string) => {
          answerContent += chunk;
          chatStore.appendContent(chunk);
        },

        onCitations: (citationUrls: string[]) => {
          citations = citationUrls;
          chatStore.setCitations(citationUrls);
        },

        onStatus: (status, message) => {
          chatStore.setRagStatus(status, message);
        },

        onSources: (sources) => {
          sourcesPayload = sources;
          chatStore.setRagStatus('sources_ready');
          chatStore.setRagSources(sources);
        },

        onSuggestions: (suggestions) => {
          suggestionsList = suggestions;
          chatStore.updateAssistantMessage(assistantMessageId, { suggestions });
        },

        onDone: async () => {
          chatStore.endStreaming();

          const thinkingDuration = thinkingStartTime
            ? Date.now() - thinkingStartTime
            : undefined;

          const messageData: Omit<Message, 'id' | 'conversationId' | 'createdAt'> = {
            role: 'assistant',
            content: answerContent,
          };

          if (thinkingContent) {
            messageData.reasoning = {
              content: thinkingContent,
              duration: thinkingDuration,
            };
          }

          if (citations.length > 0) {
            messageData.citations = citations;
          }

          if (sourcesPayload.length > 0) {
            messageData.sources = sourcesPayload;
          }

          if (suggestionsList.length > 0) {
            messageData.suggestions = suggestionsList;
          }

          await databaseService.message.add(activeConversationId, messageData);
          await conversationStore.loadConversations();

          if (apiMessages.length === 1 && answerContent) {
            const titleMessages = [
              ...apiMessages,
              { role: 'assistant', content: answerContent }
            ];
            useConversationStore.getState().generateTitle(activeConversationId, titleMessages);
          }

          setAbortController(null);
        },

        onError: (error: Error) => {
          chatStore.setError(error);
          chatStore.endStreaming();
          setAbortController(null);
        },
      },
      abortSignal,
      chatStore.useRag,
      chatStore.forceThink
    );
  } catch (error) {
    setAbortController(null);
    const err = normalizeError(error);
    chatStore.setError(err);
    chatStore.endStreaming();
    throw err;
  }
}
