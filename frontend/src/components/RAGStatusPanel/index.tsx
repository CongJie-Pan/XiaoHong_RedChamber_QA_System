'use client';

/**
 * RAGStatusPanel Component
 * Displays the real-time progress of the RAG retrieval pipeline with smooth animations
 */

import React, { memo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CitationSource } from '@/components/Citations';
import { useStyles } from './styles';

export interface RAGInfo {
  status: 'idle' | 'retrieving' | 'searching_dense' | 'searching_sparse' | 'reranking' | 'sources_ready' | 'generating' | 'done';
  message: string;
  sources: CitationSource[];
}

interface RAGStatusPanelProps {
  ragInfo: RAGInfo;
  isStreaming?: boolean;
}

const RAGStatusPanelComponent = ({
  ragInfo,
  isStreaming = false,
}: RAGStatusPanelProps) => {
  const { styles } = useStyles();

  const isComplete = ['sources_ready', 'generating', 'done'].includes(ragInfo.status);

  // Don't show if idle
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
          ) : (
            <div className={styles.radarWrapper}>
              <div className={styles.radarCore} />
              <div className={styles.radarRing} />
            </div>
          )}
          
          <div style={{ overflow: 'hidden', height: '24px', position: 'relative' }}>
            <AnimatePresence mode="wait">
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

export const RAGStatusPanel = memo(RAGStatusPanelComponent);
