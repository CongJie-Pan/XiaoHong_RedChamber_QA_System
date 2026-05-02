// =================================================================
// IDENTITY GENERATION UTILITIES
// Why: Centralizing ID generation ensures that all entities in the 
// local database (Dexie/IndexedDB) and transient UI state use a 
// consistent, collision-resistant format (UUID v4), preventing 
// data corruption and state synchronization issues.
// =================================================================

import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a UUID v4 string
 * Why: UUID v4 is used because it provides a high probability of 
 * uniqueness without requiring a central authority, which is ideal 
 * for local-first state management where offline-created entities 
 * must eventually sync with a backend.
 * @returns A unique identifier string
 */
export function generateUUID(): string {
  return uuidv4();
}

