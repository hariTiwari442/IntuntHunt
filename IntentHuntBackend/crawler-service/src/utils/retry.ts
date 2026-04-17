const BASE_DELAY_MS = 5_000;   // 5 seconds
const MAX_DELAY_MS = 300_000;  // 5 minutes

/**
 * Computes the delay for the next retry attempt using exponential backoff.
 * delay = min(2^attempt × 5s, 5min)
 *
 * attempt=0 → 5s, attempt=1 → 10s, attempt=2 → 20s, ...
 */
export function computeBackoffDelay(attemptsMade: number): number {
  const delay = Math.pow(2, attemptsMade) * BASE_DELAY_MS;
  return Math.min(delay, MAX_DELAY_MS);
}
