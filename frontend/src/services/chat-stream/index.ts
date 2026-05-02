// =================================================================
// CHAT STREAM BARREL MODULE
// Why: Provides a unified interface for streaming chat functionality, 
// abstracting the complexities of network communication and content 
// parsing from the rest of the application.
// =================================================================

export { ThinkTagParser } from './parser';
export { createChatStream } from './client';
export * from './types';

