/**
 * Reply-gen poller.
 * ──────────────────
 * One item per high-intent lead. Calls Step 6 (GPT-4o reply generator),
 * writes the suggested reply to the lead row (Realtime fires).
 *
 * If the AI returns replyPossible=false, we store an empty reply so the
 * frontend can show "No natural reply available" instead of a spinner.
 *
 * "Queue" here is `WHERE deepScoredAt IS NOT NULL AND replyGeneratedAt IS
 * NULL AND intentScore >= 60 AND NOT isCompetitorThread AND
 * replyOpportunity != 'none'` — exactly the condition process-lead's
 * updateScore() satisfies for a qualifying lead. No explicit hand-off from
 * that stage needed; this poller finds it on its own next tick.
 */

import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import { startPoller, type Poller } from "./poller.js";
import { generateOneReply } from "../pipeline/step6-reply-gen.js";
import type { ProductIntelligence, ScoredLead } from "../pipeline/types.js";

const REPLY_THRESHOLD = 60;

interface ReplyGenItem {
  leadId: string;
}

async function process(item: ReplyGenItem): Promise<void> {
  const { leadId } = item;
  const log = logger.child({ leadId });

  const row = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!row) throw new Error(`Lead ${leadId} not found`);

  // Lead.productId is a plain scalar in this schema (no modeled Prisma
  // relation to Product — that model is owned across a service boundary),
  // so this is a separate query rather than an `include`.
  const product = await prisma.product.findUnique({
    where:  { id: row.productId },
    select: { intelligence: true, productUrl: true },
  });
  if (!product) throw new Error(`Product ${row.productId} not found`);

  const intelligence = product.intelligence as unknown as ProductIntelligence;

  // Build a ScoredLead-shaped object from the DB row to feed Step 6
  const scoredLead: ScoredLead = {
    url:                row.url,
    platform:           row.platform,
    subreddit:          row.subreddit ?? undefined,
    title:              row.title,
    content:            row.content ?? "",
    author:             row.author,
    authorProfileUrl:   row.authorProfileUrl ?? undefined,
    postScore:          row.postScore,
    commentCount:       row.commentCount,
    postedAt:           row.postedAt,
    topComments:        Array.isArray(row.topComments) ? (row.topComments as string[]) : [],
    preScore:           row.preScore,
    googleSnippet:      row.googleSnippet ?? "",
    querySource:        row.querySource ?? "",
    intentScore:        row.intentScore,
    leadType:           row.leadType,
    reasoning:          row.reasoning ?? "",
    replyOpportunity:   row.replyOpportunity,
    suggestedAngle:     row.suggestedAngle ?? "",
    isCompetitorThread: row.isCompetitorThread,
  };

  log.info("[reply-gen] generating");
  const output = await generateOneReply({
    lead:         scoredLead,
    intelligence,
    ...(product.productUrl ? { productUrl: product.productUrl } : {}),
  });

  await leadRepository.updateReply(leadId, {
    suggestedReply:      output.replyPossible ? output.reply : null,
    replyConfidenceNote: output.confidenceNote || null,
  });

  if (output.replyPossible && row.searchRunId) {
    await searchRunRepository.incrementReplied(row.searchRunId).catch(() => {});
  }

  log.info({ replyPossible: output.replyPossible }, "[reply-gen] done");
}

// ── Claiming ─────────────────────────────────────────────────────────────────

async function fetchPendingReplyGen(limit: number): Promise<ReplyGenItem[]> {
  const rows = await prisma.lead.findMany({
    where: {
      deepScoredAt:       { not: null },
      replyGeneratedAt:   null,
      intentScore:        { gte: REPLY_THRESHOLD },
      isCompetitorThread: false,
      replyOpportunity:   { not: "none" },
    },
    orderBy: { deepScoredAt: "asc" },
    take:    limit,
    select:  { id: true },
  });
  return rows.map((r) => ({ leadId: r.id }));
}

// ── Poller boot ─────────────────────────────────────────────────────────────

export function startReplyGenWorker(): Poller {
  return startPoller<ReplyGenItem>({
    name:           "reply-gen",
    pollIntervalMs: 3_000,
    batchSize:      5,     // matches the old BullMQ concurrency
    attempts:       2,
    backoffMs:      3_000,
    fetchBatch:     fetchPendingReplyGen,
    processOne:     process,
    onItemFailed: async (item) => {
      logger.warn({ leadId: item.leadId }, "[reply-gen] giving up on lead after final failure");
      // Mark it "done" (empty reply) even on total failure — otherwise this
      // row keeps matching fetchPendingReplyGen and gets retried forever.
      try {
        await leadRepository.updateReply(item.leadId, {
          suggestedReply:      null,
          replyConfidenceNote: null,
        });
      } catch (e) {
        logger.error({ e }, "[reply-gen] failed to mark lead done after final failure");
      }
    },
  });
}
