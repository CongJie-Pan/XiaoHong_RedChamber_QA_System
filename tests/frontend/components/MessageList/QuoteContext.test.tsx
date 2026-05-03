import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';
import { QuoteProvider, useQuote } from '@/components/MessageList/QuoteContext';

// Helper component to test the hook
const TestComponent = ({ 
  messageId, 
  content, 
  quoteToClick 
}: { 
  messageId: string; 
  content: React.ReactNode; 
  quoteToClick?: string 
}) => {
  const { registerMessageRef, handleQuoteClick } = useQuote();
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerMessageRef(messageId, ref.current);
    return () => registerMessageRef(messageId, null);
  }, [messageId, registerMessageRef]);

  return (
    <div>
      <div ref={ref} data-testid={`message-${messageId}`}>
        {content}
      </div>
      {quoteToClick && (
        <button data-testid="quote-btn" onClick={() => handleQuoteClick(quoteToClick)}>
          Click Quote
        </button>
      )}
    </div>
  );
};

describe('QuoteContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock CSS.highlights if it doesn't exist
    if (!global.CSS) {
      (global as any).CSS = {};
    }
    if (!(global.CSS as any).highlights) {
      (global.CSS as any).highlights = {
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
    }
    // Mock Highlight class
    if (!(global as any).Highlight) {
      (global as any).Highlight = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders children correctly', () => {
    render(
      <QuoteProvider>
        <div data-testid="child">Child Content</div>
      </QuoteProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('successfully finds and scrolls to text split across nodes', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    
    render(
      <QuoteProvider>
        <TestComponent 
          messageId="msg-1" 
          content={
            <p>
              這是<span>一段</span>需被<strong>引用</strong>的文字
            </p>
          }
        />
        <TestComponent 
          messageId="msg-2" 
          content={<p>其他內容</p>}
          quoteToClick="一段需被引用"
        />
      </QuoteProvider>
    );

    fireEvent.click(screen.getByTestId('quote-btn'));

    // Should call scrollIntoView on the container of msg-1
    expect(scrollSpy).toHaveBeenCalled();
    
    // Check if highlight API was called (since we mocked it in beforeEach)
    expect((global.CSS as any).highlights.set).toHaveBeenCalled();
  });

  it('prioritizes most recent messages in reverse order', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    
    render(
      <QuoteProvider>
        {/* Unique text for this test to avoid cross-contamination */}
        <TestComponent messageId="old-msg" content={<p>非常獨特的重複文字</p>} />
        <TestComponent messageId="new-msg" content={<p>非常獨特的重複文字</p>} />
        <TestComponent 
          messageId="user-msg" 
          content={<p>User</p>} 
          quoteToClick="非常獨特的重複文字" 
        />
      </QuoteProvider>
    );

    fireEvent.click(screen.getByTestId('quote-btn'));

    // The FIRST match in reverse search should be 'new-msg'
    // Let's check the last call to scrollIntoView
    const calls = scrollSpy.mock.calls;
    const lastCallIndex = calls.length - 1;
    expect(scrollSpy.mock.contexts[lastCallIndex]).toBe(screen.getByTestId('message-new-msg'));
  });

  it('automatically cleans up highlights after 3 seconds', () => {
    render(
      <QuoteProvider>
        <TestComponent messageId="msg-1-timer" content={<p>目標計時文字</p>} />
        <TestComponent 
          messageId="msg-2-timer" 
          content={<p>User</p>} 
          quoteToClick="目標計時文字" 
        />
      </QuoteProvider>
    );

    fireEvent.click(screen.getByTestId('quote-btn'));
    expect((global.CSS as any).highlights.set).toHaveBeenCalled();

    // Advance timers by 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should have called delete to cleanup
    expect((global.CSS as any).highlights.delete).toHaveBeenCalledWith('quote-highlight');
  });

  it('clears previous highlight when a new quote is clicked', () => {
    // Manually clear mocks to avoid interference from previous tests
    (global.CSS as any).highlights.set.mockClear();
    (global.CSS as any).highlights.delete.mockClear();

    render(
      <QuoteProvider>
        <TestComponent messageId="msg-a" content={<p>第一段測試原文</p>} />
        <TestComponent messageId="msg-b" content={<p>第二段測試原文</p>} />
        <TestComponent 
          messageId="msg-c" 
          content={<p>User 1</p>} 
          quoteToClick="第一段測試原文" 
        />
        <TestComponent 
          messageId="msg-d" 
          content={<p>User 2</p>} 
          quoteToClick="第二段測試原文" 
        />
      </QuoteProvider>
    );

    const buttons = screen.getAllByTestId('quote-btn');

    // Click first quote
    fireEvent.click(buttons[0]);
    expect((global.CSS as any).highlights.set).toHaveBeenCalledTimes(1);

    // Click second quote immediately
    fireEvent.click(buttons[1]);
    
    // Should have deleted the first one before setting the second one
    expect((global.CSS as any).highlights.delete).toHaveBeenCalled();
    expect((global.CSS as any).highlights.set).toHaveBeenCalledTimes(2);
  });

  it('handles mark fallback if Highlight API is not supported', () => {
    // Disable Highlight API for this test
    const originalHighlights = (global.CSS as any).highlights;
    delete (global.CSS as any).highlights;

    render(
      <QuoteProvider>
        <TestComponent messageId="msg-mark-1" content={<p>回退測試文字</p>} />
        <TestComponent 
          messageId="msg-mark-2" 
          content={<p>User</p>} 
          quoteToClick="回退測試文字" 
        />
      </QuoteProvider>
    );

    fireEvent.click(screen.getByTestId('quote-btn'));

    // Should have inserted a <mark> element
    const mark = screen.getByTestId('message-msg-mark-1').querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveClass('quote-highlight');
    expect(mark).toHaveTextContent('回退測試文字');

    // Restore for other tests
    (global.CSS as any).highlights = originalHighlights;
  });
});
