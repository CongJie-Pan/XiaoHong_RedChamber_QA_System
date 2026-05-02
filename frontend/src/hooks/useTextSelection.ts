'use client';

import { useState, useEffect, useCallback } from 'react';

interface SelectionState {
  text: string;
  rect: DOMRect | null;
}

/**
 * Hook to track text selection within the window.
 * Filters out selections in input/textarea fields.
 */
export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionState>({
    text: '',
    rect: null,
  });

  const handleSelectionChange = useCallback(() => {
    const activeElement = document.activeElement;
    const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

    if (isInput) {
      setSelection({ text: '', rect: null });
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection({ text: '', rect: null });
      return;
    }

    const text = sel.toString();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelection({ text, rect });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelection({ text: '', rect: null });
    window.getSelection()?.removeAllRanges();
  }, []);

  return { ...selection, clearSelection };
}

export default useTextSelection;
