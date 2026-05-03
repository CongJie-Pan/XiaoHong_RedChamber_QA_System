'use client';

/**
 * ChatInput Component
 * Text input for sending messages with validation
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, Brain, Database, X, CornerDownRight } from 'lucide-react';
import { message, Tooltip } from 'antd';
import { useChatStore } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { useStyles } from './styles';

/** Maximum allowed message length */
const MAX_MESSAGE_LENGTH = 4000;
/** Warning threshold for character count */
const WARNING_THRESHOLD = 0.9;

export interface ChatInputProps {
  /** Callback when message is sent */
  onSend: (message: string) => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Class name for styling */
  className?: string;
  /** Maximum message length (default: 4000) */
  maxLength?: number;
  /** Whether AI is currently streaming response */
  isStreaming?: boolean;
  /** Callback when stop button is clicked */
  onStop?: () => void;
}

/**
 * ChatInput provides text input for sending messages
 * Supports Enter to send, Shift+Enter for new line
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '問我任何問題...',
  className,
  maxLength = MAX_MESSAGE_LENGTH,
  isStreaming = false,
  onStop,
}: ChatInputProps) {
  // =================================================================
  // HOOKS & STATE MANAGEMENT
  // Why: We use a combination of local state for typing performance
  // and global Zustand stores for cross-component feature toggles
  // (RAG, Thinking mode) and contextual data (Quoted text).
  // =================================================================
  const { styles, cx } = useStyles();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const activeConversationId = useConversationStore((state) => state.activeConversationId);

  // Connect to global state for mode togglers
  const useRag = useChatStore((state) => state.useRag);
  const forceThink = useChatStore((state) => state.forceThink);
  const quotedText = useChatStore((state) => state.quotedText);
  const toggleRag = useChatStore((state) => state.toggleRag);
  const toggleThink = useChatStore((state) => state.toggleThink);
  const setQuotedText = useChatStore((state) => state.setQuotedText);

  // Calculate character count and warning state
  const charCount = value.length;
  const isNearLimit = charCount > maxLength * WARNING_THRESHOLD;
  const isOverLimit = charCount > maxLength;

  // =================================================================
  // SIDE EFFECTS
  // Why: Manage UI synchronization, including textarea auto-sizing,
  // focus management, and state cleanup on navigation.
  // =================================================================

  // Auto-resize textarea
  // Why: Provides a modern, "growing" input experience that adapts
  // to content length without requiring manual scrollbar management.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Focus textarea when quotedText changes
  // Why: When a user selects text for citation, we assume they
  // want to start typing their query immediately.
  useEffect(() => {
    if (quotedText && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [quotedText]);

  // Focus textarea on mount
  // Why: Standard chat UX; the user should be ready to type 
  // as soon as the component is available.
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // Clear input when conversation changes
  // Why: Prevents accidental message leakage between different
  // conversation contexts.
  useEffect(() => {
    // Why: Use setTimeout to avoid synchronous state updates during 
    // the render phase, which can trigger cascading render warnings.
    const timer = setTimeout(() => {
      setValue('');
      setQuotedText(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeConversationId, setQuotedText]);


  // =================================================================
  // EVENT HANDLERS
  // Why: Handle message submission, validation, and keyboard shortcuts.
  // =================================================================

  const handleSend = useCallback(() => {
    const trimmedValue = value.trim();

    // IF: Input is empty and no quoted text
    // Why: Prevents sending accidental empty messages.
    if (!trimmedValue && !quotedText) {
      return;
    }

    if (disabled) return;

    // IF: Message exceeds character limit
    // Why: LLM context windows and system performance require
    // reasonable input bounds.
    if (trimmedValue.length > maxLength) {
      message.error(`訊息過長。上限為 ${maxLength} 個字元。`);
      return;
    }

    // Construct final message with quote if exists
    // Why: We use Markdown blockquote syntax (">") to clearly
    // distinguish the referenced text from the user's new query.
    let finalMessage = trimmedValue;
    if (quotedText) {
      const formattedQuote = quotedText
        .split('\n')
        .map(line => (line.startsWith('>') ? line : `> ${line}`))
        .join('\n');
      finalMessage = `${formattedQuote}\n\n${trimmedValue}`;
    }

    if (!finalMessage.trim()) {
      message.warning('請輸入有效的訊息。');
      return;
    }

    onSend(finalMessage);
    setValue('');
    setQuotedText(null); // Clear quote after sending

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, maxLength, quotedText, setQuotedText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // IF: Enter key pressed without Shift
      // Why: Common UX pattern where Enter sends and Shift+Enter
      // creates a newline, balancing speed with multi-line capability.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    []
  );

  const canSend = value.trim().length > 0 && !disabled && !isOverLimit;


  return (
    <div className={cx(styles.container, className)}>
      {/* Quote Preview */}
      {quotedText && (
        <div className={styles.quotePreview}>
          <CornerDownRight size={14} className={styles.quoteArrow} />
          <div className={styles.quoteContent}>{quotedText}</div>
          <button
            className={styles.quoteClose}
            onClick={() => setQuotedText(null)}
            aria-label="取消引用"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        maxLength={maxLength + 100}
        aria-label="訊息輸入框"
        aria-describedby="char-count"
      />

      {/* Bottom toolbar: mode buttons left, send button right */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Tooltip title="切換思考模式" color="#262626" styles={{ container: { color: '#ffffff' } }}>
            <button
              type="button"
              className={cx(styles.toggleButton, forceThink && styles.toggleButtonActive)}
              onClick={toggleThink}
              aria-label="切換思考模式"
            >
              <Brain size={15} />
              <span>思考模式</span>
            </button>
          </Tooltip>

          <Tooltip title="切換 RAG 模式" color="#262626" styles={{ container: { color: '#ffffff' } }}>
            <button
              type="button"
              className={cx(styles.toggleButton, useRag && styles.toggleButtonActive)}
              onClick={toggleRag}
              aria-label="切換 RAG 模式"
            >
              <Database size={15} />
              <span>RAG模式</span>
            </button>
          </Tooltip>

          <span
            id="char-count"
            className={styles.charCount}
            style={{
              color: isOverLimit ? '#ff4d4f' : isNearLimit ? '#faad14' : undefined,
            }}
          >
            {charCount}/{maxLength}
          </span>
        </div>

        <div className={styles.toolbarRight}>
          {isStreaming && onStop ? (
            <button
              type="button"
              className={cx(styles.sendButton, styles.stopButton)}
              onClick={onStop}
              aria-label="停止生成"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!canSend}
              aria-label="發送訊息"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
