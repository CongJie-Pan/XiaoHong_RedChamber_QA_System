'use client';

// =================================================================
// CHAT CONTAINER COMPONENT
// Why: This component serves as the layout root for the chat 
// interface. It orchestrates the sidebar (ConversationList), the 
// message stream (MessageList), and user input (ChatInput). It also 
// manages the high-level application state related to chat 
// interactions and error handling.
// =================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { Menu, X, AlertCircle } from 'lucide-react';
import { App } from 'antd';
import { useChatStore, chatSelectors } from '@/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { useConversationStore, conversationSelectors } from '@/store/conversation';
import { useConversationSwitch } from '@/hooks/useConversationSwitch';
import { sendMessage, initializeChatService, cancelCurrentStream, regenerateMessage, editUserMessage } from '@/services/chat';
import { ConversationList } from '@/components/ConversationList';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { TextSelectionToolbar } from '@/components/TextSelectionToolbar';
import { useStyles } from './styles';

// =================================================================
// UTILS & TYPES
// Why: Logic for error classification and component props definition.
// =================================================================

/**
 * Error type classification for user-friendly messages
 * Why: Converts raw technical errors into human-readable Traditional Chinese
 * instructions while determining if a retry action is safe/possible.
 */
function getErrorMessage(error: unknown): { message: string; isRetryable: boolean } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // IF: Network-related failures
  // Why: These are usually transient and worth retrying.
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('connection')) {
    return {
      message: '網路連線錯誤。請確認您的網路狀況後再試一次。',
      isRetryable: true,
    };
  }

  // IF: API Rate limiting (HTTP 429)
  // Why: Users should be informed to wait rather than flooding the server.
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
    return {
      message: '請求太頻繁。請稍候再試。',
      isRetryable: true,
    };
  }

  // IF: Authentication issues (HTTP 401/403)
  // Why: Retrying won't help if credentials are wrong; requires configuration change.
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('401') || lowerMessage.includes('api key')) {
    return {
      message: '驗證失敗。請檢查您的 API 密鑰設定。',
      isRetryable: false,
    };
  }

  // IF: Request timeout
  // Why: LLM processing can be slow; retry might hit a faster node.
  if (lowerMessage.includes('timeout')) {
    return {
      message: '請求超時。請再試一次。',
      isRetryable: true,
    };
  }

  // DEFAULT: Generic fallback
  // Why: Ensure we always provide some feedback even for unexpected errors.
  return {
    message: `發送訊息失敗：${errorMessage}`,
    isRetryable: true,
  };
}

export interface ChatContainerProps {
  /** Class name for styling */
  className?: string;
}

// =================================================================
// MAIN COMPONENT EXPORT
// =================================================================

/**
 * ChatContainer is the main component that assembles the chat interface
 */
