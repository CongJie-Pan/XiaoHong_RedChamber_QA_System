// =================================================================
// CHAT SERVICE STATE MANAGEMENT
// Why: Centralizes shared state across the modularized chat service 
// components. This prevents circular dependencies and ensures 
// that all modules (core, lifecycle, mutations) have access to 
// the active AbortController for stream management.
// =================================================================

/**
 * Active abort controller for the current stream
 * Why: Allows any part of the service to cancel an ongoing network 
 * request, preventing overlapping streams or resource leaks.
 */
let currentAbortController: AbortController | null = null;

/**
 * Get the current abort controller
 */
export function getAbortController(): AbortController | null {
  return currentAbortController;
}

/**
 * Set the current abort controller
 * @param controller - The new AbortController or null to clear
 */
export function setAbortController(controller: AbortController | null): void {
  currentAbortController = controller;
}

/**
 * Check if a stream is currently in progress
 * Why: Pure derived state to determine if the network request is 
 * still active and not yet aborted.
 */
export function isStreamActive(): boolean {
  return currentAbortController !== null && !currentAbortController.signal.aborted;
}
