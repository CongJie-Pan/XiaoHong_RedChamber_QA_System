// =================================================================
// CHAT SERVICE BARREL MODULE
// Why: Provides a unified entry point for all chat-related logic. 
// By modularizing the service into core, lifecycle, and mutation 
// components, we improve maintainability and follow the Single 
// Responsibility Principle while maintaining a clean public API.
// =================================================================

export * from './core';
export * from './lifecycle';
export * from './mutations';

/**
 * Re-export ValidationError for convenience
 */
export { ValidationError } from '@/utils/error';
