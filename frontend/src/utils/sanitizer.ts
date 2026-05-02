// =================================================================
// MESSAGE SANITIZATION UTILITIES
// Why: Ensuring that messages sent to the backend API are clean and 
// optimized. Specifically, removing internal reasoning traces 
// (<think> blocks) reduces token consumption and prevents the model 
// from being confused by its own previous thought processes.
// =================================================================

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/**
 * Removes <think>...</think> blocks from ALL message roles before sending to backend.
 * Applies to assistants (reasoning traces) and user messages alike, to save tokens.
 * After block removal, collapses consecutive spaces so adjacent removals don't
 * leave double gaps (e.g. "Text  More text." → "Text More text.").
 */
export function sanitizeMessagesForAPI(messages: Message[]): Message[] {
  return messages.map(msg => {
    let content = msg.content;

    // IF: Content contains complete <think>...</think> blocks
    // Why: Remove the internal CoT (Chain of Thought) reasoning that 
    // should not be re-processed by the model in subsequent turns.
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '');

    // IF: Content contains an unclosed <think> block at the end
    // Why: Handle edge cases where the stream was interrupted during 
    // the thinking phase.
    content = content.replace(/<think>[\s\S]*$/, '');

    // IF: Multiple consecutive spaces/tabs exist
    // Why: Collapse spaces to ensure clean formatting after tag removal, 
    // keeping the prompt concise.
    content = content.replace(/[ \t]{2,}/g, ' ');

    return {
      ...msg,
      content: content.trim()
    };
  });
}

