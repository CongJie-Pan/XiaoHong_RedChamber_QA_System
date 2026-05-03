'use client';

import React, { createContext, useContext, useRef, useCallback, ReactNode, useMemo } from 'react';

/**
 * Result of a text search in a DOM container
 */
interface SearchResult {
  container: HTMLElement;
  ranges: Range[];
}

/**
 * Quote Context Value interface
 */
interface QuoteContextValue {
  /** Register a message's DOM element */
  registerMessageRef: (messageId: string, el: HTMLElement | null) => void;
  /** Handle jumping to and highlighting quoted text */
  handleQuoteClick: (quoteText: string) => void;
}

const QuoteContext = createContext<QuoteContextValue | null>(null);

type HighlightConstructor = new (...ranges: Range[]) => unknown;
interface HighlightWindow {
  Highlight?: HighlightConstructor;
}
interface CssHighlights {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}
type CssWithHighlights = typeof CSS & { highlights?: CssHighlights };

/**
 * Build Range objects for text segments split across multiple nodes
 */
function buildRanges(
  offsets: { node: Text; start: number; end: number }[],
  matchStart: number,
  matchEnd: number
): Range[] {
  const ranges: Range[] = [];
  for (const { node, start, end } of offsets) {
    if (end <= matchStart || start >= matchEnd) continue;
    const range = document.createRange();
    range.setStart(node, Math.max(0, matchStart - start));
    range.setEnd(node, Math.min(node.length, matchEnd - start));
    ranges.push(range);
  }
  return ranges;
}

/**
 * Find text ranges within a container, traversing all text nodes
 */
function findTextInContainer(container: HTMLElement, quoteText: string): Range[] | null {
  // Collect all leaf text nodes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  // Join text and create offset map
  let fullText = '';
  const offsets: { node: Text; start: number; end: number }[] = [];
  for (const textNode of textNodes) {
    const start = fullText.length;
    fullText += textNode.textContent ?? '';
    offsets.push({ node: textNode, start, end: fullText.length });
  }

  // Normalize for comparison
  const normalizedFull = fullText.replace(/\s+/g, ' ');
  const normalizedQuote = quoteText.replace(/\s+/g, ' ');
  const matchIndex = normalizedFull.indexOf(normalizedQuote);
  
  if (matchIndex === -1) return null;

  const matchEnd = matchIndex + normalizedQuote.length;
  return buildRanges(offsets, matchIndex, matchEnd);
}

/**
 * Apply temporary highlight to ranges
 */
const HIGHLIGHT_CLASS = 'quote-highlight';
function applyHighlight(ranges: Range[]): () => void {
  // Use CSS Highlight API if available (Chrome 105+)
  const win = window as HighlightWindow;
  const css = CSS as CssWithHighlights;
  if (win.Highlight && css.highlights) {
    const highlight = new win.Highlight(...ranges);
    css.highlights.set(HIGHLIGHT_CLASS, highlight);
    return () => {
      css.highlights?.delete(HIGHLIGHT_CLASS);
    };
  }

  // Fallback: Use marks (slightly more invasive but widely supported)
  const marks: HTMLElement[] = [];
  for (const range of ranges) {
    const mark = document.createElement('mark');
    mark.className = HIGHLIGHT_CLASS;
    try {
      range.surroundContents(mark);
      marks.push(mark);
    } catch {
      // If range crosses element boundaries
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
      marks.push(mark);
    }
  }

  return () => {
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
  };
}

/**
 * QuoteProvider coordinates cross-message quote jumping
 */
export function QuoteProvider({ children }: { children: ReactNode }) {
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cleanupRef = useRef<(() => void) | null>(null);

  const registerMessageRef = useCallback((messageId: string, el: HTMLElement | null) => {
    if (el) {
      messageRefs.current.set(messageId, el);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  const handleQuoteClick = useCallback((quoteText: string) => {
    const normalizedQuote = quoteText.trim();
    if (!normalizedQuote) return;

    // Clear previous highlight
    cleanupRef.current?.();

    // Search in all registered messages (prefer recent ones first)
    const sortedEntries = Array.from(messageRefs.current.entries()).reverse();
    let foundResult: SearchResult | null = null;

    for (const [, container] of sortedEntries) {
      const ranges = findTextInContainer(container, normalizedQuote);
      if (ranges) {
        foundResult = { container, ranges };
        break;
      }
    }

    if (!foundResult) return;

    const { container, ranges } = foundResult;

    // Scroll and Highlight
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const removeHighlight = applyHighlight(ranges);
    cleanupRef.current = removeHighlight;

    // Auto cleanup after 3 seconds
    const timer = setTimeout(() => {
      removeHighlight();
      if (cleanupRef.current === removeHighlight) {
        cleanupRef.current = null;
      }
    }, 3000);

    // Update cleanup to include clearing the timer
    cleanupRef.current = () => {
      clearTimeout(timer);
      removeHighlight();
    };
  }, []);

  const value = useMemo(() => ({
    registerMessageRef,
    handleQuoteClick,
  }), [registerMessageRef, handleQuoteClick]);

  return (
    <QuoteContext.Provider value={value}>
      {children}
    </QuoteContext.Provider>
  );
}

/**
 * Hook to use quote jump functionality
 */
export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within a QuoteProvider');
  }
  return context;
}
