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

interface UseMessageItemProps {
  message: DisplayMessage;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}

export function useMessageItem({ message, onRegenerate, onEdit }: UseMessageItemProps) {
  const { message: antMessageApi } = App.useApp();
  const bubbleRef = useRef<HTMLDivElement>(null);

  type WindowFind = (
    text: string,
    caseSensitive?: boolean,
    backwards?: boolean,
    wrap?: boolean,
    wholeWord?: boolean,
    searchInFrames?: boolean,
    showDialog?: boolean
  ) => boolean;

  // =================================================================
  // TEXT HIGHLIGHTING LOGIC
  // Why: Provides a visual link between citation quotes and the 
  // original text, improving the user's ability to verify sources.
  // =================================================================
  const handleQuoteClick = useCallback((quoteText: string) => {
    if (!bubbleRef.current || !quoteText) return;

    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();

    // 1. Precise TreeWalker-based highlighting
    const walk = document.createTreeWalker(bubbleRef.current, NodeFilter.SHOW_TEXT, null);
    let node;
    let found = false;
    
    while ((node = walk.nextNode())) {
      const text = node.textContent || '';
      const index = text.indexOf(quoteText);
      
      if (index !== -1 && node.parentElement) {
        if (node.parentElement.closest('.interactive-quote')) continue;

        node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        try {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + quoteText.length);
          
          if (selection) {
            selection.addRange(range);
            found = true;
          }
        } catch (e) {
          console.warn('Range highlight failed, falling back:', e);
        }
        break;
      }
    }

    // 2. Browser native fallback
    const windowWithFind = window as Window & { find?: WindowFind };
    if (!found && typeof windowWithFind.find === 'function') {
      const res = windowWithFind.find(quoteText, false, false, true, false, true, false);
      if (res) found = true;
    }


    // 3. Auto-clear selection
    if (found) {
      setTimeout(() => {
        window.getSelection()?.removeAllRanges();
      }, 6000);
    }
  }, []);

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
  };
}
