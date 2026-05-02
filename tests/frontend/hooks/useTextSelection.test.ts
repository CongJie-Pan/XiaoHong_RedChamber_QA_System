import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTextSelection } from '@/hooks/useTextSelection';

describe('useTextSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getSelection
    window.getSelection = vi.fn().mockReturnValue({
      isCollapsed: true,
      toString: () => '',
      removeAllRanges: vi.fn(),
      getRangeAt: vi.fn().mockReturnValue({
        getBoundingClientRect: () => ({
          top: 100,
          left: 100,
          width: 50,
          height: 20,
        }),
      }),
    });
  });

  it('should initialize with empty selection', () => {
    const { result } = renderHook(() => useTextSelection());
    expect(result.current.text).toBe('');
    expect(result.current.rect).toBeNull();
  });

  it('should update selection when text is selected', () => {
    const mockSelection = {
      isCollapsed: false,
      toString: () => 'selected text',
      getRangeAt: vi.fn().mockReturnValue({
        getBoundingClientRect: () => ({
          top: 100,
          left: 100,
          width: 50,
          height: 20,
        }),
      }),
    };
    window.getSelection = vi.fn().mockReturnValue(mockSelection);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(result.current.text).toBe('selected text');
    expect(result.current.rect).toEqual({
      top: 100,
      left: 100,
      width: 50,
      height: 20,
    });
  });

  it('should clear selection when isCollapsed is true', () => {
    const { result } = renderHook(() => useTextSelection());

    // First set a selection
    window.getSelection = vi.fn().mockReturnValue({
      isCollapsed: false,
      toString: () => 'text',
      getRangeAt: vi.fn().mockReturnValue({
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
      }),
    });
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(result.current.text).toBe('text');

    // Then collapse it
    window.getSelection = vi.fn().mockReturnValue({
      isCollapsed: true,
      toString: () => '',
    });
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(result.current.text).toBe('');
    expect(result.current.rect).toBeNull();
  });

  it('should ignore selection if active element is an input', () => {
    const { result } = renderHook(() => useTextSelection());

    // Mock active element as input
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    window.getSelection = vi.fn().mockReturnValue({
      isCollapsed: false,
      toString: () => 'text',
    });

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(result.current.text).toBe('');
    
    document.body.removeChild(input);
  });
});
