// =================================================================
// STREAM MANAGER SERVICE
// Why: Manages multiple concurrent AI streaming sessions. This 
// service decouples the network lifecycle of a stream from the 
// UI conversation selection, allowing background streaming to 
// continue when a user switches conversations.
// =================================================================

import { databaseService } from '@/services/database';
import { useChatStore } from '@/store/chat';
import { createChatStream } from '@/services/chat-stream';
import type { ChatMessage } from '@/services/chat-stream/types';
import type { CitationSource } from '@/components/Citations';

/**
 * Metadata and state for an active streaming session
 */
interface StreamSession {
  /** Controller to cancel the stream */
  abortController: AbortController;
  /** ID of the conversation this stream belongs to */
  conversationId: string;
  /** ID of the assistant message being updated */
  messageId: string;
  /** Current accumulated text content */
  accumulatedContent: string;
  /** Current accumulated thinking content */
  accumulatedThinking: string;
  /** Whether the AI is currently in the thinking phase */
  isThinking: boolean;
  /** Status of the RAG pipeline */
  ragStatus: string;
  /** Collected citations */
  citations: string[];
  /** Structured RAG sources */
  sources: CitationSource[];
  /** Suggested questions */
  suggestions: string[];
  /** UI callback listeners for real-time updates */
  listeners: Set<(data: StreamUpdate) => void>;
}

/**
 * Data packet sent to UI listeners
 */
export interface StreamUpdate {
  type: 'content' | 'thinking' | 'thinking_end' | 'citations' | 'status' | 'sources' | 'suggestions' | 'done' | 'error';
  chunk?: string;
  content?: string;
  citations?: string[];
  status?: any;
  message?: string;
  sources?: CitationSource[];
  suggestions?: string[];
  error?: Error;
}

class StreamManager {
  /** Active sessions indexed by conversationId */
  private sessions = new Map<string, StreamSession>();
  
  /** Debounce timers for database persistence to avoid write amplification */
  private pendingWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Starts a new streaming session
   */
  async startStream(
    conversationId: string,
    messageId: string,
    messages: ChatMessage[],
    useRag: boolean,
    forceThink: boolean
  ) {
    // IF: Session already exists for this conversation
    // Why: Abort the old one before starting a new one in the same context.
    this.abort(conversationId);

    const abortController = new AbortController();
    const session: StreamSession = {
      abortController,
      conversationId,
      messageId,
      accumulatedContent: '',
      accumulatedThinking: '',
      isThinking: false,
      ragStatus: 'idle',
      citations: [],
      sources: [],
      suggestions: [],
      listeners: new Set(),
    };

    this.sessions.set(conversationId, session);

    // Run the stream asynchronously
    this._runStream(session, messages, useRag, forceThink).catch((err) => {
      console.error(`[StreamManager] Stream failed for ${conversationId}:`, err);
    });
  }

