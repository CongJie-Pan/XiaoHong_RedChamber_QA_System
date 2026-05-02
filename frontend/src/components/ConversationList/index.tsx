'use client';

// =================================================================
// CONVERSATION LIST COMPONENT
// Why: Provides sidebar navigation for the chat history. It handles 
// grouping conversations by date, switching between active threads, 
// and deleting old sessions. 
// =================================================================

import React, { useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Spin } from 'antd';
import { Plus, MessageSquare, Trash2, MessagesSquare, PanelLeftClose } from 'lucide-react';
import { useConversationStore } from '@/store/conversation';
import { switchConversation, deleteConversation as deleteConversationService } from '@/services/chat';
import { useStyles } from './styles';

export interface ConversationListProps {
  /** Callback when conversation is selected */
  onSelect?: (conversationId: string) => void;
  /** Callback when new conversation is created */
  onNew?: () => void;
  /** Callback when conversation is deleted */
  onDelete?: (conversationId: string) => void;
  /** Callback to toggle sidebar visibility */
  onToggleSidebar?: () => void;
  /** Class name for styling */
  className?: string;
}

/**
 * ConversationList displays all conversations in sidebar
 */
export function ConversationList({
  onSelect,
  onNew,
  onDelete,
  onToggleSidebar,
  className,
}: ConversationListProps) {
  const { styles, cx } = useStyles();

  // =================================================================
  // STORE SELECTORS
  // =================================================================
  const conversations = useConversationStore((state) => state.conversations);
  const activeId = useConversationStore((state) => state.activeConversationId);
  const isLoading = useConversationStore((state) => state.isLoading);
  const streamingTitles = useConversationStore((state) => state.streamingTitles);

  // =================================================================
  // EVENT HANDLERS
  // =================================================================

  /**
   * Resets the UI for a new conversation state
   * Why: Leverages lazy creation; the conversation record is only created 
   * in the DB after the first message is sent.
   */
  const handleNew = useCallback(async () => {
    onNew?.();
  }, [onNew]);

  const handleSelect = useCallback(
    async (id: string) => {
      await switchConversation(id);
      onSelect?.(id);
    },
    [onSelect]
  );

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      // Logic: Stop propagation to prevent selecting the conversation while deleting it
      e.stopPropagation();
      await deleteConversationService(id);
      onDelete?.(id);
    },
    [onDelete]
  );

  // =================================================================
  // MEMOIZED LOGIC
  // Why: Avoid re-sorting the list on every render unless conversations change.
  // =================================================================

  /**
   * Group conversations by date (Today, Yesterday, Last 7 Days, Older)
   * Why: Helps users find recent work quickly and provides cognitive 
   * organization to long chat histories.
   */
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: typeof conversations } = {
      '今天': [],
      '昨天': [],
      '過去七天': [],
      '更早以前': [],
    };

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    conversations.forEach((conv) => {
      const date = new Date(conv.updatedAt);
      date.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      // IF: Updated today
      if (diffDays === 0) groups['今天'].push(conv);
      // ELSE IF: Updated yesterday
      else if (diffDays === 1) groups['昨天'].push(conv);
      // ELSE IF: Updated within the last week
      else if (diffDays < 7) groups['過去七天'].push(conv);
      // DEFAULT: Older records
      else groups['更早以前'].push(conv);
    });

    // FILTER: Remove empty groups from display
    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [conversations]);

  // =================================================================
  // RENDERING
  // =================================================================

  return (
    <div className={cx(styles.container, className)}>
      {/* BRANDING AREA */}
      <div className={styles.logoContainer}>
        <div className={styles.logoWrapper}>
          <Image 
            src="/logo/complteLogo_03_whiteText.png" 
            alt="XiaoHong Logo" 
            width={160} 
            height={40}
            className={styles.logo}
            priority
          />
        </div>
        <button 
          className={styles.toggleButton} 
          onClick={onToggleSidebar}
          title="關閉側邊欄"
        >
          <PanelLeftClose size={20} />
        </button>
      </div>

      {/* CREATE NEW CONVERSATION BUTTON */}
      <div className={styles.header}>
        <button className={styles.newButton} onClick={handleNew}>
          <Plus size={18} />
          <span>新對話</span>
        </button>
      </div>

      {/* SCROLLABLE CONVERSATION LIST */}
      <div className={styles.list}>
        {/* TERNARY: Loading State */}
        {isLoading ? (
          <div className={styles.loading}>
            <Spin size="small" />
          </div>
        ) : conversations.length === 0 ? (
          // ELSE IF: Empty State
          <div className={styles.empty}>
            <MessagesSquare size={32} className={styles.emptyIcon} />
            <p className={styles.emptyText}>尚無對話紀錄</p>
          </div>
        ) : (
          // ELSE: Render grouped items
          groupedConversations.map(([group, items]) => (
            <React.Fragment key={group}>
              <div className={styles.groupTitle}>{group}</div>
              {items.map((conv) => (
                <div
                  key={conv.id}
                  className={cx(
                    styles.item,
                    conv.id === activeId && styles.itemActive
                  )}
                  onClick={() => handleSelect(conv.id)}
                >
                  <MessageSquare size={16} className={styles.itemIcon} />
                  <div className={styles.itemContent}>
                    <span className={cx(styles.itemTitle, 'conv-title')}>
                      {/* TERNARY: Show real-time title generation if active */}
                      {streamingTitles[conv.id] !== undefined ? (
                        <>
                          {streamingTitles[conv.id]}
                          <span className={styles.cursor} />
                        </>
                      ) : (
                        conv.title || '新對話'
                      )}
                    </span>
                  </div>
                  <button
                    className={cx(styles.deleteBtn, 'delete-btn')}
                    onClick={(e) => handleDelete(conv.id, e)}
                    title="刪除對話"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
