'use client';

/**
 * Citations Component
 * Displays citation links from AI response
 */

import React, { useState, useCallback } from 'react';
import { ChevronRight, ExternalLink, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStyles } from './styles';

export interface CitationSource {
  title: string;
  snippet: string;
  score: number;
  chunk_id: string;
}

export interface CitationsProps {
  /** Array of citation URLs (legacy) */
  citations?: string[];
  /** Structured RAG sources (new) */
  sources?: CitationSource[];
  /** Whether expanded by default */
  defaultExpanded?: boolean;
  /** Class name for styling */
  className?: string;
}

/**
 * Extract domain from URL for display
 * Validates URL protocol for security
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Validate it's http(s) protocol for security
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return 'Invalid URL';
    }
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'Invalid URL';
  }
}

/**
 * Citations displays reference links from AI response
 */
export function Citations({
  citations,
  sources,
  defaultExpanded = false,
  className,
}: CitationsProps) {
  const { styles, cx } = useStyles();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded]
  );

  // Don't render if no sources or citations
  const hasSources = sources && sources.length > 0;
  const hasCitations = citations && citations.length > 0;
  if (!hasSources && !hasCitations) {
    return null;
  }

  const count = hasSources ? sources.length : (citations ? citations.length : 0);

  return (
    <div className={cx(styles.container, className)}>
      <div
        className={styles.header}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Hide' : 'Show'} ${count} sources`}
      >
        <ChevronRight
          size={14}
          className={cx(styles.icon, isExpanded && styles.iconExpanded)}
          aria-hidden="true"
        />
        <BookOpen size={14} className={styles.icon} aria-hidden="true" />
        <span>文獻來源</span>
        <span className={styles.count}>({count})</span>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {hasSources ? (
              <div className={styles.sourcesGrid}>
                {sources!.map((src, index) => (
                  <div key={src.chunk_id || index} className={styles.sourceCard}>
                    <div className={styles.sourceHeader}>
                      <span className={styles.linkNumber}>{index + 1}</span>
                      <span className={styles.sourceTitle}>{src.title || '古籍文獻'}</span>
                    </div>
                    <div className={styles.sourceSnippet}>
                      {src.snippet}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.list}>
                {citations!.map((url, index) => (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                    title={url}
                  >
                    <span className={styles.linkNumber}>{index + 1}</span>
                    <span className={styles.linkText}>{getDomain(url)}</span>
                    <ExternalLink size={12} className={styles.linkIcon} />
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Citations;
