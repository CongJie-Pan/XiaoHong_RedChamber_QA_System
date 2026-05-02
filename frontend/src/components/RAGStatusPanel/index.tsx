'use client';

/**
 * RAGStatusPanel Component
 * Displays the real-time progress of the RAG retrieval pipeline with smooth animations
 */

import React, { memo } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CitationSource } from '@/components/Citations';
import { useStyles } from './styles';

export interface RAGInfo {
  status: 'idle' | 'routing' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
  message: string;
  sources: CitationSource[];
}

interface RAGStatusPanelProps {
  ragInfo: RAGInfo;
}

// =================================================================
// RAG STATUS PANEL COMPONENT
// Why: Provides visual feedback for the multi-stage RAG pipeline.
// Without this, the user might perceive a "hang" while the system
// performs hybrid search and reranking.
// =================================================================
const RAGStatusPanelComponent = ({ ragInfo }: RAGStatusPanelProps) => {
  const { styles } = useStyles();

  // =================================================================
  // STATUS STATES & LOGIC
  // Why: Map internal pipeline stages to user-facing UI states.
  // =================================================================

  // IF: Pipeline has reached a stage where sources are available
  // Why: We transition to a "complete" visual state once the 
  // retrieval/rerank phase is finished, even if the LLM is still 
  // generating the final text.
  const isComplete = ['sources_ready', 'generating', 'done'].includes(ragInfo.status);
  
  // IF: Status is 'routing'
  // Why: This is the initial stage where the system determines
  // if RAG is necessary.
  const isRouting = ragInfo.status === 'routing';

  // Don't show if idle
  // Why: Reduce UI noise when the system is not actively retrieving.
  if (ragInfo.status === 'idle') return null;

  return (
    <motion.div 
      className={styles.container}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.header}>
        <div className={styles.statusInfo}>
          {isComplete ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <CheckCircle2 size={18} className={styles.checkIcon} />
            </motion.div>
          ) : isRouting ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className={styles.spinnerWrapper}
            >
              <Loader2 size={18} className={styles.routingIcon} />
            </motion.div>
          ) : (
            <div className={styles.radarWrapper}>
              <div className={styles.radarCore} />
              <div className={styles.radarRing} />
            </div>
          )}
          
          <div style={{ overflow: 'hidden', height: '24px', position: 'relative' }}>
            <AnimatePresence mode="wait">
              {/* IF: Not routing
                  Why: Per requirement "不用 發送「🔍 正在識別問題領域...」",
                  we suppress the text label during the initial routing phase 
                  to keep the UI cleaner during rapid decisions. */}
              {!isRouting && (
                <motion.span 
                  key={ragInfo.message || ragInfo.status}
                  className={styles.statusText}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'block', whiteSpace: 'nowrap' }}
                >
                  {ragInfo.message || (isComplete ? '已完成文獻檢索' : '正在檢索相關文獻...')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {ragInfo.sources.length > 0 && (
            <motion.div 
              className={styles.sourceCount}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              找到 {ragInfo.sources.length} 筆文獻
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

/**
 * Why: Memoized to prevent re-renders when the parent (MessageItem) 
 * updates due to streaming tokens, as this panel's state is often
 * stable once retrieval is done.
 */
export const RAGStatusPanel = memo(RAGStatusPanelComponent);
