/**
 * Orchestrator poller.
 * ─────────────────────
 * One "item" per "Find Leads" click. Runs Steps 1+2+3 inline (sequential),
 * then inserts pre-scored leads into the DB. That's it — no fan-out step.
 * Leads land with contentFetchedAt = null, which the process-lead poller
 * treats as "pending" on its own; no explicit hand-off needed.
 *
 * Why inline 1+2+3 instead of separate stages? They're sequential anyway and
 * complete in ~15s. Splitting them wouldn't add any parallelism.
 *
 * Claiming: a SearchRun starts life with status "pending" (see
 * search-run.repository.ts). This poller atomically flips one to "running"
 * via an UPDATE guarded on it still being "pending" — if two poll ticks ever
 * raced on the same row, only one would succeed (updateMany's count tells
 * us which). It also reclaims rows stuck in "running" for >15 minutes,
 * which only happens if a previous attempt crashed mid-run (e.g. the VM
 * restarting) — Steps 1-3 are safe to redo: Step 1 uses the cached
 * intelligence/queries once present, Step 2's seen-url filter skips
 * already-processed URLs, and Step 3's lead insert skips duplicates on
 * (productId, url).
 */

import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import { startPoller, type Poller } from "./poller.js";
import { runKeywordEngine } from "../pipeline/step1-keyword-engine.js";
import { runGoogleSearch } from "../pipeline/step2-google-search.js";
import { runPreScore } from "../pipeline/step3-pre-score.js";
import type {
  KeywordEngineResult,
  ProductIntelligence,
  QueryBundle,
} from "../pipeline/types.js";

interface OrchestratorItem {
  searchRunId: string;
  productId:   string;
  userId:      string;
}

const STALE_RUNNING_MS = 15 * 60 * 1000;

