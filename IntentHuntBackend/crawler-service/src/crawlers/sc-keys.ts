import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Build the key pool. Prefer SCRAPECREATORS_API_KEYS (comma-separated) if set,
// otherwise fall back to the single SCRAPECREATORS_API_KEY.
function buildPool(): string[] {
  if (env.SCRAPECREATORS_API_KEYS) {
    const keys = env.SCRAPECREATORS_API_KEYS
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (keys.length > 0) return keys;
  }
  if (env.SCRAPECREATORS_API_KEY) return [env.SCRAPECREATORS_API_KEY];
  throw new Error('No ScrapeCreators keys configured');
}

const POOL = buildPool();
const DEAD = new Set<number>();   // indices marked dead this process lifetime
let cursor = 0;

logger.info({ keyCount: POOL.length }, 'ScrapeCreators key pool initialised');

/** Get the next live key in round-robin order. Returns null if all keys are dead. */
export function nextKey(): { key: string; index: number } | null {
  for (let attempt = 0; attempt < POOL.length; attempt++) {
    const idx = cursor % POOL.length;
    cursor = (cursor + 1) % POOL.length;
    if (!DEAD.has(idx)) {
      return { key: POOL[idx]!, index: idx };
    }
  }
  return null;
}

/** Mark a key as dead (out of credits or revoked). Won't be retried this process. */
export function markDead(index: number, reason: string): void {
  if (DEAD.has(index)) return;
  DEAD.add(index);
  logger.warn(
    { keyIndex: index, reason, remainingLiveKeys: POOL.length - DEAD.size },
    'ScrapeCreators key marked dead',
  );
}

export function poolSize(): number {
  return POOL.length;
}
