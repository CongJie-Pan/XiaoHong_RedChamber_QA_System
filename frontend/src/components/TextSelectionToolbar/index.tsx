'use client';

import React, { useMemo } from 'react';
import { Copy, Quote, Sparkles } from 'lucide-react';
import { Tooltip, message as antMessage } from 'antd';
import { useChatStore } from '@/store/chat';
import { sendMessage } from '@/services/chat';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useStyles } from './styles';

/**
 * TextSelectionToolbar Component
 * Floating toolbar for text selection actions
 */
export function TextSelectionToolbar() {
  const { styles } = useStyles();
  const { text, rect, clearSelection } = useTextSelection();
  const setQuotedText = useChatStore((state) => state.setQuotedText);

  const position = useMemo(() => {
    if (!rect) return null;
    
    // Position above the selection
    const top = rect.top - 48;
    const left = rect.left + rect.width / 2 - 60; // Approximate half width of toolbar
    
    return {
      top: Math.max(8, top),
      left: Math.max(8, left),
    };
  }, [rect]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      antMessage.success('已複製到剪貼簿');
      clearSelection();
    } catch {
      antMessage.error('複製失敗');
    }
  };

  const handleQuote = () => {
    setQuotedText(text);
    clearSelection();
    // Focus chat input (optional, could be handled via global state if needed)
  };

  const handleExplain = async () => {
    const prompt = `請幫我解釋這段文字：\n\n> ${text}`;
    clearSelection();
    await sendMessage(prompt);
  };

  if (!text || !position) return null;

  return (
    <div
      className={styles.toolbar}
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
    >
      <Tooltip title="複製" color="#262626">
        <button className={styles.button} onClick={handleCopy} aria-label="複製">
          <Copy size={16} />
        </button>
      </Tooltip>
      
      <div className={styles.divider} />
      
      <Tooltip title="問小紅 (引用)" color="#262626">
        <button className={styles.button} onClick={handleQuote} aria-label="問小紅">
          <Quote size={16} />
        </button>
      </Tooltip>

      <Tooltip title="幫我解釋" color="#262626">
        <button className={styles.button} onClick={handleExplain} aria-label="幫我解釋">
          <Sparkles size={16} />
        </button>
      </Tooltip>
    </div>
  );
}

export default TextSelectionToolbar;
