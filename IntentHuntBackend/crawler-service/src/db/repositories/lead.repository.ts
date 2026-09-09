/**
 * Lead repository — one row per qualified URL.
 *
 * Lifecycle:
 *   1. Orchestrator inserts rows AFTER pre-score (Step 3) with just title +
 *      snippet + preScore. Frontend sees "State A" cards via Realtime.
 *   2. Process-lead worker UPDATEs each row with full content + intent score.
 *      Frontend sees "State C" cards.
 *   3. Reply-gen worker UPDATEs row with suggested reply.
 *      Frontend sees "State D" cards.
 */

import { prisma } from "../prisma.client.js";
import type {
  LeadType,
  Platform,
  ReplyOpportunity,
} from "@prisma/client";

export const leadRepository = {
  /**
   * Insert leads at end of pre-score step (State A — title + snippet only).
   * Skips duplicates on (productId, url) so re-runs don't error.
   */
  async createManyPreScored(rows: Array<{
    productId:     string;
    searchRunId:   string;
    url:           string;
    platform:      Platform;
    subreddit?:    string | null;
    title:         string;
    preScore:      number;
    googleSnippet: string;
    querySource:   string;
  }>): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.lead.createMany({
      data: rows.map((r) => ({
        productId:     r.productId,
        searchRunId:   r.searchRunId,
        url:           r.url,
        platform:      r.platform,
        subreddit:     r.subreddit ?? null,
        title:         r.title,
        preScore:      r.preScore,
        googleSnippet: r.googleSnippet,
        querySource:   r.querySource,
        // intent fields keep their schema defaults until process-lead worker fires
      })),
      skipDuplicates: true,
    });
    return result.count;
  },

  /** Find a lead by (productId, url) — used by workers to update by URL. */
  async findByProductAndUrl(productId: string, url: string) {
    return prisma.lead.findUnique({
      where: { productId_url: { productId, url } },
    });
  },

  /** Step 4: write full content from ScrapeCreators. */
  async updateContent(
    id: string,
    patch: {
      content?:          string;
      author?:           string | null;
      authorProfileUrl?: string | null;
      postScore?:        number;
      commentCount?:     number;
      postedAt?:         Date | null;
      topComments?:      string[];
    },
  ): Promise<void> {
    await prisma.lead.update({
      where: { id },
      data:  {
        ...patch,
        ...(patch.topComments !== undefined ? { topComments: patch.topComments } : {}),
        contentFetchedAt: new Date(),
      },
    });
  },

  /** Step 5: write the deep-score result. */
  async updateScore(
    id: string,
    patch: {
      intentScore:        number;
      leadType:           LeadType;
      reasoning:          string;
      replyOpportunity:   ReplyOpportunity;
      suggestedAngle:     string;
      isCompetitorThread: boolean;
    },
  ): Promise<void> {
    await prisma.lead.update({
      where: { id },
      data: {
        intentScore:        patch.intentScore,
        leadType:           patch.leadType,
        reasoning:          patch.reasoning,
        replyOpportunity:   patch.replyOpportunity,
        suggestedAngle:     patch.suggestedAngle,
        isCompetitorThread: patch.isCompetitorThread,
        deepScoredAt:       new Date(),
      },
    });
  },

  /** Step 6: write the suggested reply. */
  async updateReply(
    id: string,
    patch: {
      suggestedReply:      string | null;
      replyConfidenceNote: string | null;
    },
  ): Promise<void> {
    await prisma.lead.update({
      where: { id },
      data: {
        suggestedReply:      patch.suggestedReply,
        replyConfidenceNote: patch.replyConfidenceNote,
        replyGeneratedAt:    new Date(),
      },
    });
  },

  /** User actions: toggle tags, mark viewed, set status, edit note. */
  async updateUserMeta(
    id: string,
    patch: {
      tags?:     string[];
      viewed?:   boolean;       // true → set viewedAt = now
      status?:   "new" | "viewed" | "replied" | "dismissed";
      userNote?: string | null;
    },
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if (patch.tags     !== undefined) data.tags     = patch.tags;
    if (patch.status   !== undefined) data.status   = patch.status;
    if (patch.userNote !== undefined) data.userNote = patch.userNote;
    if (patch.viewed === true)        data.viewedAt = new Date();
    await prisma.lead.update({ where: { id }, data });
  },

  /** Permanently remove a lead the user doesn't want to see anymore. */
  async delete(id: string): Promise<void> {
    await prisma.lead.delete({ where: { id } });
  },

  async listByProduct(productId: string, options: { limit?: number; minIntentScore?: number }) {
    return prisma.lead.findMany({
      where: {
        productId,
        ...(options.minIntentScore != null ? { intentScore: { gte: options.minIntentScore } } : {}),
      },
      orderBy: { intentScore: "desc" },
      take: options.limit ?? 100,
    });
  },
};
