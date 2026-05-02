// =================================================================
// CHAT SERVICE LAYER
// Why: Acts as the primary orchestrator between the UI (React components), 
// state management (Zustand), and data persistence (Dexie/IndexedDB). 
// This service encapsulates the complex logic of handling streaming 
// LLM responses, RAG status tracking, and conversation lifecycles.
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

// =================================================================
// SERVICE STATE & CONFIGURATION
// Why: Maintain a single active AbortController to ensure only one 
// stream is processed at a time, preventing race conditions.
// =================================================================

/**
 * Active abort controller for the current stream
 * Allows cancellation of ongoing requests
 */
let currentAbortController: AbortController | null = null;

// =================================================================
// MESSAGE PREPARATION & VALIDATION
// Why: Standardize the data sent to the LLM and ensure it meets 
// security and performance requirements.
// =================================================================

/**
 * Prepare messages for API by filtering out invalid messages
 * @param messages - Raw messages from store
 * @param excludeMessageId - Optional message ID to exclude
 * @returns Filtered messages ready for API
 */
function prepareMessagesForAPI(
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
function validateMessageContent(content: string): void {
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

// =================================================================
// CORE MESSAGE HANDLING
// Why: Orchestrate the lifecycle of a chat message from user input 
// through AI streaming to final database persistence.
// =================================================================

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
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  currentAbortController = new AbortController();
  const abortSignal = currentAbortController.signal;

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

          currentAbortController = null;
        },

        onError: (error: Error) => {
          chatStore.setError(error);
          chatStore.endStreaming();
          currentAbortController = null;
        },
      },
      abortSignal,
      chatStore.useRag,
      chatStore.forceThink
    );
  } catch (error) {
    currentAbortController = null;
    const err = normalizeError(error);
    chatStore.setError(err);
    chatStore.endStreaming();
    throw err;
  }
}

// =================================================================
// CONVERSATION LIFECYCLE MANAGEMENT
// Why: Handle navigation, creation, deletion, and cleanup of 
// entire conversation contexts.
// =================================================================

/**
 * Cancel the current streaming request
 */
export async function cancelCurrentStream(): Promise<void> {
  // IF: A stream is active
  // Why: Stop the ongoing network request.
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  const chatStore = useChatStore.getState();
  const conversationStore = useConversationStore.getState();

  const streamingMessageId = chatStore.currentStreamingId;
  const hasThinkingContent = chatStore.isThinking && chatStore.thinkingContent;
  const thinkingContent = chatStore.thinkingContent;
  const thinkingStartTime = chatStore.thinkingStartTime;
  const currentContent = chatStore.currentContent;

  // IF: Was stopped during thinking phase
  // Why: Ensure the thinking state is correctly closed in the UI.
  if (hasThinkingContent) {
    chatStore.endThinking();
  }

  chatStore.endStreaming();

  // IF: Partially received content exists
  // Why: Save the partial response to the database to ensure 
  // the user doesn't lose data from an interrupted long generation.
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
 * Check if a stream is currently in progress
 */
export function isStreamActive(): boolean {
  return currentAbortController !== null && !currentAbortController.signal.aborted;
}

/**
 * Load messages for a conversation
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
 */
export async function initializeChatService(): Promise<void> {
  const conversationStore = useConversationStore.getState();
  await conversationStore.loadConversations();
}

/**
 * Regenerate an AI message
 */
export async function regenerateMessage(messageId: string): Promise<void> {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
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

  // Why: Purge the old response before generating a new one to 
  // maintain a clean history.
  chatStore.removeMessage(messageId);
  await databaseService.message.delete(messageId);

  currentAbortController = new AbortController();
  const abortSignal = currentAbortController.signal;

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

          currentAbortController = null;
        },

        onError: (error: Error) => {
          chatStore.setError(error);
          chatStore.endStreaming();
          currentAbortController = null;
        },
      },
      abortSignal,
      chatStore.useRag,
      chatStore.forceThink
    );
  } catch (error) {
    currentAbortController = null;
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

  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
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

  currentAbortController = new AbortController();
  const abortSignal = currentAbortController.signal;

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

          currentAbortController = null;
        },

        onError: (error: Error) => {
          chatStore.setError(error);
          chatStore.endStreaming();
          currentAbortController = null;
        },
      },
      abortSignal,
      chatStore.useRag,
      chatStore.forceThink
    );
  } catch (error) {
    currentAbortController = null;
    const err = normalizeError(error);
    chatStore.setError(err);
    chatStore.endStreaming();
    throw err;
  }
}

/**
 * Export validation error for consumers
 */
export { ValidationError };

