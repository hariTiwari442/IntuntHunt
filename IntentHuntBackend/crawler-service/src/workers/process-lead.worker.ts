/**
 * Process-lead poller.
 * ─────────────────────
 * One item per pre-qualified lead. Runs Steps 4+5 (fetch full content via
 * ScrapeCreators, all three platforms — Reddit, LinkedIn, Twitter — then
 * deep-score via GPT-4o-mini on the real post instead of just the Google
 * snippet, delegating the actual scoring to deepScoreLead() in
 * pipeline/step4-5-process-lead.ts — the single source of truth for that
 * prompt, shared with the CLI test path). Updates the lead row in DB
 * (Realtime fires), then:
 *
 *   - Increments SearchRun.processedUrls
 *   - If processedUrls === totalUrls → marks SearchRun completed
 *
 * No explicit reply-gen hand-off: a lead that ends up with intentScore >= 60
 * (and isn't a competitor thread / has a real reply opportunity) is picked
 * up automatically by the reply-gen poller on its own next tick, because
 * that's exactly the condition it watches for.
 *
 * "Queue" here is `WHERE contentFetchedAt IS NULL`, claimed via
 * Lead.claimedAt (see fetchPendingLeads) so a second poller instance can't
 * grab the same row. process() itself is also re-entry-safe: a retried or
 * re-claimed lead reuses whatever content/score is already on the row
 * instead of re-fetching/re-scoring, and processedUrls is only ever
 * incremented once per lead (leadRepository.markProcessedOnce).
 *
 * Concurrency: 3 (ScrapeCreators rate-friendly) — matches the old BullMQ setting.
 */

import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import { startPoller, type Poller } from "./poller.js";
import { fetchPost } from "../lib/scrapecreators.js";
import { deepScoreLead } from "../pipeline/step4-5-process-lead.js";
import type { LeadType, ProductIntelligence } from "../pipeline/types.js";

interface ProcessLeadItem {
  leadId:      string;
  searchRunId: string;
  productId:   string;
}

// ── Main process function ───────────────────────────────────────────────────

async function process(item: ProcessLeadItem): Promise<void> {
  const { leadId, searchRunId, productId } = item;
  const log = logger.child({ searchRunId, leadId });

  const product = await prisma.product.findUnique({
    where:  { id: productId },
    select: { intelligence: true },
  });
  if (!product) throw new Error(`Product ${productId} not found`);
  const intelligence = product.intelligence as unknown as ProductIntelligence;

  // Load the lead row (already inserted with pre-score by orchestrator)
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Step 4: fetch the real post (Reddit/LinkedIn/Twitter) instead of relying
  // on the Google snippet. If this throws (dead link, API error), the whole
  // process() call throws too — the poller's retry/backoff handles transient
  // failures, and onItemFailed (below) falls back to the snippet after final
  // failure, same safety net as before this was re-enabled.
  //
  // Re-entry guard: a poller retry (or a claim reused after a stale-claim
  // reclaim) can call process() again for a lead that already got through
  // this step on a prior attempt. Re-fetching would burn another
  // ScrapeCreators credit for no reason, so reuse what's already on the row
  // instead of calling fetchPost again.
  let fetched: {
    content:           string;
    author:            string | null;
    authorProfileUrl?: string;
    postScore:         number;
    commentCount:      number;
    postedAt:          Date | null;
    topComments:       string[];
  };
  if (lead.contentFetchedAt) {
    fetched = {
      content:          lead.content ?? "",
      author:           lead.author,
      ...(lead.authorProfileUrl ? { authorProfileUrl: lead.authorProfileUrl } : {}),
      postScore:        lead.postScore,
      commentCount:     lead.commentCount,
      postedAt:         lead.postedAt,
      topComments:      Array.isArray(lead.topComments) ? (lead.topComments as string[]) : [],
    };
  } else {
    log.info("[process-lead] fetching full content");
    fetched = await fetchPost(lead.url, lead.platform);

    await leadRepository.updateContent(leadId, {
      content:          fetched.content,
      author:           fetched.author,
      ...(fetched.authorProfileUrl ? { authorProfileUrl: fetched.authorProfileUrl } : {}),
      postScore:        fetched.postScore,
      commentCount:     fetched.commentCount,
      postedAt:         fetched.postedAt,
      topComments:      fetched.topComments,
    });
  }

  // Same re-entry guard for Step 5 — don't spend a second GPT call re-scoring
  // a lead a prior attempt already scored.
  let finalScore: number;
  let finalLeadType: LeadType;
  if (lead.deepScoredAt) {
    finalScore    = lead.intentScore;
    finalLeadType = lead.leadType;
  } else {
    log.info("[process-lead] deep scoring");
    const score = await deepScoreLead(
      {
        url:          lead.url,
        platform:     lead.platform,
        subreddit:    lead.subreddit,
        title:        lead.title,
        content:      fetched.content,
        postScore:    fetched.postScore,
        commentCount: fetched.commentCount,
        topComments:  fetched.topComments,
        author:       fetched.author,
      },
      intelligence,
    );

    finalScore    = score.intentScore;
    finalLeadType = score.leadType;

    await leadRepository.updateScore(leadId, {
      intentScore:        score.intentScore,
      leadType:           score.leadType,
      reasoning:          score.reasoning,
      replyOpportunity:   score.replyOpportunity,
      suggestedAngle:     score.suggestedAngle,
      isCompetitorThread: score.isCompetitorThread,
    });

    log.info({ score: finalScore, leadType: finalLeadType }, "[process-lead] scored");
  }

  // No explicit reply-gen enqueue — the reply-gen poller's own WHERE clause
  // (deepScoredAt set, replyGeneratedAt null, intentScore >= 60, not a
  // competitor, replyOpportunity != "none") already matches this row now
  // that updateScore() above set deepScoredAt. It'll pick it up on its
  // next tick regardless of whether we do anything else here.

  // ── Update SearchRun counters + completion check ─────────────────
  // markProcessedOnce guards this whole block so a poller retry or a
  // concurrent instance that reaches this same lead a second time can never
  // bump processedUrls twice — without it, a transient failure on the lines
  // below (which used to run straight after an un-guarded increment) would
  // make the poller re-run this entire function from the top on retry,
  // double-fetching + double-scoring + double-counting the same lead.
  const countedNow = await leadRepository.markProcessedOnce(leadId);
  if (countedNow) {
    const { processedUrls, totalUrls } = await searchRunRepository.incrementProcessed(searchRunId);

    if (finalScore >= 40) {
      await prisma.searchRun.update({
        where: { id: searchRunId },
        data:  { leadsScored: { increment: 1 } },
      });
    }

    if (totalUrls != null && processedUrls >= totalUrls) {
      log.info({ processedUrls, totalUrls }, "[process-lead] all leads processed → marking SearchRun complete");
      await searchRunRepository.markCompleted(searchRunId);
    }
  } else {
    log.info("[process-lead] already counted toward SearchRun on a prior attempt — skipping counters");
  }
}

