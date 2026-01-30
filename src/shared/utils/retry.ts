/**
 * Retry with Exponential Backoff
 *
 * Generic retry utility used by components that make external calls
 * (CAPTCHA API, S3 uploads, database connections).
 * BullMQ handles job-level retries; this is for sub-operation retries.
 */
import { logger } from "../../monitoring/logger";

interface RetryOptions {
  /** Maximum number of attempts (including the first) */
  maxAttempts: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Multiply delay by this factor on each retry (default: 2) */
  backoffFactor?: number;
  /** Optional label for log messages */
  label?: string;
}

/**
 * Executes an async function with exponential backoff retry.
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns The result of fn() on success
 * @throws The last error if all attempts are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, initialDelayMs, backoffFactor = 2, label = "operation" } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        logger.error(
          { attempt, maxAttempts, error: lastError.message, label },
          `${label} failed after ${maxAttempts} attempts`
        );
        throw lastError;
      }

      const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      // Add jitter (±20%) to prevent thundering herd
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      const actualDelay = Math.round(delay + jitter);

      logger.warn(
        { attempt, maxAttempts, delay: actualDelay, error: lastError.message, label },
        `${label} attempt ${attempt} failed, retrying in ${actualDelay}ms`
      );

      await sleep(actualDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
