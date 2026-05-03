'use client';

// =================================================================
// USER MESSAGE BUBBLE COMPONENT
// Why: Dedicated sub-component for rendering user messages. Handles 
// both the normal display mode (including quoted text styling) and 
// the inline editing mode, keeping the main MessageItem component 
// lean and easy to manage.
// =================================================================

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Edit, CornerDownRight } from 'lucide-react';
import { Tooltip } from 'antd';
import type { DisplayMessage } from '@/store/chat';

interface UserBubbleProps {
  message: DisplayMessage;
  styles: Record<string, string>;
  cx: (...args: Array<string | false | null | undefined>) => string;
  markdownComponents: Components;
  isEditing: boolean;
  editContent: string;
  setEditContent: (content: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditClick: () => void;
  onCopy: () => void;
  onQuoteClick: (text: string) => void;
  bubbleRef: React.RefObject<HTMLDivElement | null>;
}



export const UserBubble: React.FC<UserBubbleProps> = ({
  message,
  styles,
  cx,
  markdownComponents,
  isEditing,
  editContent,
  setEditContent,
  onEditKeyDown,
  onCancelEdit,
  onSaveEdit,
  onEditClick,
  onCopy,
  onQuoteClick,
  bubbleRef,
}) => {
  if (isEditing) {
    return (
      <div ref={bubbleRef} className={styles.editModeContainer}>
        <textarea
          className={styles.editTextarea}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={onEditKeyDown}
          autoFocus
          placeholder="輸入訊息..."
        />
        <div className={styles.editButtons}>
          <button
            className={cx(styles.editButton, styles.editCancelButton)}
            onClick={onCancelEdit}
          >
            取消
          </button>
          <button
            className={cx(styles.editButton, styles.editSaveButton)}
            onClick={onSaveEdit}
            disabled={!editContent.trim() || editContent.trim() === message.content}
          >
            送出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={bubbleRef} className={cx(styles.bubbleWrapper, 'bubbleWrapper')}>
      {(() => {
        // Pattern matches one or more lines starting with '>' at the beginning
        const quoteMatch = message.content.match(/^((?:>[^\n]*(?:\n|$))+)\n*([\s\S]*)$/);
        
        if (quoteMatch) {
          const rawCitation = quoteMatch[1];
          const remainingText = quoteMatch[2].trim();
          const cleanCitation = rawCitation.replace(/^>\s?/gm, '').trim();
          
          return (
            <>
              {/* 1. Citation highlight block */}
              <div 
                className={cx(styles.quoteBlock, 'interactive-quote')}
                onClick={() => onQuoteClick(cleanCitation)}
                style={{ cursor: 'pointer' }}
              >
                <CornerDownRight size={14} className={styles.quoteBlockArrow} />
                <div className={styles.quoteBlockContent}>
                  {cleanCitation.split('\n').map((line, i) => (
                    <React.Fragment key={i}>
                      {line}
                      {i < cleanCitation.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              
              {/* 2. Main Query bubble */}
              {remainingText && (
                <div className={cx(styles.bubble, styles.userBubble)}>
                  <div className={styles.content}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                      disallowedElements={['script', 'iframe', 'object', 'embed']}
                    >
                      {remainingText}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          );
        }

        // Default: render everything inside bubble
        return (
          <div className={cx(styles.bubble, styles.userBubble)}>
            <div className={styles.content}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
                disallowedElements={['script', 'iframe', 'object', 'embed']}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })()}
      
      <div className={styles.userActionButtons}>
        <Tooltip title="複製訊息" color="#262626" styles={{ container: { color: '#ffffff' } }}>
          <button
            className={styles.actionButton}
            onClick={onCopy}
            aria-label="複製訊息"
          >
            <Copy size={16} />
          </button>
        </Tooltip>
        <Tooltip title="編輯訊息" color="#262626" styles={{ container: { color: '#ffffff' } }}>
          <button
            className={styles.actionButton}
            onClick={onEditClick}
            aria-label="編輯訊息"
          >
            <Edit size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
