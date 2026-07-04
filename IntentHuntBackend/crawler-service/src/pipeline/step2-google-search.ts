/**
 * Step 2: Google Search via Serper.dev
 * ─────────────────────────────────────
 * Takes the QueryBundle from Step 1, prefixes each query with the appropriate
 * `site:` operator, runs them through Serper, and returns deduped + filtered
 * URLs tagged by platform.
 *
 * For v1 we only search Reddit + LinkedIn. Twitter / Product Hunt / Indie
 * Hackers queries are kept in the bundle (Step 1 generates them) but we don't
 * actually search them until those platforms are turned on.
 *
 * Filtering:
 *   - Drop non-post URLs (Reddit URLs that aren't /comments/, LinkedIn URLs
 *     that aren't /posts/ or /pulse/)
 *   - Dedupe by URL across all queries — first occurrence wins
 *
 * Concurrency: 5 queries in flight at once. Adjust via options.
 */

import { logger } from "../utils/logger.js";
import {
  isSerperQueryPatternError,
  serperSearch,
  type SerperOrganicResult,
} from "../lib/serper.js";
import { parseUrl } from "../lib/url-parser.js";
import type {
  GoogleResult,
  GoogleSearchOptions,
  GoogleSearchResult,
  Platform,
  QueryBundle,
} from "./types.js";

// ── Query builders per platform ─────────────────────────────────────────────

interface BuiltQuery {
  fullQuery:  string;          // what we send to Serper (with site: prefix)
  platform:   Platform;
  rawQuery:   string;          // original query from Step 1
}

function loosePlatformQuery(q: BuiltQuery): string {
  switch (q.platform) {
    case "reddit":
      return `reddit ${q.rawQuery}`;
    case "linkedin":
      return `linkedin posts ${q.rawQuery}`;
    case "twitter":
      return `twitter ${q.rawQuery}`;
  }
}

/**
 * Build the search queries we'll send to Serper.
 *
 * HYBRID STRATEGY:
 *   - Reddit: NO `site:` operator. Plain keywords like `reddit {query}` and
 *     `reddit {subreddit} {query}`. Reddit is heavily indexed by Google, so
 *     these naturally surface tons of reddit.com URLs. Avoids `site:` rate
 *     limits during high-volume Reddit bursts (20+ queries per crawl).
 *
 *   - LinkedIn: USE `site:linkedin.com/posts {query}`. LinkedIn isn't well
 *     indexed without `site:`, and we only fire 0-3 LinkedIn queries per
 *     crawl — safely under Serper's rate limit.
 *
 * URL parser then filters non-matching results out of both platforms.
 */
function buildQueries(bundle: QueryBundle, platforms: Platform[]): BuiltQuery[] {
  const out: BuiltQuery[] = [];

  if (platforms.includes("reddit")) {
    // Global reddit queries — plain keyword "reddit" biases Google toward reddit.com
    for (const q of bundle.redditGlobal) {
      out.push({
        fullQuery: `reddit ${q}`,
        platform:  "reddit",
        rawQuery:  q,
      });
    }
    // Per-subreddit queries — include the sub name as a keyword
    for (const [subreddit, queries] of Object.entries(bundle.redditSubreddit)) {
      for (const q of queries) {
        out.push({
          fullQuery: `reddit ${subreddit} ${q}`,
          platform:  "reddit",
          rawQuery:  q,
        });
      }
    }
  }

  if (platforms.includes("linkedin")) {
    // LinkedIn: use site:linkedin.com/posts to surface only real LinkedIn posts.
    // Serper free DOES accept this (tested 2026-05-20). Empty results are
    // common because Google's LinkedIn index is sparse — that's expected.
    //
    // We do NOT auto-quote the query: quoted phrases ("looking for X") return
    // near-zero results because exact phrases rarely match LinkedIn's index.
    // Step 1 generates natural keyword combos that work without quotes.
    for (const q of bundle.linkedin) {
      out.push({
        fullQuery: `site:linkedin.com/posts ${q}`,
        platform:  "linkedin",
        rawQuery:  q,
      });
    }
  }

  if (platforms.includes("twitter")) {
    // Twitter/X — Google's index is thin (de-indexed since 2023). We try
    // site:twitter.com first; if that 400s, the fallback ladder switches to
    // plain keywords. Expect 0-5 results per query at best.
    for (const q of bundle.twitter) {
      out.push({
        fullQuery: `site:twitter.com OR site:x.com ${q}`,
        platform:  "twitter",
        rawQuery:  q,
      });
    }
  }

  return out;
}

// ── Concurrency helper (no external dep) ────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

