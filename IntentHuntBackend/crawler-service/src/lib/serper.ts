/**
 * Serper.dev API client — Google search wrapper.
 * Used by Step 2 of the lead pipeline.
 *
 * Pricing: $0.001 per query. Free tier: 2500 queries.
 *
 * Docs: https://serper.dev/api-key
 */

import { env } from "../config/env.js";

const DEFAULT_BASE = "https://google.serper.dev/search";

export interface SerperOrganicResult {
  title:    string;
  link:     string;
  snippet:  string;
  date?:    string;
  position: number;
}

export interface SerperResponse {
  organic?: SerperOrganicResult[];
  // Serper also returns answerBox, knowledgeGraph, etc. — we ignore them.
}

export interface SerperOptions {
  /** Number of results to fetch (default 10, max 100). */
  num?: number;
  /** Time-based search filter, e.g. "qdr:y" (year), "qdr:d" (day), "qdr:d7" (week). */
  tbs?: string;
  /** Country code (e.g. "us"). Default: serper's "us". */
  gl?: string;
  /** Language code (e.g. "en"). Default: "en". */
  hl?: string;
}

// Status codes that are worth retrying after a backoff:
//   429 = explicit rate limit
//   500/502/503/504 = transient server issues
// 400s are usually request/query-shape problems. Retrying them just burns
// credits and hides the exact query that Serper rejected.
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES        = 3;
const BASE_BACKOFF_MS    = 1_000;   // 1s, then 2s, then 4s

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SerperHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseText: string,
  ) {
    super(`Serper HTTP ${status}: ${responseText.slice(0, 200)}`);
    this.name = "SerperHttpError";
  }
}

export function isSerperQueryPatternError(err: unknown): boolean {
  return err instanceof SerperHttpError
    && err.status === 400
    && /query pattern not allowed/i.test(err.responseText);
}

/**
 * Run a single Google search query via Serper.
 *
 * Retries on 400 (Serper's confusing rate-limit-as-400) and 429 with
 * exponential backoff. Other errors fail fast.
 *
 * @throws if SERPER_API_KEY is missing or all retries exhausted.
 */
export async function serperSearch(
  query: string,
  options: SerperOptions = {},
): Promise<SerperOrganicResult[]> {
  if (!env.SERPER_API_KEY) {
    throw new Error(
      "SERPER_API_KEY not set. Add it to crawler-service/.env to use Step 2 (Google search).",
    );
  }

  const url = env.SERPER_BASE_URL ?? DEFAULT_BASE;

  const body: Record<string, unknown> = {
    q:   query,
    num: options.num ?? 10,
  };
  if (options.tbs) body.tbs = options.tbs;
  if (options.gl)  body.gl  = options.gl;
  if (options.hl)  body.hl  = options.hl;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method:  "POST",
        headers: {
          "X-API-KEY":    env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as SerperResponse;
        return data.organic ?? [];
      }

      const text = await response.text().catch(() => "");
      const err = new SerperHttpError(response.status, text);
      lastError = err;

      // Retryable? Back off and try again.
      if (RETRY_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
        const wait = BASE_BACKOFF_MS * Math.pow(2, attempt); // 1s, 2s, 4s
        await sleep(wait);
        continue;
      }

      // Non-retryable error or out of retries
      throw err;
    } catch (err) {
      // Network/abort/etc — also retry-eligible up to MAX_RETRIES
      if (lastError === null) lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        const wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Serper request failed after retries");
}
