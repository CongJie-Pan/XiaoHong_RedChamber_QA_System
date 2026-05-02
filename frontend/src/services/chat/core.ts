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
import type { CitationSource } from '@/components/Citations';
import { useConversationStore } from '@/store/conversation';
import { createChatStream } from '@/services/chat-stream';
import { databaseService } from '@/services/database';
import { ValidationError, normalizeError } from '@/utils/error';
import { sanitizeMessagesForAPI } from '@/utils/sanitizer';
import type { ChatMessage } from '@/services/chat-stream/types';
import type { Message } from '@/database/schema';
import { getAbortController, setAbortController } from './state';

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

  // IF: A stream is already active
  // Why: Cancel the previous stream to prevent interleaved tokens 
  // and prioritize the most recent user intent.
  const prevController = getAbortController();
  if (prevController) {
    prevController.abort();
    setAbortController(null);
  }

  const newController = new AbortController();
  setAbortController(newController);
  const abortSignal = newController.signal;

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
  }

  const assistantMessageId = chatStore.addAssistantMessage(activeConversationId);
  chatStore.startStreaming(assistantMessageId);

  const latestState = useChatStore.getState();
  let messages = prepareMessagesForAPI(latestState.messages, assistantMessageId);

  // IF: Store state update was delayed
  // Why: Robustness check to ensure we always have at least 
  // the current message.
  if (messages.length === 0 && sanitizedContent) {
    messages = [{
      role: 'user',
      content: sanitizedContent
    }];
  }

  // IF: Cannot prepare any valid messages
  // Why: Abort early if the context is lost.
  if (messages.length === 0) {
    chatStore.resetStreamingState();
    chatStore.setError(new Error('無法準備對話內容，請重新嘗試。'));
    return;
  }

  // Why: Accumulate stream components in local variables for 
  // final persistence batching.
  let thinkingContent = '';
  let thinkingStartTime: number | null = null;
  let answerContent = '';
  let citations: string[] = [];
  let sourcesPayload: CitationSource[] = [];
  let suggestionsList: string[] = [];

  const conversationIdForSave = activeConversationId;

  try {
    await createChatStream(
      messages,
      {
        onThinkingStart: () => {
          // IF: Force-think mode is active
          // Why: Track latency for the model's reasoning phase.
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

        onStatus: (status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done', message: string) => {
          chatStore.setRagStatus(status, message);
        },

        onSources: (sources: CitationSource[]) => {
          sourcesPayload = sources;
          chatStore.setRagStatus('sources_ready');
          chatStore.setRagSources(sources);
        },

        onSuggestions: (suggestions: string[]) => {
          suggestionsList = suggestions;
          chatStore.updateAssistantMessage(assistantMessageId, { suggestions });
        },

        onDone: async () => {
          chatStore.endStreaming();

          const thinkingDuration = thinkingStartTime
            ? Date.now() - thinkingStartTime
            : undefined;

          // Why: Prepare a complete message object for persistence.
          const messageData: Omit<Message, 'id' | 'conversationId' | 'createdAt'> = {
            role: 'assistant',
            content: answerContent,
          };

          // IF: Model produced reasoning trace
          // Why: Persist thinking content separately for later audit/display.
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

          // Why: Final persistence to IndexedDB.
          await databaseService.message.add(conversationIdForSave, messageData);

          await conversationStore.loadConversations();

          // IF: This is the first interaction in a conversation
          // Why: Automatically generate a descriptive title based 
          // on the actual dialogue content.
          if (messages.length === 1 && answerContent) {
            const titleMessages = [
              ...messages,
              { role: 'assistant', content: answerContent }
            ];
            useConversationStore.getState().generateTitle(conversationIdForSave, titleMessages);
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