  /**
   * Internal stream execution loop
   */
  private async _runStream(
    session: StreamSession,
    messages: ChatMessage[],
    useRag: boolean,
    forceThink: boolean
  ) {
    try {
      await createChatStream(
        messages,
        {
          onThinkingStart: () => {
            if (!forceThink) return;
            session.isThinking = true;
            this._notify(session, { type: 'thinking', chunk: '' });
          },
          onThinkingContent: (chunk) => {
            if (!forceThink) return;
            session.accumulatedThinking += chunk;
            this._notify(session, { type: 'thinking', chunk });
          },
          onThinkingEnd: () => {
            if (!forceThink) return;
            session.isThinking = false;
            this._notify(session, { type: 'thinking_end' });
          },
          onContent: (chunk) => {
            session.accumulatedContent += chunk;
            this._notify(session, { type: 'content', chunk });
            this._persistDebounced(session);
          },
          onCitations: (citations) => {
            session.citations = citations;
            this._notify(session, { type: 'citations', citations });
          },
          onStatus: (status, message) => {
            session.ragStatus = status;
            this._notify(session, { type: 'status', status, message });
          },
          onSources: (sources) => {
            session.sources = sources;
            this._notify(session, { type: 'sources', sources });
          },
          onSuggestions: (suggestions) => {
            session.suggestions = suggestions;
            this._notify(session, { type: 'suggestions', suggestions });
          },
          onDone: async () => {
            this._notify(session, { type: 'done' });
            await this._finalize(session);
          },
          onError: (error) => {
            this._notify(session, { type: 'error', error });
            this._handleError(session, error);
          },
        },
        session.abortController.signal,
        useRag,
        forceThink
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[StreamManager] Stream aborted for ${session.conversationId}`);
        await this._finalize(session, true);
      } else {
        this._handleError(session, err);
      }
    }
  }

  /**
   * Subscribe a UI component to stream updates
   * @returns Unsubscribe function
   */
  subscribe(conversationId: string, listener: (data: StreamUpdate) => void) {
    const session = this.sessions.get(conversationId);
    if (!session) return () => {};
    
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  /**
   * Get current progress for a background stream
   */
  getSessionState(conversationId: string) {
    const session = this.sessions.get(conversationId);
    if (!session) return null;
    
    return {
      content: session.accumulatedContent,
      thinking: session.accumulatedThinking,
      isThinking: session.isThinking,
      citations: session.citations,
      sources: session.sources,
      suggestions: session.suggestions,
      ragStatus: session.ragStatus,
    };
  }

  /**
   * Abort a specific stream
   */
  abort(conversationId: string) {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.abortController.abort();
      this.sessions.delete(conversationId);
    }
  }

  /**
   * Abort all active streams
   */
  abortAll() {
    this.sessions.forEach((session) => session.abortController.abort());
    this.sessions.clear();
  }

  /**
   * Check if a conversation is currently streaming
   */
  isStreaming(conversationId: string) {
    return this.sessions.has(conversationId);
  }

  /**
   * Notify all active listeners for a session
   */
  private _notify(session: StreamSession, update: StreamUpdate) {
    session.listeners.forEach((listener) => listener(update));
  }

  /**
   * Debounced persistence to database
   */
  private _persistDebounced(session: StreamSession) {
    if (this.pendingWriteTimers.has(session.messageId)) return;
    
    const timer = setTimeout(async () => {
      this.pendingWriteTimers.delete(session.messageId);
      try {
        await databaseService.message.update(session.messageId, {
          content: session.accumulatedContent,
          isStreaming: true,
        });
      } catch (err) {
        console.error('[StreamManager] Persistence error:', err);
      }
    }, 500); // 500ms debounce
    
    this.pendingWriteTimers.set(session.messageId, timer);
  }

  /**
   * Finalize message in database
   */
  private async _finalize(session: StreamSession, isPartial = false) {
    clearTimeout(this.pendingWriteTimers.get(session.messageId));
    this.pendingWriteTimers.delete(session.messageId);

    try {
      await databaseService.message.update(session.messageId, {
        content: session.accumulatedContent,
        citations: session.citations.length > 0 ? session.citations : undefined,
        sources: session.sources.length > 0 ? session.sources : undefined,
        suggestions: session.suggestions.length > 0 ? session.suggestions : undefined,
        isStreaming: false,
        isPartial: isPartial,
      });
      
      // If thinking was used, it would have been saved by the caller or 
      // we need to pass it back. For now, assume it's updated via reasoning object 
      // if we have enough info. 
      // Note: We might need to store thinkingDuration in session if needed.
    } catch (err) {
      console.error('[StreamManager] Finalization error:', err);
    } finally {
      this.sessions.delete(session.conversationId);
    }
  }

  /**
   * Handle error state
   */
  private _handleError(session: StreamSession, error: Error) {
    console.error(`[StreamManager] Stream error for ${session.conversationId}:`, error);
    this._finalize(session, true);
  }
}

export const streamManager = new StreamManager();
