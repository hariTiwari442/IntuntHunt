/**
 * Orchestrator worker.
 * ─────────────────────
 * One job per "Find Leads" click. Runs Steps 1+2+3 inline (sequential), then
 * inserts pre-scored leads into the DB and fans out PROCESS_LEAD jobs.
 *
 * Fast path: if the product already has cached intelligence + queries, skips
 * Step 1 (saves a GPT-4o call).
 *
 * Why inline 1+2+3 instead of separate workers? They're sequential anyway and
 * complete in ~15s. Three queues would add Redis hops without any parallelism
 * benefit.
 */

import { Worker } from "bullmq";
import { bullmqRedis } from "../cache/redis.client.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import {
  QueueNames,
  processLeadQueue,
  type OrchestratorPayload,
  type ProcessLeadPayload,
} from "../queues/queue.registry.js";
import { runKeywordEngine } from "../pipeline/step1-keyword-engine.js";
import { runGoogleSearch } from "../pipeline/step2-google-search.js";
import { runPreScore } from "../pipeline/step3-pre-score.js";
import type {
  KeywordEngineResult,
  ProductIntelligence,
  QueryBundle,
} from "../pipeline/types.js";

async function process(payload: OrchestratorPayload): Promise<void> {
  const { searchRunId, productId, userId } = payload;
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

  // ── Look up the row IDs (createMany doesn't return them in Prisma) ─
  const leadRows = await prisma.lead.findMany({
    where:  { searchRunId },
    select: { id: true, url: true },
  });

  // ── Fan out PROCESS_LEAD jobs ──────────────────────────────────────
  const intelligenceJson = JSON.stringify(intelligence);
  await processLeadQueue.addBulk(
    leadRows.map((row) => ({
      name: "process-lead",
      data: {
        searchRunId,
        productId,
        leadId:           row.id,
        intelligenceJson,
      } satisfies ProcessLeadPayload,
    })),
  );

  log.info({ enqueued: leadRows.length }, "[orchestrator] PROCESS_LEAD jobs enqueued");

  // Mark search run lastSearchedAt on the product
  await prisma.product.update({
    where: { id: productId },
    data:  { lastSearchedAt: new Date() },
  });
}

// ── Worker boot ─────────────────────────────────────────────────────────────

export function startOrchestratorWorker(): Worker {
  const worker = new Worker<OrchestratorPayload>(
    QueueNames.ORCHESTRATOR,
    async (job) => {
      try {
        await process(job.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, searchRunId: job.data.searchRunId }, "[orchestrator] failed");
        // Mark the SearchRun as failed so frontend stops waiting
        await searchRunRepository
          .markFailed(job.data.searchRunId, msg)
          .catch(() => {});
        throw err;
      }
    },
    { connection: bullmqRedis, concurrency: 2 },
  );

  worker.on("ready", () => logger.info("[orchestrator] worker ready"));
  return worker;
}
