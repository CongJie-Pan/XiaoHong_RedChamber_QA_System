// =================================================================
// THINK TAG STREAM PARSER
// Why: Standardizes the extraction of internal reasoning traces 
// (<think> tags) from live LLM streams. This parser is stateful, 
// meaning it can correctly identify tag boundaries even if they are 
// split across multiple network chunks (e.g., "<thi" in one chunk 
// and "nk>" in the next).
// =================================================================

import { PARSER_CONFIG } from '@/config/api';
import type { ParsedChunk } from './types';

/**
 * Parser for handling <think> tags in streamed content
 */
export class ThinkTagParser {
  /** Tag constants for clarity */
  private static readonly THINK_OPEN = PARSER_CONFIG.tags.open;
  private static readonly THINK_CLOSE = PARSER_CONFIG.tags.close;
  private static readonly THINK_OPEN_LEN = PARSER_CONFIG.tags.openLength;
  private static readonly THINK_CLOSE_LEN = PARSER_CONFIG.tags.closeLength;

  /** Whether currently inside a <think> tag */
  private isInThinkTag = false;
  /** Buffer for accumulating partial content */
  private buffer = '';
  /** Track if we've warned about buffer overflow */
  private hasWarnedOverflow = false;

  /**
   * Parse incoming text and return parsed chunks
   * @param text - New text to parse
   * @returns Array of parsed chunks
   */
  parse(text: string): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    this.buffer += text;

    // IF: Buffer exceeds safety limits
    // Why: Prevent memory exhaustion attacks or infinite growth caused 
    // by malformed server responses that never close a <think> tag.
    if (this.buffer.length > PARSER_CONFIG.maxBufferSize) {
      if (!this.hasWarnedOverflow) {
        console.warn(
          '[ThinkTagParser] Buffer exceeded maximum size, forcing flush.'
        );
        this.hasWarnedOverflow = true;
      }

      // Why: Flush the buffer as-is to ensure the user still sees 
      // some content, even if it's malformed.
      if (this.isInThinkTag) {
        chunks.push({ type: 'thinking_content', content: this.buffer });
        chunks.push({ type: 'thinking_end' });
      } else {
        chunks.push({ type: 'content', content: this.buffer });
      }
      this.reset();
      return chunks;
    }

    // Process buffer for complete tags
    while (this.buffer.length > 0) {
      // IF: Currently parsing normal answer text
      if (!this.isInThinkTag) {
        const thinkStartIndex = this.buffer.indexOf(ThinkTagParser.THINK_OPEN);

        // IF: No <think> tag found in current buffer
        if (thinkStartIndex === -1) {
          const partialTagIndex = this.buffer.lastIndexOf('<');
          
          // IF: Buffer ends with a partial tag start (e.g., "<thi")
          // Why: Defer parsing of this specific slice until the 
          // next chunk completes the tag.
          if (
            partialTagIndex !== -1 &&
            partialTagIndex > this.buffer.length - ThinkTagParser.THINK_OPEN_LEN
          ) {
            const potentialPartial = this.buffer.slice(partialTagIndex);
            if (potentialPartial.length <= PARSER_CONFIG.maxPartialTagSize) {
              const content = this.buffer.slice(0, partialTagIndex);
              if (content) {
                chunks.push({ type: 'content', content });
              }
              this.buffer = potentialPartial;
              break;
            }
          }

          // ELSE: No partial tag detected
          // Why: Output the entire buffer as normal answer content.
          if (this.buffer) {
            chunks.push({ type: 'content', content: this.buffer });
          }
          this.buffer = '';
          break;
        } 
        // ELSE: Found the start of a <think> tag
        else {
          // Why: Flush any text that appeared before the tag.
          if (thinkStartIndex > 0) {
            const beforeContent = this.buffer.slice(0, thinkStartIndex);
            if (beforeContent) {
              chunks.push({ type: 'content', content: beforeContent });
            }
          }

          chunks.push({ type: 'thinking_start' });
          this.isInThinkTag = true;
          this.buffer = this.buffer.slice(thinkStartIndex + ThinkTagParser.THINK_OPEN_LEN);
        }
      } 
      // ELSE: Currently parsing a thinking block
      else {
        const thinkEndIndex = this.buffer.indexOf(ThinkTagParser.THINK_CLOSE);

        // IF: No closing </think> tag found
        if (thinkEndIndex === -1) {
          const partialTagIndex = this.buffer.lastIndexOf('<');
          
          // IF: Buffer ends with a partial closing tag (e.g., "</thi")
          // Why: Defer parsing until the full tag is received.
          if (
            partialTagIndex !== -1 &&
            partialTagIndex > this.buffer.length - ThinkTagParser.THINK_CLOSE_LEN
          ) {
            const potentialPartial = this.buffer.slice(partialTagIndex);
            if (potentialPartial.length <= PARSER_CONFIG.maxPartialTagSize) {
              const thinkingContent = this.buffer.slice(0, partialTagIndex);
              if (thinkingContent) {
                chunks.push({ type: 'thinking_content', content: thinkingContent });
              }
              this.buffer = potentialPartial;
              break;
            }
          }

          // ELSE: Still inside thinking block with no partial tag at end
          // Why: Accumulate entire buffer as thinking content.
          if (this.buffer) {
            chunks.push({ type: 'thinking_content', content: this.buffer });
          }
          this.buffer = '';
          break;
        } 
        // ELSE: Found the closing </think> tag
        else {
          // Why: Flush the remaining thinking content before transitioning.
          if (thinkEndIndex > 0) {
            const thinkingContent = this.buffer.slice(0, thinkEndIndex);
            if (thinkingContent) {
              chunks.push({ type: 'thinking_content', content: thinkingContent });
            }
          }

          chunks.push({ type: 'thinking_end' });
          this.isInThinkTag = false;
          this.buffer = this.buffer.slice(thinkEndIndex + ThinkTagParser.THINK_CLOSE_LEN);
        }
      }
    }

    return chunks;
  }

  /**
   * Reset parser state
   * Call this when starting a new conversation/message
   */
  reset(): void {
    this.isInThinkTag = false;
    this.buffer = '';
    this.hasWarnedOverflow = false;
  }

  /**
   * Check if currently inside a think tag
   */
  get isThinking(): boolean {
    return this.isInThinkTag;
  }

  /**
   * Get current buffer contents (for debugging)
   */
  get currentBuffer(): string {
    return this.buffer;
  }

  /**
   * Get current buffer size (for monitoring)
   */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

