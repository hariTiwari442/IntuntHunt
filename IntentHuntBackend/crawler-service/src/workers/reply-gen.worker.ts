/**
 * Reply-gen worker.
 * ──────────────────
 * One job per high-intent lead. Calls Step 6 (GPT-4o reply generator),
 * writes the suggested reply to the lead row (Realtime fires).
 *
 * If the AI returns replyPossible=false, we store an empty reply so the
 * frontend can show "No natural reply available" instead of a spinner.
 */

import { Worker } from "bullmq";
import { bullmqRedis } from "../cache/redis.client.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import {
  QueueNames,
  type ReplyGenPayload,
} from "../queues/queue.registry.js";
import { generateOneReply } from "../pipeline/step6-reply-gen.js";
import type { ProductIntelligence, ScoredLead } from "../pipeline/types.js";

async function process(payload: ReplyGenPayload): Promise<void> {
  const { leadId, intelligenceJson, productUrl } = payload;
  const log = logger.child({ leadId });

  const intelligence = JSON.parse(intelligenceJson) as ProductIntelligence;

  const row = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!row) throw new Error(`Lead ${leadId} not found`);

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
    ...(productUrl ? { productUrl } : {}),
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

// ── Worker boot ─────────────────────────────────────────────────────────────

export function startReplyGenWorker(): Worker {
  const worker = new Worker<ReplyGenPayload>(
    QueueNames.REPLY_GEN,
    async (job) => {
      await process(job.data);
    },
    { connection: bullmqRedis, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    logger.warn({ jobId: job.id, leadId: job.data.leadId, err: err?.message },
      "[reply-gen] job failed");
  });

  worker.on("ready", () => logger.info("[reply-gen] worker ready"));
  return worker;
}
