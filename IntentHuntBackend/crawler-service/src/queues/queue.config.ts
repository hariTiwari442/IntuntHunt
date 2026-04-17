import type { DefaultJobOptions } from 'bullmq';
import { QueueName } from '../types/job.types.js';

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS  = 300_000;

/** Exponential backoff: min(2^attempt × 5s, 5min) */
export function computeBackoffDelay(attemptsMade: number): number {
  return Math.min(Math.pow(2, attemptsMade) * BASE_DELAY_MS, MAX_DELAY_MS);
}

/** Applied to every job added to a crawl queue */
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: BASE_DELAY_MS,
  },
  removeOnComplete: { count: 1000, age: 86_400 },   // keep last 1000, max 24h
  removeOnFail:     { count: 500,  age: 604_800 },   // keep failed for 7 days
};

/** Per-queue concurrency and rate limiter configuration */
export const QUEUE_CONFIG = {
  [QueueName.ORCHESTRATE]: {
    concurrency: 10,
    limiter: null,
  },
  [QueueName.REDDIT]: {
    concurrency: 5,
    // Max 55 requests per 60s — buffer below Reddit's 60/min limit
    limiter: { max: 55, duration: 60_000 } as const,
  },
  [QueueName.HN]: {
    concurrency: 3,
    // Max 450 requests per hour — Algolia is generous
    limiter: { max: 450, duration: 3_600_000 } as const,
  },
  [QueueName.LINKEDIN]: {
    concurrency: 2,
    // Apify actor runs are slow — keep concurrency low to avoid overloading
    limiter: { max: 10, duration: 60_000 } as const,
  },
  [QueueName.POST_PROCESS]: {
    concurrency: 10,
    limiter: null,
  },
  [QueueName.DLQ]: {
    concurrency: 2,
    limiter: null,
  },
} as const;
