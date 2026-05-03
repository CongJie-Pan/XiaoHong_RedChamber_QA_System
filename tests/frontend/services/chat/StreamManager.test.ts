import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamManager } from '@/services/chat/StreamManager';
import { createChatStream } from '@/services/chat-stream';
import { databaseService } from '@/services/database';

vi.mock('@/services/chat-stream', () => ({
  createChatStream: vi.fn(),
}));

vi.mock('@/services/database', () => ({
  databaseService: {
    message: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe('StreamManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamManager.abortAll();
  });

  it('should manage multiple concurrent streams', async () => {
    // Arrange
    let resolveStream1: any;
    let resolveStream2: any;
    
    const streamPromise1 = new Promise((resolve) => { resolveStream1 = resolve; });
    const streamPromise2 = new Promise((resolve) => { resolveStream2 = resolve; });

    vi.mocked(createChatStream).mockImplementation(async (messages, callbacks) => {
      if (messages[0].content === 'q1') {
        callbacks.onContent!('a1');
        await streamPromise1;
        await callbacks.onDone!(['s1', 's2']);
      } else {
        callbacks.onContent!('a2');
        await streamPromise2;
        await callbacks.onDone!([]);
      }
    });

    // Act
    await streamManager.startStream('conv1', 'msg1', [{ role: 'user', content: 'q1' }], false, false);
    await streamManager.startStream('conv2', 'msg2', [{ role: 'user', content: 'q2' }], false, false);

    // Assert
    expect(streamManager.isStreaming('conv1')).toBe(true);
    expect(streamManager.isStreaming('conv2')).toBe(true);
    expect(streamManager.getSessionState('conv1')?.content).toBe('a1');
    expect(streamManager.getSessionState('conv2')?.content).toBe('a2');

    // Complete streams
    resolveStream1();
    resolveStream2();
    
    // Wait for internal async loops
    await new Promise(r => setTimeout(r, 100));

    expect(streamManager.isStreaming('conv1')).toBe(false);
    expect(streamManager.isStreaming('conv2')).toBe(false);
    
    // Verify persistence
    expect(databaseService.message.update).toHaveBeenCalledWith('msg1', expect.objectContaining({
      suggestions: ['s1', 's2'],
      isStreaming: false
    }));
    expect(databaseService.message.update).toHaveBeenCalledTimes(2);
  });

  it('should notify listeners of updates', async () => {
    // Arrange
    const listener = vi.fn();
    vi.mocked(createChatStream).mockImplementation(async (messages, callbacks) => {
      await new Promise(r => setTimeout(r, 10)); // Add delay
      callbacks.onContent!('part1');
      callbacks.onContent!('part2');
      await callbacks.onDone!(['s1']);
    });

    // Act
    await streamManager.startStream('conv1', 'msg1', [], false, false);
    const unsubscribe = streamManager.subscribe('conv1', listener);
    
    // Wait for execution
    await new Promise(r => setTimeout(r, 50));

    // Assert
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'content', chunk: 'part1' }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'content', chunk: 'part2' }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'done', suggestions: ['s1'] }));
    
    unsubscribe();
  });

  it('should abort only the specified conversation', async () => {
    // Arrange
    vi.mocked(createChatStream).mockImplementation(async () => {
       await new Promise(r => setTimeout(r, 1000));
    });

    await streamManager.startStream('conv1', 'msg1', [], false, false);
    await streamManager.startStream('conv2', 'msg2', [], false, false);

    // Act
    streamManager.abort('conv1');

    // Assert
    expect(streamManager.isStreaming('conv1')).toBe(false);
    expect(streamManager.isStreaming('conv2')).toBe(true);
  });
});