// ── Claiming ─────────────────────────────────────────────────────────────────

// If a claimed lead's worker dies mid-attempt (crash, redeploy) before
// setting contentFetchedAt, the claim goes stale after this window and
// another poller tick is free to pick the row back up.
const STALE_CLAIM_MS = 10 * 60 * 1000;

async function fetchPendingLeads(limit: number): Promise<ProcessLeadItem[]> {
  const claimedIds = await leadRepository.claimForPoller(
    { contentFetchedAt: null },
    limit,
    STALE_CLAIM_MS,
  );
  if (claimedIds.length === 0) return [];

  const rows = await prisma.lead.findMany({
    where:  { id: { in: claimedIds } },
    select: { id: true, searchRunId: true, productId: true },
  });
  return rows.map((r) => ({ leadId: r.id, searchRunId: r.searchRunId, productId: r.productId }));
}

// ── Poller boot ─────────────────────────────────────────────────────────────

export function startProcessLeadWorker(): Poller {
  return startPoller<ProcessLeadItem>({
    name:           "process-lead",
    pollIntervalMs: 3_000,
    batchSize:      3,     // matches the old BullMQ concurrency
    attempts:       3,
    backoffMs:      5_000,
    fetchBatch:     fetchPendingLeads,
    processOne:     process,
    onItemFailed: async (item) => {
      logger.warn({ leadId: item.leadId }, "[process-lead] giving up on lead after final failure");
      // Still count it as processed (mirrors old BullMQ "failed" handler)
      // so the SearchRun completion check fires correctly, AND make sure
      // contentFetchedAt actually gets set even if every attempt died
      // before reaching that line — otherwise this row would match
      // fetchPendingLeads forever and retry on every future poll tick.
      try {
        const lead = await prisma.lead.findUnique({
          where:  { id: item.leadId },
          select: { contentFetchedAt: true, googleSnippet: true },
        });
        if (lead && !lead.contentFetchedAt) {
          await leadRepository.updateContent(item.leadId, {
            content:     lead.googleSnippet ?? "",
            topComments: [],
          });
        }
        // Same exactly-once guard as the success path — a lead that already
        // got counted by an earlier attempt (which then failed on a later
        // step) must not be counted again here.
        const countedNow = await leadRepository.markProcessedOnce(item.leadId);
        if (countedNow) {
          const { processedUrls, totalUrls } = await searchRunRepository.incrementProcessed(item.searchRunId);
          if (totalUrls != null && processedUrls >= totalUrls) {
            await searchRunRepository.markCompleted(item.searchRunId);
          }
        }
      } catch (e) {
        logger.error({ e }, "[process-lead] failed to clean up after final failure");
      }
    },
  });
}
