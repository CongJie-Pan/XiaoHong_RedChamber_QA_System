'use client';

import React, { useMemo } from 'react';
import { Copy, Quote, Sparkles } from 'lucide-react';
import { App } from 'antd';
import { useChatStore } from '@/store/chat';
import { sendMessage } from '@/services/chat';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useStyles } from './styles';

/**
 * TextSelectionToolbar Component
 * Floating toolbar for text selection actions
 */
export function TextSelectionToolbar() {
  // =================================================================
  // HOOKS & SELECTION STATE
  // Why: Encapsulate selection detection logic in a specialized hook
  // to keep the UI component focused only on rendering and actions.
  // =================================================================
  const { styles, cx } = useStyles();
  const { message } = App.useApp();
  const { text, rect, clearSelection } = useTextSelection();
  const setQuotedText = useChatStore((state) => state.setQuotedText);

  // =================================================================
  // POSITIONING LOGIC
  // Why: Calculate the absolute screen coordinates for the floating 
  // toolbar, ensuring it appears centered above the selected text
  // while staying within viewport boundaries.
  // =================================================================
  const position = useMemo(() => {
    // IF: No bounding rectangle from selection
    // Why: We cannot anchor the toolbar without a valid DOM coordinate.
    if (!rect) return null;
    
    // Position above the selection
    // Why: Placing it above follows common OS-level selection UI 
    // patterns (like iOS/Android), ensuring it doesn't obscure the 
    // selected text itself.
    const top = rect.top - 52;

    // Centering logic:
    // rect.left + rect.width / 2 is the center of selection.
    // We adjust based on estimated toolbar width (now around 280px).
    const left = rect.left + rect.width / 2 - 140; 
    
    return {
      top: Math.max(8, top),
      left: Math.max(8, left),
    };
  }, [rect]);

  // =================================================================
  // ACTION HANDLERS
  // Why: Define the business logic for specific selection actions.
  // =================================================================

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已複製到剪貼簿');
      clearSelection();
    } catch {
      message.error('複製失敗');
    }
  };

  const handleQuote = () => {
    // Why: Stores the selected text in the global chat store as 
    // a quote, which will be picked up by the ChatInput component.
    setQuotedText(text);
    clearSelection();
  };

  const handleExplain = async () => {
    // Why: Automatically constructs a request to explain the 
    // selected text, providing an immediate value-add for 
    // difficult classical Chinese passages.
    const prompt = `請幫我解釋這段文字：\n\n> ${text}`;
    clearSelection();
    await sendMessage(prompt);
  };

  if (!text || !position) return null;

  return (
    <div
      className={cx(styles.toolbar, 'selection-toolbar')}
      style={{
        top: position.top,
        left: position.left,
      }}
      // Why: Prevent the button click from triggering a "blur" or 
      // "mousedown" on the document which would clear the browser
      // selection before our click handler can run.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className={styles.button} onClick={handleCopy} aria-label="複製">
        <Copy size={14} />
        <span className={styles.label}>複製</span>
      </button>
      
      <div className={styles.divider} />
      
      <button className={styles.button} onClick={handleQuote} aria-label="問小紅">
        <Quote size={14} />
        <span className={styles.label}>問小紅(引用)</span>
      </button>

      <div className={styles.divider} />

      <button className={styles.button} onClick={handleExplain} aria-label="幫我解釋">
        <Sparkles size={14} />
        <span className={styles.label}>幫我解釋</span>
      </button>
    </div>
  );
}

export default TextSelectionToolbar;
