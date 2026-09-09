/**
 * Lightweight DB-backed job poller — replaces BullMQ/Redis for dispatching
 * work to this service's three pipeline stages.
 *
 * Why: a BullMQ Worker keeps a permanent blocking connection to Redis and
 * runs its own internal maintenance (stalled-job checks, blocking pop
 * retries) continuously — forever, even with zero jobs. On a metered Redis
 * (Upstash free tier, 500k commands/month) that idle heartbeat alone burns
 * through the quota just from the worker being alive. Postgres/Supabase has
 * no such per-command metering, so polling it directly for "what needs
 * doing" removes that cost entirely.
 *
 * Each "queue" here is really just rows in Postgres matching some
 * "not yet processed" condition (see fetchBatch in each worker file). The
 * poller repeatedly claims a small batch, runs them concurrently, and only
 * sleeps when there was nothing to do — so a burst of work still drains
 * quickly, and idle time costs nothing but a cheap SELECT every few seconds.
 */

import { logger } from "../utils/logger.js";

export interface Poller {
  close(): Promise<void>;
}

export interface PollerOptions<T> {
  name:           string;
  pollIntervalMs: number;
  batchSize:      number;
  /** Fetch (and, if applicable, atomically claim) up to `limit` pending items. */
  fetchBatch:     (limit: number) => Promise<T[]>;
  /** Do the actual work for one item. Throw to trigger a retry / eventual onItemFailed. */
  processOne:     (item: T) => Promise<void>;
  /** How many times to try one item before giving up. Default 1 (no retry). */
  attempts?:      number;
  /** Base backoff between attempts, multiplied by attempt number. */
  backoffMs?:     number;
  /** Called once all attempts for an item are exhausted. Use this to mark
   *  the underlying row "done" somehow so it stops being re-fetched forever. */
  onItemFailed?:  (item: T, err: unknown) => Promise<void> | void;
}

function sleep(ms: number, signal: { stopped: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Best-effort early wake on shutdown — checked via the loop's own
    // `stopped` flag on the next iteration regardless, this just avoids
    // waiting the full interval out during a graceful shutdown.
    const check = setInterval(() => {
      if (signal.stopped) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 250);
    setTimeout(() => clearInterval(check), ms);
  });
}

export function startPoller<T>(opts: PollerOptions<T>): Poller {
  const log = logger.child({ poller: opts.name });
  const state = { stopped: false };
  const attempts  = opts.attempts  ?? 1;
  const backoffMs = opts.backoffMs ?? 0;

  async function processWithRetry(item: T): Promise<void> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await opts.processOne(item);
        return;
      } catch (err) {
        lastErr = err;
        log.warn({ err, attempt: i + 1, attempts }, `[${opts.name}] attempt failed`);
        if (i < attempts - 1 && backoffMs > 0) {
          await sleep(backoffMs * (i + 1), state);
        }
      }
    }
    log.error({ err: lastErr }, `[${opts.name}] all attempts exhausted`);
    try {
      await opts.onItemFailed?.(item, lastErr);
    } catch (err) {
      log.error({ err }, `[${opts.name}] onItemFailed handler itself threw`);
    }
  }

  async function loop(): Promise<void> {
    log.info(`[${opts.name}] poller ready`);
    while (!state.stopped) {
      let batch: T[] = [];
      try {
        batch = await opts.fetchBatch(opts.batchSize);
      } catch (err) {
        log.error({ err }, `[${opts.name}] fetchBatch error`);
      }

      if (batch.length > 0) {
        await Promise.all(batch.map((item) => processWithRetry(item)));
        // Work was waiting — check again immediately instead of sleeping,
        // in case more is queued up behind it.
        continue;
      }

      if (!state.stopped) await sleep(opts.pollIntervalMs, state);
    }
    log.info(`[${opts.name}] poller stopped`);
  }

  const runPromise = loop();

  return {
    async close() {
      state.stopped = true;
      await runPromise;
    },
  };
}
