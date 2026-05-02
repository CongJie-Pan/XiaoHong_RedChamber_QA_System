// =================================================================
// RATE LIMITING UTILITY
// Why: Implementing client-side rate limiting prevents unintended 
// request floods, protects backend resources from excessive load, 
// and ensures a fair distribution of resources among users. This 
// is particularly important for expensive LLM inference calls.
// =================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/** Rate limit configuration */
interface RateLimitConfig {
  /** Maximum requests allowed */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** 
 * Default rate limit: 20 requests per minute
 * Why: Provides a sensible default that allows for interactive 
 * chatting while preventing rapid automated spamming.
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 20,
  windowMs: 60_000,
};

/** In-memory store for rate limit entries */
const rateLimitStore = new Map<string, RateLimitEntry>();

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Periodically clean up expired entries to prevent memory leaks
 */
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup(): void {
  // IF: Cleanup timer is already running
  // Why: Avoid creating redundant intervals.
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      // IF: The rate limit window for this entry has passed
      // Why: Free up memory by removing stale tracking data.
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // IF: Environment supports unref (Node.js)
  // Why: Ensure the cleanup timer doesn't prevent the process from 
  // exiting in server-side environments (like Next.js API routes).
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Extracts client identifier from request
 * Uses X-Forwarded-For header or falls back to a default
 * @param request - The incoming request
 * @returns Client identifier string
 */
export function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  
  // IF: Request went through a proxy/load balancer
  // Why: Identify the original client IP rather than the proxy's IP.
  if (forwardedFor) {
    // Get first IP in chain (original client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  
  // IF: Server provides the real IP header
  // Why: Alternative way to identify the client IP.
  if (realIp) {
    return realIp;
  }

  // ELSE: No IP header found
  // Why: Fallback for local development or unexpected network configurations.
  return 'unknown-client';
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Time until rate limit resets (seconds) */
  resetIn: number;
  /** Total requests allowed */
  limit: number;
}

/**
 * Checks if a request should be rate limited
 * @param identifier - Client identifier (IP or user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  startCleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // IF: No existing entry or the previous window has expired
  // Why: Initialize a new rate limit window for this client.
  if (!entry || entry.resetTime < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: Math.ceil(config.windowMs / 1000),
      limit: config.maxRequests,
    };
  }

  // ELSE: Within an active window
  // Why: Increment the counter and check against the limit.
  entry.count += 1;

  const resetIn = Math.ceil((entry.resetTime - now) / 1000);
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const allowed = entry.count <= config.maxRequests;

  return {
    allowed,
    remaining,
    resetIn,
    limit: config.maxRequests,
  };
}

/**
 * Resets rate limit for a specific identifier
 * Useful for testing
 * @param identifier - Client identifier to reset
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Clears all rate limit entries
 * Useful for testing
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

