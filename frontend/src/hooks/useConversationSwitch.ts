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
  const { 
    setActiveConversation, 
    setMessages, 
    appendContent, 
    appendThinkingContent,
    endThinking,
    setCitations,
    setRagStatus,
    setRagSources,
    updateAssistantMessage,
    endStreaming,
    setError,
    startStreaming,
  } = useChatStore();
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setActiveConversation(null);
      return;
    }

    let isMounted = true;

    async function activate() {
      // Why: TypeScript doesn't track that conversationId is non-null 
      // inside an async closure even after the guard above.
      const activeId = conversationId!;

      // 1. Set active conversation in store (initializes snapshot if missing)
      setActiveConversation(activeId);

      // 2. Load historical messages from IndexedDB
      try {
        const messages = await databaseService.message.getByConversationId(activeId);
        if (!isMounted) return;
        setMessages(messages, activeId);

        // 3. Check if there's a background stream running for this conversation
        const backgroundState = streamManager.getSessionState(activeId);
        if (backgroundState) {
          // Sync existing buffer to store
          startStreaming('', activeId); // Reset state but keep messages
          if (backgroundState.thinking) {
             // We don't have a clean way to "replay" thinking vs content perfectly 
             // without more metadata, but we can set the latest values.
             useChatStore.getState().setSnapshot(activeId, {
               thinkingContent: backgroundState.thinking,
               isThinking: backgroundState.isThinking,
               currentContent: backgroundState.content,
               currentCitations: backgroundState.citations,
               ragStatus: backgroundState.ragStatus as any,
               ragSources: backgroundState.sources,
               isStreaming: true,
             });
          }

          // 4. Subscribe to future updates
          unsubscribeRef.current?.();
          unsubscribeRef.current = streamManager.subscribe(activeId, (update: StreamUpdate) => {
            if (!isMounted) return;

            switch (update.type) {
              case 'content':
                if (update.chunk) appendContent(update.chunk, activeId);
                break;
              case 'thinking':
                if (update.chunk) appendThinkingContent(update.chunk, activeId);
                break;
              case 'thinking_end':
                endThinking(activeId);
                break;
              case 'citations':
                if (update.citations) setCitations(update.citations, activeId);
                break;
              case 'status':
                setRagStatus(update.status, update.message, activeId);
                break;
              case 'sources':
                if (update.sources) setRagSources(update.sources, activeId);
                break;
              case 'suggestions':
                if (update.suggestions) updateAssistantMessage('', { suggestions: update.suggestions }, activeId);
                break;
              case 'done':
                endStreaming(activeId, update.suggestions);
                break;
              case 'error':
                if (update.error) setError(update.error, activeId);
                break;
            }
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
  }, [
    conversationId, 
    setActiveConversation, 
    setMessages, 
    startStreaming, 
    appendContent, 
    appendThinkingContent, 
    endThinking, 
    setCitations, 
    setRagStatus, 
    setRagSources, 
    updateAssistantMessage, 
    endStreaming, 
    setError
  ]);
}