async function searchSerperWithFallback(
  q: BuiltQuery,
  resultsPerQuery: number,
  timeFilter: string | null,
): Promise<{ organic: SerperOrganicResult[]; executedQuery: string; fallback?: string }> {
  try {
    const organic = await serperSearch(q.fullQuery, {
      num: resultsPerQuery,
      ...(timeFilter ? { tbs: timeFilter } : {}),
    });
    return { organic, executedQuery: q.fullQuery };
  } catch (err) {
    if (!isSerperQueryPatternError(err)) throw err;

    if (timeFilter) {
      try {
        const organic = await serperSearch(q.fullQuery, { num: resultsPerQuery });
        return {
          organic,
          executedQuery: q.fullQuery,
          fallback: "removed-tbs",
        };
      } catch (fallbackErr) {
        if (!isSerperQueryPatternError(fallbackErr)) throw fallbackErr;
      }
    }

    if (resultsPerQuery !== 10) {
      try {
        const organic = await serperSearch(q.fullQuery, { num: 10 });
        return {
          organic,
          executedQuery: q.fullQuery,
          fallback: "removed-tbs-and-reduced-num",
        };
      } catch (fallbackErr) {
        if (!isSerperQueryPatternError(fallbackErr)) throw fallbackErr;
      }
    }

    if (q.fullQuery.includes("site:")) {
      const looseQuery = loosePlatformQuery(q);
      const organic = await serperSearch(looseQuery, { num: Math.min(resultsPerQuery, 10) });
      return {
        organic,
        executedQuery: looseQuery,
        fallback: "removed-site-operator",
      };
    }

    throw err;
  }
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Run all platform queries through Serper.dev and return deduped, filtered URLs.
 *
 * @throws Only on catastrophic config failure (SERPER_API_KEY missing).
 *         Individual query failures are logged + included in `errors`.
 */
export async function runGoogleSearch(
  bundle: QueryBundle,
  options: GoogleSearchOptions = {},
): Promise<GoogleSearchResult> {
  const platforms        = options.platforms        ?? ["reddit", "linkedin", "twitter"];
  // Concurrency 2 keeps us comfortably under Serper's rate limit even during
  // bursts. Higher concurrency intermittently triggers "Query pattern not
  // allowed" errors that are actually rate-limit responses in disguise.
  const concurrency      = options.concurrency      ?? 2;
  // 30 results/query: same Serper credit cost as 10, but 3× more URLs to mine.
  const resultsPerQuery  = options.resultsPerQuery  ?? 30;
  const timeFilter       = options.timeFilter === undefined ? "qdr:y" : options.timeFilter;

  const built = buildQueries(bundle, platforms);

  logger.info(
    { totalQueries: built.length, platforms, timeFilter },
    "[step2] Starting Google search",
  );

  const errors: Array<{ query: string; error: string }> = [];
  let totalRaw = 0;

  // Run all queries with concurrency limit
  const queryResults = await mapWithConcurrency(built, concurrency, async (q) => {
    const t0 = Date.now();
    try {
      const { organic, executedQuery, fallback } = await searchSerperWithFallback(
        q,
        resultsPerQuery,
        timeFilter,
      );
      const elapsed = Date.now() - t0;
      const linkPreview = organic.slice(0, 3).map((r) => r.link);
      logger.info(
        {
          platform: q.platform,
          fullQuery: q.fullQuery,
          executedQuery,
          fallback,
          rawCount: organic.length,
          elapsedMs: elapsed,
          firstLinks: linkPreview,
        },
        `[step2] Serper query → ${organic.length} results`,
      );
      return organic.map((r) => ({ ...r, query: q }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ query: q.fullQuery, error: msg });
      logger.warn({ err, fullQuery: q.fullQuery }, "[step2] Serper query failed");
      return [];
    }
  });

  // Flatten + parse + filter + dedupe (with detailed logging on drops)
  const seen = new Set<string>();
  const dedupedResults: GoogleResult[] = [];
  const dropReasons = { invalid: 0, platformMismatch: 0, duplicate: 0 };

  for (const batch of queryResults) {
    for (const item of batch) {
      totalRaw++;
      const parsed = parseUrl(item.link);
      if (!parsed) {
        dropReasons.invalid++;
        logger.debug({ link: item.link, reason: "no-parse" }, "[step2] dropped");
        continue;
      }
      if (!parsed.isValid) {
        dropReasons.invalid++;
        logger.debug({ link: item.link, parsedPlatform: parsed.platform, reason: "not a post URL" }, "[step2] dropped");
        continue;
      }
      if (parsed.platform !== item.query.platform) {
        dropReasons.platformMismatch++;
        logger.debug(
          { link: item.link, expectedPlatform: item.query.platform, gotPlatform: parsed.platform },
          "[step2] dropped — platform mismatch",
        );
        continue;
      }
      if (seen.has(item.link)) {
        dropReasons.duplicate++;
        continue;
      }
      seen.add(item.link);

      dedupedResults.push({
        title:                  item.title,
        link:                   item.link,
        snippet:                item.snippet,
        ...(item.date ? { date: item.date } : {}),
        position:               item.position,
        query:                  item.query.fullQuery,
        platform:               parsed.platform,
        ...(parsed.subreddit ? { subreddit: parsed.subreddit } : {}),
      });
    }
  }

  logger.info(
    {
      totalRaw,
      kept: dedupedResults.length,
      droppedInvalid: dropReasons.invalid,
      droppedPlatformMismatch: dropReasons.platformMismatch,
      droppedDuplicate: dropReasons.duplicate,
    },
    "[step2] URL parsing summary",
  );

  logger.info(
    {
      totalRaw,
      totalAfterDedup: dedupedResults.length,
      queriesExecuted: built.length,
      errorCount: errors.length,
    },
    "[step2] Google search complete",
  );

  return {
    results:         dedupedResults,
    totalRaw,
    totalAfterDedup: dedupedResults.length,
    queriesExecuted: built.length,
    errors,
  };
}