async function process(item: OrchestratorItem): Promise<void> {
  const { searchRunId, productId } = item;
  const log = logger.child({ searchRunId, productId });

  log.info("[orchestrator] starting");

  // ── Load product (description + cached intel/queries) ──────────────
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { description: true, intelligence: true, queries: true },
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  // ── Step 1: keyword engine (or use cache) ──────────────────────────
  let intelligence: ProductIntelligence;
  let queries:      QueryBundle;

  const hasCachedIntel = product.intelligence
    && typeof product.intelligence === "object"
    && (product.intelligence as Record<string, unknown>).productType;
  const hasCachedQueries = product.queries
    && typeof product.queries === "object"
    && (product.queries as Record<string, unknown>).redditGlobal;

  if (hasCachedIntel && hasCachedQueries) {
    log.info("[orchestrator] using cached intelligence + queries");
    intelligence = product.intelligence as unknown as ProductIntelligence;
    queries      = product.queries      as unknown as QueryBundle;
  } else {
    log.info("[orchestrator] running keyword engine (no cache)");
    const k: KeywordEngineResult = await runKeywordEngine(product.description);
    intelligence = k.intelligence;
    queries      = k.queries;

    // Persist back to product so future runs can reuse
    await prisma.product.update({
      where: { id: productId },
      data: {
        intelligence: intelligence as unknown as object,
        queries:      queries as unknown as object,
        subreddits:   Object.keys(queries.redditSubreddit),
      },
    });
  }

  // ── Step 2: Google search ──────────────────────────────────────────
  // First-ever search for this product → reach back 6 months to build the
  // initial backlog. Every subsequent run → only past 24h, so we (a) stay
  // cheap on Serper credits, (b) skip the long tail of stale posts, and
  // (c) keep daily runs fast (~15s instead of minutes).
  // We count ONLY `completed` runs so a crashed first attempt still gets
  // the wide window on retry.
  const priorCompleted = await prisma.searchRun.count({
    where: { productId, status: "completed" },
  });
  const isFirstSearch = priorCompleted === 0;
  const timeFilter    = isFirstSearch ? "qdr:m6" : "qdr:d";

  log.info({ isFirstSearch, timeFilter }, "[orchestrator] running Google search");
  const search = await runGoogleSearch(queries, {
    platforms: ["reddit", "linkedin", "twitter"],
    concurrency: 2,
    resultsPerQuery: 30,
    timeFilter,
  });

  // ── Step 2.5: filter against seen_urls (skip already-processed URLs) ─
  // Without this, a popular post hits both yesterday's qdr:m6 window and
  // today's qdr:d window — we'd burn Serper credits AND OpenAI pre-score
  // tokens on URLs we've already evaluated. Dedup at insert (the leads
  // table's @@unique constraint) handles the storage side, but the AI
  // cost is wasted before that.
  const candidateUrls = search.results.map((r) => r.link);
  const seenSet = new Set(
    (await prisma.seenUrl.findMany({
      where:  { productId, url: { in: candidateUrls } },
      select: { url: true },
    })).map((s) => s.url),
  );
  const freshResults = search.results.filter((r) => !seenSet.has(r.link));
  const skippedAsSeen = search.results.length - freshResults.length;

  log.info(
    {
      totalFromSearch: search.results.length,
      alreadySeen:     skippedAsSeen,
      freshToScore:    freshResults.length,
    },
    "[orchestrator] seen-url filter applied",
  );

  await searchRunRepository.update(searchRunId, {
    queriesUsed: search.queriesExecuted,
    urlsFound:   freshResults.length, // counter reflects what'll actually be scored
  });

  // ── Mark all Google-returned URLs as seen so we never reprocess them ─
  // Aggressive — even URLs that won't pass pre-score get marked. Trade-off:
  // saves cost on every subsequent run; risk is that a URL we scored 25 on
  // today (below 30 threshold) won't get a second look tomorrow if new
  // comments would have pushed it higher. For pre-score (title + snippet
  // only) that's a fine trade.
  if (candidateUrls.length > 0) {
    await prisma.seenUrl.createMany({
      data: candidateUrls.map((url) => ({ url, productId })),
      skipDuplicates: true,
    });
  }

  // Early-out: nothing new since last search. Mark completed so the UI
  // shows "0 new leads" instead of spinning.
  if (freshResults.length === 0) {
    log.info("[orchestrator] no new URLs since last search — marking completed");
    await searchRunRepository.markCompleted(searchRunId);
    return;
  }

  // ── Step 3: pre-score ──────────────────────────────────────────────
  log.info("[orchestrator] running pre-score");
  const preScore = await runPreScore(freshResults, intelligence, {
    batchSize: 12,
    concurrency: 5,
    threshold: 30,
  });

  await searchRunRepository.update(searchRunId, {
    urlsPreScored: preScore.passing.length,
    totalUrls:     preScore.passing.length,
  });

  if (preScore.passing.length === 0) {
    log.warn("[orchestrator] no leads passed pre-score — marking completed");
    await searchRunRepository.markCompleted(searchRunId);
    return;
  }

  // ── Insert pre-scored leads into DB (Realtime fires per row) ───────
  // contentFetchedAt is left null on every row here — that's the signal
  // the process-lead poller watches for. No explicit fan-out needed.
  const inserted = await leadRepository.createManyPreScored(
    preScore.passing.map((r) => ({
      productId,
      searchRunId,
      url:           r.link,
      platform:      r.platform,
      subreddit:     r.subreddit ?? null,
      title:         r.title,
      preScore:      r.preScore,
      googleSnippet: r.snippet,
      querySource:   r.query,
    })),
  );
  log.info({ inserted }, "[orchestrator] pre-scored leads inserted");

  // Mark search run lastSearchedAt on the product
  await prisma.product.update({
    where: { id: productId },
    data:  { lastSearchedAt: new Date() },
  });
}

// ── Claiming ─────────────────────────────────────────────────────────────────

async function claimPendingSearchRuns(limit: number): Promise<OrchestratorItem[]> {
  const candidates = await prisma.searchRun.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "running", startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
      ],
    },
    orderBy: { startedAt: "asc" },
    take: limit,
    select: { id: true, productId: true, userId: true },
  });

  const claimed: OrchestratorItem[] = [];
  for (const c of candidates) {
    // Guard the UPDATE on the row not already being claimed by a
    // concurrent tick — count === 1 means we won the race.
    const res = await prisma.searchRun.updateMany({
      where: { id: c.id, status: { in: ["pending", "running"] } },
      data:  { status: "running", startedAt: new Date() },
    });
    if (res.count === 1) {
      claimed.push({ searchRunId: c.id, productId: c.productId, userId: c.userId });
    }
  }
  return claimed;
}

// ── Poller boot ─────────────────────────────────────────────────────────────

export function startOrchestratorWorker(): Poller {
  return startPoller<OrchestratorItem>({
    name:           "orchestrator",
    pollIntervalMs: 3_000,
    batchSize:      2,     // matches the old BullMQ concurrency
    attempts:       2,
    backoffMs:      2_000,
    fetchBatch:     claimPendingSearchRuns,
    processOne:     process,
    onItemFailed: async (item, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      await searchRunRepository.markFailed(item.searchRunId, msg).catch(() => {});
    },
  });
}
