/**
 * Rate Limiter
 *
 * Token bucket rate limiter for CEJ requests.
 * Prevents overwhelming the CEJ website with too many requests.
 * Works alongside BullMQ's built-in rate limiter for defense-in-depth.
 */
import config from "../config";
import { logger } from "../monitoring/logger";

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(
    maxRequestsPerWindow: number = config.rateLimitMax,
    windowMs: number = config.rateLimitDurationMs
  ) {
    this.maxTokens = maxRequestsPerWindow;
    this.tokens = maxRequestsPerWindow;
    this.refillRate = maxRequestsPerWindow / windowMs;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire a token for making a request.
   * Returns true if allowed, false if rate limited.
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available (blocking).
   * Returns the wait time in ms.
   */
  async waitForToken(): Promise<number> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate wait time until next token
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;

    return waitMs;
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /**
   * Get current token count (for monitoring).
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/** Singleton rate limiter instance for CEJ requests */
export const cejRateLimiter = new RateLimiter();
