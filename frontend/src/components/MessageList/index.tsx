'use client';

/**
 * MessageList Component
 * Displays list of chat messages with auto-scroll
 * Respects user manual scrolling
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageCircle, ArrowDown } from 'lucide-react';
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
}

/**
 * MessageList displays all messages in the current conversation
 */
export function MessageList({ className, onRegenerate, onEdit }: MessageListProps) {
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
  const thinkingStartTime = useChatStore((state) => state.thinkingStartTime);

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
      // User scrolled up - stop auto-scroll (but not during streaming)
      if (!isStreaming) {
        userScrolledUpRef.current = true;
        setShowScrollButton(true);
      }
    }
  }, [isStreaming]);

  // Add scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Reset user scroll state when streaming starts
  useEffect(() => {
    if (isStreaming) {
      userScrolledUpRef.current = false;
      // Defer state update to next tick to avoid cascading renders
      setTimeout(() => setShowScrollButton(false), 0);
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
        // 1. During streaming - always follow
        // 2. User hasn't manually scrolled up AND is near bottom
        const shouldAutoScroll = isStreaming || (!userScrolledUpRef.current && isScrolledToBottom);

        if (shouldAutoScroll) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: isStreaming ? 'auto' : 'smooth',
          });
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
      {messages.map((message) => {
        const isCurrentStreaming = message.id === currentStreamingId;

        return (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={isCurrentStreaming && isStreaming}
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
