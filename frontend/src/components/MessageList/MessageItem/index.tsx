'use client';

// =================================================================
// MESSAGE ITEM COMPONENT (MODULAR)
// Why: Provides a single chat message entry in the dialogue history. 
// This component has been modularized into specialized sub-components 
// (UserBubble, AssistantBubble) and a custom hook (useMessageItem) 
// to improve maintainability and follow the Single Responsibility 
// Principle.
// =================================================================

import React, { memo, useMemo, useEffect } from 'react';
import type { CitationSource } from '@/components/Citations';
import type { DisplayMessage } from '@/store/chat';
import { useStyles } from '../styles';
import { useMessageItem } from './useMessageItem';
import { createMarkdownComponents } from './MarkdownComponents';
import { UserBubble } from './UserBubble';
import { AssistantBubble } from './AssistantBubble';

export interface MessageItemProps {
  /** Message data */
  message: DisplayMessage;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /** Current thinking state for streaming messages */
  thinking?: {
    content: string;
    isThinking: boolean;
    startTime?: number | null;
    duration?: number;
  };
  /** RAG status metadata */
  ragInfo?: {
    status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
    message: string;
    sources: CitationSource[];
  };
  /** Callback when regenerate button is clicked (AI messages only) */
  onRegenerate?: (messageId: string) => void;
  /** Callback when edit is submitted (user messages only) */
  onEdit?: (messageId: string, newContent: string) => void;
  /** Whether this is the last message in the list (to show suggested questions) */
  isLast?: boolean;
  /** Callback when a suggested question is clicked */
  onSelectSuggestion?: (question: string) => void;
  /** Optional class name for custom styling */
  className?: string;
}

/**
 * MessageItem displays a single chat message
 */
export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  thinking,
  ragInfo,
  onRegenerate,
  onEdit,
  isLast = false,
  onSelectSuggestion,
  className,
}: MessageItemProps) {
  const { styles, cx } = useStyles();
  const isUser = message.role === 'user';

  // Why: Initialize the custom hook to handle all interactive 
  // features and state.
  const {
    bubbleRef,
    handleQuoteClick,
    handleCopy,
    handleRegenerate,
    isEditing,
    editContent,
    setEditContent,
    handleEditClick,
    handleCancelEdit,
    handleSaveEdit,
    handleEditKeyDown,
    registerMessageRef,
  } = useMessageItem({ message, onRegenerate, onEdit });

  // Why: Register the message's main DOM node in the global registry 
  // to allow searching and jumping across different message items.
  useEffect(() => {
    const el = bubbleRef.current;
    if (el) {
      registerMessageRef(message.id, el);
    }
    return () => registerMessageRef(message.id, null);
  }, [message.id, registerMessageRef, bubbleRef]);

  // Why: Memoize markdown components to prevent unnecessary 
  // re-renders of the Markdown renderer.
  const markdownComponents = useMemo(
    () => createMarkdownComponents(styles, cx, handleQuoteClick), 
    [styles, cx, handleQuoteClick]
  );

  return (
    <div
      className={cx(styles.messageItem, isUser && styles.userMessage, className)}
      data-message-id={message.id}
    >
      {isUser ? (
        <UserBubble
          message={message}
          styles={styles}
          cx={cx}
          markdownComponents={markdownComponents}
          isEditing={isEditing}
          editContent={editContent}
          setEditContent={setEditContent}
          onEditKeyDown={handleEditKeyDown}
          onCancelEdit={handleCancelEdit}
          onSaveEdit={handleSaveEdit}
          onEditClick={handleEditClick}
          onCopy={handleCopy}
          onQuoteClick={handleQuoteClick}
          bubbleRef={bubbleRef}
        />
      ) : (
        <AssistantBubble
          message={message}
          styles={styles}
          cx={cx}
          markdownComponents={markdownComponents}
          isStreaming={isStreaming}
          bubbleRef={bubbleRef}
          thinking={thinking}
          ragInfo={ragInfo}
          isLast={isLast}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onSelectSuggestion={onSelectSuggestion}
        />
      )}
    </div>
  );
});

export default MessageItem;
