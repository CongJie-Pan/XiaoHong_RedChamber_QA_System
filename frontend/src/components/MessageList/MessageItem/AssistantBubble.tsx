'use client';

// =================================================================
// ASSISTANT MESSAGE BUBBLE COMPONENT
// Why: Dedicated sub-component for rendering AI responses. Manages 
// complex multi-stage rendering including RAG status, Thinking 
// process (CoT), streaming content, and structured citations.
// =================================================================

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, RefreshCw } from 'lucide-react';
import { Tooltip } from 'antd';
import { ThinkingPanel } from '@/components/ThinkingPanel';
import { SuggestedQuestions } from '@/components/SuggestedQuestions';
import { Citations } from '@/components/Citations';
import { RAGStatusPanel } from '@/components/RAGStatusPanel';
import type { CitationSource } from '@/components/Citations';
import type { DisplayMessage } from '@/store/chat';

interface AssistantBubbleProps {
  message: DisplayMessage;
  styles: Record<string, string>;
  cx: (...args: Array<string | false | null | undefined>) => string;
  markdownComponents: Components;
  isStreaming: boolean;
  bubbleRef: React.RefObject<HTMLDivElement | null>;
  thinking?: {
    content: string;
    isThinking: boolean;
    duration?: number;
  };
  ragInfo?: {
    status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
    message: string;
    sources: CitationSource[];
  };
  isLast: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
  onSelectSuggestion?: (question: string) => void;
}



export const AssistantBubble: React.FC<AssistantBubbleProps> = ({
  message,
  styles,
  cx,
  markdownComponents,
  isStreaming,
  bubbleRef,
  thinking,
  ragInfo,
  isLast,
  onCopy,
  onRegenerate,
  onSelectSuggestion,
}) => {
  return (
    <div className={styles.assistantMessageWrapper}>
      <div className={cx(styles.bubbleWrapper, 'bubbleWrapper')}>
        <div 
          ref={bubbleRef}
          className={cx(styles.bubble, styles.assistantBubble)}
          data-role="assistant-bubble"
        >
          {/* 1. RAG Status: Visible before content/thinking starts */}
          {ragInfo && ragInfo.status !== 'idle' && !thinking?.isThinking && !thinking?.content && !message.reasoning && (
            <RAGStatusPanel ragInfo={ragInfo} />
          )}

          {/* 2. Thinking Panel: Displays CoT process */}
          {(thinking?.isThinking || message.reasoning) && (
            <div className={styles.thinkingPanelWrapper}>
              <ThinkingPanel
                content={thinking?.content || message.reasoning?.content}
                duration={thinking?.duration || message.reasoning?.duration}
                isThinking={thinking?.isThinking}
                defaultExpanded={thinking?.isThinking}
              />
            </div>
          )}

          {/* 3. Main Message Content */}
          <div className={styles.content}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
              disallowedElements={['script', 'iframe', 'object', 'embed']}
            >
              {message.content}
            </ReactMarkdown>
            {/* Streaming cursor */}
            {isStreaming && !thinking?.isThinking && (
              <span className={styles.streamingCursor} />
            )}
          </div>

          {/* 4. Citations & Sources */}
          {((message.sources && message.sources.length > 0) || 
            (ragInfo?.sources && ragInfo.sources.length > 0) || 
            (message.citations && message.citations.length > 0)) && (
            <div className={styles.citationsWrapper}>
              <Citations 
                citations={message.citations || []} 
                sources={message.sources || ragInfo?.sources}
              />
            </div>
          )}

          {/* 5. Suggested Questions: Only for the latest AI message */}
          {isLast && message.suggestions && message.suggestions.length > 0 && !isStreaming && (
            <SuggestedQuestions 
              suggestions={message.suggestions} 
              onSelect={(q) => onSelectSuggestion?.(q)}
              disabled={isStreaming}
            />
          )}
        </div>

        {/* 6. Action Buttons */}
        <div className={styles.actionButtons}>
          <Tooltip title="複製訊息" color="#262626" styles={{ container: { color: '#ffffff' } }}>
            <button
              className={styles.actionButton}
              onClick={onCopy}
              aria-label="複製訊息"
            >
              <Copy size={16} />
            </button>
          </Tooltip>
          {onRegenerate && !isStreaming && (
            <Tooltip title="重新生成" color="#262626" styles={{ container: { color: '#ffffff' } }}>
              <button
                className={styles.actionButton}
                onClick={onRegenerate}
                aria-label="重新生成訊息"
              >
                <RefreshCw size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
