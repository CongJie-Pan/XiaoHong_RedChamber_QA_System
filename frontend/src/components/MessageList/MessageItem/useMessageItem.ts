'use client';

// =================================================================
// MESSAGE ITEM CUSTOM HOOK
// Why: Extracts all interactive logic and state management from the 
// MessageItem component. This allows the rendering components to 
// remain pure and focused on layout, while centralizing complex 
// behaviors like DOM-based text highlighting and edit mode cycles.
// =================================================================

import React, { useState, useCallback, useRef } from 'react';
import { App } from 'antd';
import type { DisplayMessage } from '@/store/chat';
import { useQuote } from '../QuoteContext';

interface UseMessageItemProps {
  message: DisplayMessage;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}

export function useMessageItem({ message, onRegenerate, onEdit }: UseMessageItemProps) {
  const { message: antMessageApi } = App.useApp();
  const { registerMessageRef, handleQuoteClick: jumpToQuote } = useQuote();
  const bubbleRef = useRef<HTMLDivElement>(null);

  // =================================================================
  // TEXT HIGHLIGHTING LOGIC
  // Why: Provides a visual link between citation quotes and the 
  // original text, improving the user's ability to verify sources.
  // Using global QuoteContext for cross-message jumping.
  // =================================================================
  const handleQuoteClick = useCallback((quoteText: string) => {
    if (!quoteText) return;
    jumpToQuote(quoteText);
  }, [jumpToQuote]);

  // =================================================================
  // ACTION HANDLERS
  // =================================================================
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      antMessageApi.success('已複製到剪貼簿');
    } catch {
      antMessageApi.error('複製失敗');
    }
  }, [message.content, antMessageApi]);

  const handleRegenerate = useCallback(() => {
    if (onRegenerate) {
      onRegenerate(message.id);
    }
  }, [onRegenerate, message.id]);

  // =================================================================
  // EDIT MODE STATE
  // =================================================================
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleEditClick = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
  }, [message.content]);

  const handleSaveEdit = useCallback(() => {
    const trimmedContent = editContent.trim();
    if (trimmedContent && trimmedContent !== message.content && onEdit) {
      onEdit(message.id, trimmedContent);
    }
    setIsEditing(false);
  }, [editContent, message.content, message.id, onEdit]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSaveEdit();
    }
  }, [handleCancelEdit, handleSaveEdit]);

  return {
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
  };
}
