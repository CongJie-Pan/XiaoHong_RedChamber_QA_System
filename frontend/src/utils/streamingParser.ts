// =================================================================
// STREAMING PARSER UTILITY
// Why: Standardizing the extraction of 'thinking' (CoT) and 'answer' 
// content from LLM streams. LLMs often output internal reasoning 
// within <think> tags. This parser identifies these boundaries 
// even when they are split across multiple network chunks, allowing 
// the UI to render the thinking process and the final answer in 
// separate components simultaneously.
// =================================================================

export type ParseResult = {
  text: string;
  thinking: string;
  isThinking: boolean;
};

/**
 * Stateful parser for dealing with Server-Sent Events (SSE) streaming
 * where a <think> or </think> tag could be split unpredictably across chunks.
 * Example split: Chunk 1: `<thi` Chunk 2: `nk>Hello`
 */
export class StreamingParser {
  private buffer: string = '';
  private isThinkingState: boolean = false;

  public parseChunk(chunk: string): ParseResult {
    this.buffer += chunk;
    
    let textOut = '';
    let thinkOut = '';

    while (this.buffer.length > 0) {
      // IF: Currently parsing normal answer text
      // Why: Look for the transition to a thinking block.
      if (!this.isThinkingState) {
        const startIndex = this.buffer.indexOf('<think>');
        const possibleStart = this.buffer.indexOf('<');

        // IF: Found a complete opening <think> tag
        // Why: Transition state to thinking mode and separate the content.
        if (startIndex !== -1) {
          textOut += this.buffer.substring(0, startIndex);
          this.isThinkingState = true;
          this.buffer = this.buffer.substring(startIndex + 7); // 7 is length of <think>
        } 
        // IF: Found a partial tag at the end of the buffer
        // Why: Avoid prematurely committing text that might be part of a 
        // <think> tag in the next chunk.
        else if (possibleStart !== -1 && possibleStart > this.buffer.length - 7) {
          textOut += this.buffer.substring(0, possibleStart);
          this.buffer = this.buffer.substring(possibleStart);
          break; // Wait for next chunk
        } 
        // ELSE: No tags found
        // Why: Consume the entire buffer as normal text.
        else {
          textOut += this.buffer;
          this.buffer = '';
        }
      } 
      // ELSE: Currently parsing a thinking block
      // Why: Look for the transition back to normal answer text.
      else {
        const endIndex = this.buffer.indexOf('</think>');
        const possibleEnd = this.buffer.indexOf('<');

        // IF: Found a complete closing </think> tag
        // Why: Transition state back to normal text mode.
        if (endIndex !== -1) {
          thinkOut += this.buffer.substring(0, endIndex);
          this.isThinkingState = false;
          this.buffer = this.buffer.substring(endIndex + 8); // 8 is length of </think>
        } 
        // IF: Found a partial closing tag at the end of the buffer
        // Why: Defer parsing until the full tag is received in the next chunk.
        else if (possibleEnd !== -1 && possibleEnd > this.buffer.length - 8) {
          thinkOut += this.buffer.substring(0, possibleEnd);
          this.buffer = this.buffer.substring(possibleEnd);
          break;
        } 
        // ELSE: Still inside the thinking block
        // Why: Consume the entire buffer as thinking content.
        else {
          thinkOut += this.buffer;
          this.buffer = '';
        }
      }
    }

    return {
      text: textOut,
      thinking: thinkOut,
      isThinking: this.isThinkingState
    };
  }
}

