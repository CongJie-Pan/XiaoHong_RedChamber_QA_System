import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextSelectionToolbar } from '@/components/TextSelectionToolbar';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useChatStore } from '@/store/chat';
import { sendMessage } from '@/services/chat';

// Mock the hook and other modules
vi.mock('@/hooks/useTextSelection');
vi.mock('@/store/chat', () => ({
  useChatStore: vi.fn(),
}));
vi.mock('@/services/chat', () => ({
  sendMessage: vi.fn(),
}));

describe('TextSelectionToolbar', () => {
  const mockClearSelection = vi.fn();
  const mockSetQuotedText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementation
    (useTextSelection as any).mockReturnValue({
      text: 'selected text',
      rect: { top: 100, left: 100, width: 50, height: 20 } as DOMRect,
      clearSelection: mockClearSelection,
    });

    (useChatStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') {
        return selector({ setQuotedText: mockSetQuotedText });
      }
      return { setQuotedText: mockSetQuotedText };
    });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should not render when no text is selected', () => {
    (useTextSelection as any).mockReturnValue({
      text: '',
      rect: null,
      clearSelection: mockClearSelection,
    });
    
    const { container } = render(<TextSelectionToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when text is selected', () => {
    render(<TextSelectionToolbar />);
    expect(screen.getByRole('button', { name: /複製/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /問小紅/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /幫我解釋/i })).toBeDefined();
  });

  it('should call navigator.clipboard.writeText on copy', async () => {
    render(<TextSelectionToolbar />);
    const copyBtn = screen.getByRole('button', { name: /複製/i });
    
    await fireEvent.click(copyBtn);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text');
    expect(mockClearSelection).toHaveBeenCalled();
  });

  it('should call setQuotedText on quote click', () => {
    render(<TextSelectionToolbar />);
    const quoteBtn = screen.getByRole('button', { name: /問小紅/i });
    
    fireEvent.click(quoteBtn);
    
    expect(mockSetQuotedText).toHaveBeenCalledWith('selected text');
    expect(mockClearSelection).toHaveBeenCalled();
  });

  it('should call sendMessage on explain click', async () => {
    render(<TextSelectionToolbar />);
    const explainBtn = screen.getByRole('button', { name: /幫我解釋/i });
    
    await fireEvent.click(explainBtn);
    
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('請幫我解釋這段文字'));
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('selected text'));
    expect(mockClearSelection).toHaveBeenCalled();
  });
});
