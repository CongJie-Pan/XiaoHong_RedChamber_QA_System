'use client';

/**
 * ConversationList Component
 * Sidebar displaying conversation history
 */

import React, { useCallback } from 'react';
import { Button, Popconfirm, Spin } from 'antd';
import { Plus, MessageSquare, Trash2, MessagesSquare } from 'lucide-react';
import { useConversationStore } from '@/store/conversation';
import { useStyles } from './styles';

export interface ConversationListProps {
  /** Callback when conversation is selected */
  onSelect?: (conversationId: string) => void;
  /** Callback when new conversation is created */
  onNew?: () => void;
  /** Callback when conversation is deleted */
  onDelete?: (conversationId: string) => void;
  /** Class name for styling */
  className?: string;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else {
    return d.toLocaleDateString();
  }
}

/**
 * ConversationList displays all conversations in sidebar
 */
export function ConversationList({
  onSelect,
  onNew,
  onDelete,
  className,
}: ConversationListProps) {
  const { styles, cx } = useStyles();

  // Get state from store
  const conversations = useConversationStore((state) => state.conversations);
  const activeId = useConversationStore((state) => state.activeConversationId);
  const isLoading = useConversationStore((state) => state.isLoading);
  const createConversation = useConversationStore((state) => state.createConversation);
  const selectConversation = useConversationStore((state) => state.selectConversation);
  const deleteConversation = useConversationStore((state) => state.deleteConversation);

  const handleNew = useCallback(async () => {
    await createConversation();
    onNew?.();
  }, [createConversation, onNew]);

  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      onSelect?.(id);
    },
    [selectConversation, onSelect]
  );

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback(
    (id: string, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect(id);
      }
    },
    [handleSelect]
  );

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteConversation(id);
      onDelete?.(id);
    },
    [deleteConversation, onDelete]
  );

  return (
    <div className={cx(styles.container, className)}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>歷史對話</span>
        <button
          className={styles.newButton}
          onClick={handleNew}
          aria-label="建立新對話"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Conversation List */}
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loading}>
            <Spin size="small" />
            <span style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              讀取對話中...
            </span>
          </div>
        ) : conversations.length === 0 ? (
          <div className={styles.empty}>
            <MessagesSquare size={32} className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              尚無對話紀錄。<br />
              開始新對話吧！
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cx(
                styles.item,
                styles.itemHover,
                conv.id === activeId && styles.itemActive
              )}
              onClick={() => handleSelect(conv.id)}
              onKeyDown={(e) => handleKeyDown(conv.id, e)}
              role="button"
              tabIndex={0}
              aria-label={`Conversation: ${conv.title}, ${conv.messageCount} messages, last updated ${formatDate(conv.updatedAt)}`}
              aria-current={conv.id === activeId ? 'page' : undefined}
            >
              <MessageSquare size={16} className={styles.itemIcon} aria-hidden="true" />

              <div className={styles.itemContent}>
                <div className={styles.itemTitle}>{conv.title}</div>
                {conv.lastMessagePreview && (
                  <div className={styles.itemPreview}>
                    {conv.lastMessagePreview}
                  </div>
                )}
                <div className={styles.itemMeta}>
                  {conv.messageCount} 則訊息 &middot;{' '}
                  {formatDate(conv.updatedAt)}
                </div>
              </div>

              <Popconfirm
                title="刪除對話？"
                description="此操作無法復原。"
                onConfirm={(e) => handleDelete(conv.id, e as React.MouseEvent)}
                okText="刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<Trash2 size={14} />}
                  className={`delete-btn ${styles.deleteButton}`}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ConversationList;