export function ChatContainer({ className }: ChatContainerProps) {
  const { styles, cx } = useStyles();
  const { message: antMessageApi } = App.useApp();
  
  // STATE: Controls mobile sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // =================================================================
  // STORE SELECTORS
  // Why: Accessing global state via Zustand hooks for reactive updates.
  // =================================================================
  const isStreaming = useChatStore(chatSelectors.isLoading);
  const error = useChatStore(chatSelectors.error);
  const setError = useChatStore((state) => state.setError);
  const messages = useChatStore(useShallow(chatSelectors.displayMessages));
  
  // LOGIC: Check if conversation is empty
  // Why: Used to switch layout between landing view and active chat view.
  const isEmpty = messages.length === 0;

  const activeConversation = useConversationStore((state) =>
    conversationSelectors.activeConversation(state)
  );
  const activeConversationId = useConversationStore(
    (state) => state.activeConversationId
  );

  // =================================================================
  // LIFECYCLE EFFECTS
  // =================================================================

  // Why: Manages message loading and background stream synchronization 
  // during conversation switching.
  useConversationSwitch(activeConversationId);

  // EFFECT: Component Initialization
  // Why: Setup necessary background services on application start.
  useEffect(() => {
    initializeChatService();
  }, []);

  // =================================================================
  // EVENT HANDLERS
  // =================================================================

  /**
   * Sends a message and handles error notifications with retry logic
   * Why: Critical path for user interaction; requires robust error recovery.
   */
  const handleSend = useCallback(
    async function retryableSend(content: string) {
      try {
        await sendMessage(content, activeConversationId || undefined);
      } catch (err) {
        console.error('Failed to send message:', err);

        const { message: errorMsg, isRetryable } = getErrorMessage(err);

        // IF: The error allows for a retry
        // Why: Provide an inline button in the toast notification to resend immediately.
        if (isRetryable) {
          antMessageApi.error({
            content: (
              <span>
                {errorMsg}
                <button
                  onClick={() => {
                    antMessageApi.destroy('send-error');
                    retryableSend(content); 
                  }}
                  style={{
                    marginLeft: '12px',
                    padding: '2px 8px',
                    background: 'transparent',
                    border: '1px solid currentColor',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  重試
                </button>
              </span>
            ),
            duration: 8,
            key: 'send-error',
          });
        } else {
          // ELSE: Non-retryable error
          // Why: Just show the error without offering a useless retry action.
          antMessageApi.error({
            content: errorMsg,
            duration: 5,
            key: 'send-error',
          });
        }
      }
    },
    [activeConversationId, antMessageApi]
  );

  // HANDLER: Close sidebar on selection (Mobile)
  // Why: Improve UX by maximizing chat space after selecting a thread.
  const handleConversationSelect = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // HANDLER: Reset UI for a fresh conversation
  // Why: Clear previous context to prevent state leakage between sessions.
  const handleNewConversation = useCallback(() => {
    useConversationStore.getState().clearActiveConversation();
    useChatStore.getState().clearMessages();
    useChatStore.getState().resetStreamingState();
    setSidebarOpen(false);
  }, []);

  // HANDLER: Sidebar Toggle
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, [setError]);

  // HANDLER: Stop active LLM stream
  // Why: Allows user to interrupt long or undesired generation.
  const handleStop = useCallback(async () => {
    await cancelCurrentStream();
  }, []);

  // HANDLER: Regenerate LLM response
  // Why: Standard AI feature to get an alternative response to the same prompt.
  const handleRegenerate = useCallback(async (messageId: string) => {
    try {
      await regenerateMessage(messageId);
    } catch (err) {
      console.error('Failed to regenerate message:', err);
      antMessageApi.error('重新生成失敗，請稍後再試');
    }
  }, [antMessageApi]);

  // HANDLER: Edit previous user message
  // Why: Correction of typos or prompts; usually triggers new generation.
  const handleEdit = useCallback(async (messageId: string, newContent: string) => {
    try {
      await editUserMessage(messageId, newContent);
    } catch (err) {
      console.error('Failed to edit message:', err);
      antMessageApi.error('編輯訊息失敗，請稍後再試');
    }
  }, [antMessageApi]);

  // =================================================================
  // RENDERING
  // =================================================================

  return (
    <div className={cx(styles.container, className)}>
      {/* 
          IF: sidebarOpen (Mobile Overlay)
          Why: Prevents interaction with chat while sidebar is covering it on small screens.
      */}
      {sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={closeSidebar} />
      )}

      {/* SIDEBAR NAVIGATION */}
      <div className={cx(styles.sidebar, sidebarOpen && styles.sidebarOpen)}>
        <ConversationList
          onSelect={handleConversationSelect}
          onNew={handleNewConversation}
          onToggleSidebar={toggleSidebar}
        />
      </div>

      {/* MAIN CHAT INTERFACE */}
      <div className={styles.main}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={cx(styles.menuButton, sidebarOpen && styles.menuButtonVisible)}
              onClick={toggleSidebar}
              aria-label="打開選單"
            >
              <Menu size={20} />
            </button>
            <h1 className={styles.headerTitle}>
              {/* TERNARY: Display conversation title if it exists */}
              {activeConversation?.title || ''}
            </h1>
          </div>
        </div>

        {/* 
            IF: error (Banner)
            Why: Critical system alerts (e.g., disconnected services) must be prominently displayed.
        */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>{error.message}</span>
            <X
              size={16}
              className={styles.errorDismiss}
              onClick={dismissError}
            />
          </div>
        )}

        {/* CHAT CONTENT AREA */}
        <div className={cx(styles.content, isEmpty && styles.contentEmpty)}>
          {/* SCROLLABLE MESSAGE LIST */}
          <div className={styles.messageArea}>
            <MessageList 
              onRegenerate={handleRegenerate} 
              onEdit={handleEdit} 
              onSelectSuggestion={handleSend}
            />
          </div>

          {/* PERSISTENT INPUT BAR */}
          <div className={styles.inputArea}>
            <ChatInput
              onSend={handleSend}
              disabled={isStreaming}
              // TERNARY: Update placeholder based on system state
              placeholder={
                isStreaming
                  ? '正在努力思考...'
                  : '歡迎問我問題...'
              }
              isStreaming={isStreaming}
              onStop={handleStop}
            />
          </div>
        </div>
      </div>

      {/* FLOATING TEXT SELECTION TOOLBAR */}
      <TextSelectionToolbar />
    </div>
  );
}

export default ChatContainer;
