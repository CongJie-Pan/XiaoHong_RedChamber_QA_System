import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';
import { useChatStore } from '@/store/chat';
import { useConversationStore } from '@/store/conversation';
import { createChatStream } from '@/services/chat-stream';
import { databaseService } from '@/services/database';
import { sendMessage } from '@/services/chat';

// Mock chat stream
vi.mock('@/services/chat-stream', () => ({
  createChatStream: vi.fn(),
}));

// Mock database
vi.mock('@/services/database', () => ({
  databaseService: {
    message: {
      add: vi.fn().mockResolvedValue({ id: 'new-msg' }),
      update: vi.fn().mockResolvedValue(undefined),
      getByConversationId: vi.fn().mockResolvedValue([]),
    },
    conversation: {
      create: vi.fn().mockResolvedValue({ id: 'conv-new', title: 'New Chat' }),
    },
  },
}));

// Mock Title Generation
vi.mock('@/services/chat/mutations', () => ({
    regenerateMessage: vi.fn(),
    editUserMessage: vi.fn(),
}));

import { QuoteProvider } from '@/components/MessageList/QuoteContext';

describe('Background Streaming Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset stores
    act(() => {
      // Use the store actions to ensure proper initialization
      useChatStore.getState().setActiveConversation(null);
      useConversationStore.setState({
        conversations: [
          { id: 'conv1', title: 'Chat 1', messageCount: 0, lastMessagePreview: '', createdAt: new Date(), updatedAt: new Date() },
          { id: 'conv2', title: 'Chat 2', messageCount: 0, lastMessagePreview: '', createdAt: new Date(), updatedAt: new Date() },
        ],
        activeConversationId: null,
        error: null,
      });
    });

    vi.spyOn(useConversationStore.getState(), 'generateTitle')
      .mockResolvedValue(undefined);
  });

  it('should continue streaming when switching conversations', async () => {
    let resolveStream: any;
    const streamPromise = new Promise((resolve) => { resolveStream = resolve; });

    // Mock stream to be slow
    vi.mocked(createChatStream).mockImplementation(async (messages, callbacks) => {
      // Small initial delay to ensure listener is ready
      await new Promise(r => setTimeout(r, 10));
      callbacks.onContent!('Hello');
      await streamPromise;
      callbacks.onContent!(' world');
      await callbacks.onDone!();
    });

    // 1. Start chat in Conv 1
    act(() => {
      useConversationStore.getState().selectConversation('conv1');
    });

    render(
      <QuoteProvider>
        <ChatContainer />
      </QuoteProvider>
    );

    // Trigger send message
    await act(async () => {
      await sendMessage('Hi');
    });

    // Verify "Hello" is visible in UI for Conv 1
    expect(await screen.findByText(/Hello/)).toBeDefined();

    // 2. Switch to Conv 2
    await act(async () => {
       useConversationStore.getState().selectConversation('conv2');
    });

    // Verify Conv 1 message is GONE from current view
    expect(screen.queryByText(/Hello/)).toBeNull();

    // 3. Complete the stream in background
    await act(async () => {
      resolveStream();
      // Wait for multiple microtasks and the internal setTimeout in StreamManager
      await new Promise(r => setTimeout(r, 100));
    });

    // 4. Switch back to Conv 1
    await act(async () => {
       useConversationStore.getState().selectConversation('conv1');
    });

    // Verify "Hello world" is visible in UI for Conv 1
    expect(await screen.findByText(/Hello world/)).toBeDefined();
  });
});
