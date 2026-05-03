// =================================================================
// USE CONVERSATION SWITCH HOOK
// Why: Manages the lifecycle of switching between conversations. 
// It coordinates message loading from IndexedDB, snapshot 
// initialization in Zustand, and synchronization with background 
// streams from StreamManager.
// =================================================================

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chat';
import { streamManager, type StreamUpdate } from '@/services/chat/StreamManager';
import { databaseService } from '@/services/database';

/**
 * Hook to manage conversation switching and background stream sync
 * 
 * @param conversationId - The ID of the conversation to activate
 */
export function useConversationSwitch(conversationId: string | null) {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!conversationId) {
      useChatStore.getState().setActiveConversation(null);
      return;
    }

    let isMounted = true;

    async function activate() {
      const activeId = conversationId!;

      try {
        // 1. Load historical messages from IndexedDB
        const messages = await databaseService.message.getByConversationId(activeId);
        if (!isMounted) return;

        const existingSnapshot = useChatStore.getState().conversationSnapshots[activeId];
        const mergedMessages = messages.length > 0
          ? messages
          : (existingSnapshot?.messages ?? []);

        // 2. Atomic state update for switching
        // Why: Combine pointer update, message loading, and background state sync 
        // into a single render cycle to prevent UI ghosting or infinite loops.
        const backgroundState = streamManager.getSessionState(activeId);
        
        useChatStore.setState((state) => ({
          activeConversationId: activeId,
          conversationSnapshots: {
            ...state.conversationSnapshots,
            [activeId]: {
              ...(state.conversationSnapshots[activeId] || {
                messages: [],
                isStreaming: false,
                currentStreamingId: null,
                thinkingContent: '',
                thinkingStartTime: null,
                isThinking: false,
                currentContent: '',
                currentCitations: [],
                ragStatus: 'idle',
                ragMessage: '',
                ragSources: [],
                error: null,
              }),
              messages: mergedMessages,
              // If there's a background stream, sync its current buffer immediately
              ...(backgroundState ? {
                thinkingContent: backgroundState.thinking,
                isThinking: backgroundState.isThinking,
                currentContent: backgroundState.content,
                currentCitations: backgroundState.citations,
                ragStatus: backgroundState.ragStatus ?? 'idle',
                ragSources: backgroundState.sources,
                isStreaming: true,
              } : {}),
            }
          }
        }));

        // 3. Subscribe to future updates if streaming in background
        if (backgroundState) {
          unsubscribeRef.current?.();
          unsubscribeRef.current = streamManager.subscribe(activeId, (update: StreamUpdate) => {
            if (!isMounted) return;

            useChatStore.setState((state) => {
              const snap = state.conversationSnapshots[activeId];
              if (!snap) return state;

              const newSnap = { ...snap };

              switch (update.type) {
                case 'content':
                  if (update.chunk) newSnap.currentContent += update.chunk;
                  break;
                case 'thinking':
                  if (update.chunk) {
                    newSnap.thinkingContent += update.chunk;
                    if (newSnap.thinkingStartTime === null) newSnap.thinkingStartTime = Date.now();
                  }
                  newSnap.isThinking = true;
                  break;
                case 'thinking_end':
                  newSnap.isThinking = false;
                  break;
                case 'citations':
                  if (update.citations) newSnap.currentCitations = update.citations;
                  break;
                case 'status':
                  newSnap.ragStatus = update.status ?? 'idle';
                  if (update.message) newSnap.ragMessage = update.message;
                  break;
                case 'sources':
                  if (update.sources) newSnap.ragSources = update.sources;
                  break;
                case 'done':
                  newSnap.isStreaming = false;
                  break;
                case 'error':
                  newSnap.error = update.error || null;
                  newSnap.isStreaming = false;
                  break;
              }

              return {
                conversationSnapshots: {
                  ...state.conversationSnapshots,
                  [activeId]: newSnap
                }
              };
            });
          });
        }
      } catch (err) {
        console.error('[useConversationSwitch] Failed to activate conversation:', err);
      }
    }

    activate();

    return () => {
      isMounted = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [conversationId]);
}
