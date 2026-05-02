'use client';

// =================================================================
// TEXT SELECTION HOOK
// Why: This hook provides a centralized way to track user text 
// selection within the chat interface. It is primarily used to 
// enable interactive features like 'Quote and Reply' or selecting 
// specific terms for further RAG-based explanation.
// =================================================================

import { useState, useEffect, useCallback } from 'react';

interface SelectionState {
  /** The plain text content of the selection */
  text: string;
  /** The visual bounding box for positioning UI toolbars */
  rect: DOMRect | null;
}

/**
 * Hook to track and manage text selection within the application window.
 * 
 * Why: We need to distinguish between casual selection and selection 
 * intended for interaction. This hook specifically targets text within 
 * assistant bubbles to prevent contextually irrelevant selections (like 
 * selecting text in the input box).
 * 
 * @returns The current selection state and a cleanup function.
 */
export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionState>({
    text: '',
    rect: null,
  });

  /**
   * Handles selection change events from the browser.
   * 
   * Reason: We use useCallback to prevent unnecessary re-renders of components 
   * that depend on this hook, as selection events fire frequently.
   */
  const handleSelectionChange = useCallback(() => {
    const activeElement = document.activeElement;
    
    // IF: User is selecting text inside an input or textarea
    // Why: We want to ignore these as they are typically part of message 
    // composition, not exploration of the AI's response.
    const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

    if (isInput) {
      setSelection({ text: '', rect: null });
      return;
    }

    const sel = window.getSelection();
    
    // IF: Selection is collapsed (just a cursor click) or empty
    // Why: No action needed for zero-length selections.
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection({ text: '', rect: null });
      return;
    }

    /**
     * Traverses the DOM tree upwards to find if a node is inside an AI bubble.
     * 
     * Why: Interactive features like 'Explain this' or citations are only 
     * valid contextually when applied to the AI's generated content.
     * 
     * @param node The DOM node to start searching from.
     * @returns The assistant bubble element or null.
     */
    const findAssistantBubble = (node: Node | null): HTMLElement | null => {
      let current = node;
      while (current && current !== document.body) {
        if (current instanceof HTMLElement && current.getAttribute('data-role') === 'assistant-bubble') {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    };

    // IF: Selection spans across multiple bubbles or outside an assistant bubble
    // Why: Multi-bubble selection creates ambiguous context for citations 
    // and interactive tools, so we restrict it to a single assistant response.
    const anchorBubble = findAssistantBubble(sel.anchorNode);
    const focusBubble = findAssistantBubble(sel.focusNode);

    if (!anchorBubble || !focusBubble || anchorBubble !== focusBubble) {
      setSelection({ text: '', rect: null });
      return;
    }

    const text = sel.toString();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelection({ text, rect });
  }, []);

  // =================================================================
  // EVENT LISTENERS
  // Why: We listen to both 'selectionchange' for keyboard/menu-based 
  // selection and 'mouseup' for mouse-based selection to ensure 
  // the state is always synchronized with the user's intent.
  // =================================================================
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  /**
   * Programmatically clears the current browser selection and internal state.
   * 
   * Why: Used when an interaction (like clicking a toolbar button) is 
   * completed to provide visual feedback that the action was taken.
   */
  const clearSelection = useCallback(() => {
    setSelection({ text: '', rect: null });
    window.getSelection()?.removeAllRanges();
  }, []);

  return { ...selection, clearSelection };
}

export default useTextSelection;
