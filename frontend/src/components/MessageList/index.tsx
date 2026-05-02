'use client';

/**
 * MessageList Component
 * Displays list of chat messages with auto-scroll
 * Respects user manual scrolling
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { useChatStore, chatSelectors } from '@/store/chat';
import { MessageItem } from './MessageItem';
import { useStyles } from './styles';

/** Scroll threshold in pixels from bottom to trigger auto-scroll */
const SCROLL_THRESHOLD = 100;

export interface MessageListProps {
  /** Class name for styling */
  className?: string;
  /** Callback when regenerate button is clicked */
  onRegenerate?: (messageId: string) => void;
  /** Callback when edit is submitted for user messages */
  onEdit?: (messageId: string, newContent: string) => void;
  /** Callback when a suggested question is selected */
  onSelectSuggestion?: (question: string) => void;
}

/**
 * MessageList displays all messages in the current conversation
 */
export function MessageList({ className, onRegenerate, onEdit, onSelectSuggestion }: MessageListProps) {
  const { styles, cx } = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  // Get state from store
  const messages = useChatStore(chatSelectors.displayMessages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const currentStreamingId = useChatStore((state) => state.currentStreamingId);
  const thinkingContent = useChatStore((state) => state.thinkingContent);
  const isThinking = useChatStore((state) => state.isThinking);

  // RAG States
  const ragStatus = useChatStore((state) => state.ragStatus);
  const ragMessage = useChatStore((state) => state.ragMessage);
  const ragSources = useChatStore((state) => state.ragSources);



  // Handle user scroll - track if user manually scrolled up
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;

    if (isNearBottom) {
      // User scrolled back to bottom - resume auto-scroll
      userScrolledUpRef.current = false;
      setShowScrollButton(false);
    } else {
      // User scrolled up - stop auto-scroll
      userScrolledUpRef.current = true;
      setShowScrollButton(true);
    }
  }, []);

  // Add scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Reset user scroll state when streaming starts (if already at bottom)
  useEffect(() => {
    if (isStreaming) {
      const container = containerRef.current;
      if (container) {
        const isNearBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;
        
        if (isNearBottom) {
          userScrolledUpRef.current = false;
          // Defer state update to avoid cascading render warning in React 19 / ESLint
          // when calling setState synchronously within an effect that measures DOM
          setTimeout(() => setShowScrollButton(false), 0);
        }
      }
    }
  }, [isStreaming]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;

      requestAnimationFrame(() => {
        const isScrolledToBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;

        // Auto-scroll conditions:
        // 1. User hasn't manually scrolled up
        // 2. OR User is already near bottom (resume auto-scroll)
        const shouldAutoScroll = !userScrolledUpRef.current || isScrolledToBottom;

        if (shouldAutoScroll && (isStreaming || !userScrolledUpRef.current)) {
          // Special handling for the start of a conversation to ensure the 
          // user message remains visible when an empty assistant message 
          // or RAG status panel appears.
          const messageElements = container.querySelectorAll('[data-message-id]');
          const isFirstTurn = messages.length <= 2;
          
          if (isFirstTurn && isStreaming && messageElements.length > 0) {
            // Scroll to the first message (the user message) to ensure it's visible
            messageElements[0].scrollIntoView({ block: 'start', behavior: 'smooth' });
          } else {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: isStreaming ? 'auto' : 'smooth',
            });
          }
        }
      });
    }
  }, [messages, isStreaming, thinkingContent]);

  // Scroll to bottom button click handler
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      userScrolledUpRef.current = false;
      setShowScrollButton(false);
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  // Show empty state
  if (messages.length === 0) {
    return (
      <div className={cx(styles.container, styles.empty, className)}>
        <h1 className={styles.emptyTitle}>
          &nbsp;嗨！我是小紅，您的紅樓夢知識問答助手 😊
        </h1>
        <p className={styles.emptyDescription}>
          有什麼今天我可以幫你的嗎？
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cx(styles.container, className)}>
      {messages.map((message, index) => {
        const isCurrentStreaming = message.id === currentStreamingId;
        const isLast = index === messages.length - 1;
        
        // Detect if this is an assistant message following a user message
        const isAssistantAfterUser = 
          message.role === 'assistant' && 
          index > 0 && 
          messages[index - 1].role === 'user';

        return (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={isCurrentStreaming && isStreaming}
            isLast={isLast}
            className={isAssistantAfterUser ? 'assistant-after-user' : ''}
            onSelectSuggestion={onSelectSuggestion}
            thinking={
              isCurrentStreaming
                ? {
                    content: thinkingContent,
                    isThinking,
                  }
                : undefined
            }
            ragInfo={
              isCurrentStreaming && isStreaming
                ? {
                    status: ragStatus,
                    message: ragMessage,
                    sources: ragSources,
                  }
                : undefined
            }
            onRegenerate={message.role === 'assistant' ? onRegenerate : undefined}
            onEdit={message.role === 'user' ? onEdit : undefined}
          />
        );
      })}

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          className={styles.scrollButton}
          onClick={scrollToBottom}
          aria-label="滑動到底部"
        >
          <ArrowDown size={20} />
        </button>
      )}
    </div>
  );
}

export default MessageList;
export { MessageItem } from './MessageItem';
