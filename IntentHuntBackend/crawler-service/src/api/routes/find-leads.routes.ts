/**
 * Lead-engine API routes.
 *
 * Auth is enforced by the gateway (main-backend); this service trusts the
 * X-User-Id header. Ownership is double-checked here against the products row.
 *
 * Endpoints:
 *   POST   /api/v1/find-leads/:productId           → kicks off pipeline
 *   GET    /api/v1/search-runs/:searchRunId        → poll status (fallback to Realtime)
 *   GET    /api/v1/leads?productId=...&minIntentScore=...&leadType=...  → list leads
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.client.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { searchRunRepository } from "../../db/repositories/search-run.repository.js";
import { leadRepository } from "../../db/repositories/lead.repository.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../utils/errors.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const ListLeadsQuerySchema = z.object({
  productId:      z.string().uuid(),
  searchRunId:    z.string().uuid().optional(),
  minIntentScore: z.coerce.number().min(0).max(100).optional(),
  leadType:       z.enum(["hot", "warm", "possible", "unlikely", "not_a_lead"]).optional(),
  limit:          z.coerce.number().int().min(1).max(500).default(100),
});

// ── Routes ──────────────────────────────────────────────────────────────────

export async function leadEngineRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  // ── POST /api/v1/find-leads/:productId ──
  // Creates a SearchRun, enqueues orchestrator job, returns { searchRunId }.
  app.post<{ Params: { productId: string } }>(
    "/find-leads/:productId",
    async (request, reply) => {
      const { productId } = request.params;
      const userId = request.userId;

      const product = await prisma.product.findUnique({
        where:  { id: productId },
        select: { id: true, userId: true },
      });

      if (!product) throw new NotFoundError("Product", productId);
      if (product.userId !== userId) throw new ForbiddenError();

      // Create the SearchRun row (status: pending). Nothing to enqueue —
      // the orchestrator poller picks up pending rows on its own within a
      // few seconds (see workers/orchestrator.worker.ts).
      const run = await searchRunRepository.create({ productId, userId });

      reply.status(202).send({
        searchRunId: run.id,
        status:      run.status,
        createdAt:   run.startedAt.toISOString(),
      });
    },
  );

  // ── GET /api/v1/search-runs/:searchRunId ──
  // Poll status (frontend uses Realtime primarily; this is a fallback).
  app.get<{ Params: { searchRunId: string } }>(
    "/search-runs/:searchRunId",
    async (request, reply) => {
      const { searchRunId } = request.params;
      const run = await searchRunRepository.findById(searchRunId);

      if (!run) throw new NotFoundError("SearchRun", searchRunId);
      if (run.userId !== request.userId) throw new ForbiddenError();

      reply.send({
        searchRunId:    run.id,
        productId:      run.productId,
        status:         run.status,
        queriesUsed:    run.queriesUsed,
        urlsFound:      run.urlsFound,
        urlsPreScored:  run.urlsPreScored,
        totalUrls:      run.totalUrls,
        processedUrls:  run.processedUrls,
        leadsScored:    run.leadsScored,
        leadsReplied:   run.leadsReplied,
        errorMessage:   run.errorMessage,
        startedAt:      run.startedAt.toISOString(),
        completedAt:    run.completedAt?.toISOString() ?? null,
      });
    },
  );

  // ── GET /api/v1/products/:productId/search-runs ──
  // Scan history for a product — powers the "SCANS" list in the sidebar so
  // the user can look at the results of one Find Leads click at a time.
  app.get<{ Params: { productId: string } }>(
    "/products/:productId/search-runs",
    async (request, reply) => {
      const { productId } = request.params;

      const product = await prisma.product.findUnique({
        where:  { id: productId },
        select: { userId: true },
      });
      if (!product) throw new NotFoundError("Product", productId);
      if (product.userId !== request.userId) throw new ForbiddenError();

      const runs = await prisma.searchRun.findMany({
        where:   { productId },
        orderBy: { startedAt: "desc" },
        take:    50,
        select: {
          id: true, status: true, startedAt: true, completedAt: true,
          totalUrls: true, processedUrls: true, leadsScored: true,
          errorMessage: true,
          _count: { select: { leads: true } },
        },
      });

      reply.send({
        searchRuns: runs.map((r) => ({
          searchRunId:  r.id,
          status:       r.status,
          startedAt:    r.startedAt.toISOString(),
          completedAt:  r.completedAt?.toISOString() ?? null,
          totalUrls:    r.totalUrls,
          processedUrls: r.processedUrls,
          leadsScored:  r.leadsScored,
          errorMessage: r.errorMessage,
          leadCount:    r._count.leads,
        })),
      });
    },
  );

  // ── PATCH /api/v1/leads/:leadId ──
  // Update user metadata on a lead (tags, viewed, status).
  app.patch<{ Params: { leadId: string } }>(
    "/leads/:leadId",
    async (request, reply) => {
      const { leadId } = request.params;
      const body = request.body as {
        tags?:     string[];
        viewed?:   boolean;
        status?:   "new" | "viewed" | "replied" | "dismissed";
        userNote?: string | null;
      };

      // Ownership check via the lead → searchRun → userId chain
      const lead = await prisma.lead.findUnique({
        where:  { id: leadId },
        select: { searchRun: { select: { userId: true } } },
      });
      if (!lead) throw new NotFoundError("Lead", leadId);
      if (lead.searchRun.userId !== request.userId) throw new ForbiddenError();

      await leadRepository.updateUserMeta(leadId, body);

      // Return the updated row so frontend can sync
      const updated = await prisma.lead.findUnique({ where: { id: leadId } });
      reply.send(updated);
    },
  );

  // ── DELETE /api/v1/leads/:leadId ──
  // Permanently removes a lead the user doesn't want to see anymore.
  app.delete<{ Params: { leadId: string } }>(
    "/leads/:leadId",
    async (request, reply) => {
      const { leadId } = request.params;

      const lead = await prisma.lead.findUnique({
        where:  { id: leadId },
        select: { searchRun: { select: { userId: true } } },
      });
      if (!lead) throw new NotFoundError("Lead", leadId);
      if (lead.searchRun.userId !== request.userId) throw new ForbiddenError();

      await leadRepository.delete(leadId);
      reply.send({ message: "Lead deleted", leadId });
    },
  );

  // ── POST /api/v1/products/:productId/cleanup ──
  // Called by main-backend after deleting a product. Removes the crawler-side
  // search_runs (and cascades to leads + seen_urls).
  app.post<{ Params: { productId: string } }>(
    "/products/:productId/cleanup",
    async (request, reply) => {
      const { productId } = request.params;
      // Delete leads + search runs + seen urls for this product
      await prisma.$transaction([
        prisma.lead.deleteMany({ where: { productId } }),
        prisma.searchRun.deleteMany({ where: { productId } }),
        prisma.seenUrl.deleteMany({ where: { productId } }),
      ]);
      reply.send({ ok: true });
    },
  );

  // ── GET /api/v1/leads ──
  app.get("/leads", async (request, reply) => {
    const query = ListLeadsQuerySchema.parse(request.query);

    // Ownership check via product
    const product = await prisma.product.findUnique({
      where:  { id: query.productId },
      select: { userId: true },
    });
    if (!product) throw new NotFoundError("Product", query.productId);
    if (product.userId !== request.userId) throw new ForbiddenError();

    const where = {
      productId: query.productId,
      ...(query.searchRunId  ? { searchRunId: query.searchRunId } : {}),
      ...(query.minIntentScore != null ? { intentScore: { gte: query.minIntentScore } } : {}),
      ...(query.leadType ? { leadType: query.leadType } : {}),
    };

    // Fetch the page + the all-time count (under same where clause) in
    // parallel. The frontend uses `total` to render "X of Y" so users
    // know when the page is truncated by limit.
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: [
          { intentScore: "desc" },
          { preScore:    "desc" },
        ],
        take: query.limit,
      }),
      prisma.lead.count({ where }),
    ]);

    reply.send({
      leads: leads.map((l) => ({
        id:                  l.id,
        productId:           l.productId,
        searchRunId:         l.searchRunId,
        url:                 l.url,
        platform:            l.platform,
        subreddit:           l.subreddit,
        title:               l.title,
        content:             l.content,
        author:              l.author,
        authorProfileUrl:    l.authorProfileUrl,
        postScore:           l.postScore,
        commentCount:        l.commentCount,
        postedAt:            l.postedAt?.toISOString() ?? null,
        preScore:            l.preScore,
        googleSnippet:       l.googleSnippet,
        querySource:         l.querySource,
        intentScore:         l.intentScore,
        leadType:            l.leadType,
        reasoning:           l.reasoning,
        replyOpportunity:    l.replyOpportunity,
        suggestedAngle:      l.suggestedAngle,
        isCompetitorThread:  l.isCompetitorThread,
        suggestedReply:      l.suggestedReply,
        replyConfidenceNote: l.replyConfidenceNote,
        status:              l.status,
        userReplied:         l.userReplied,
        repliedAt:           l.repliedAt?.toISOString() ?? null,
        tags:                l.tags,
        viewedAt:            l.viewedAt?.toISOString() ?? null,
        userNote:            l.userNote,
        preScoredAt:         l.preScoredAt.toISOString(),
        contentFetchedAt:    l.contentFetchedAt?.toISOString() ?? null,
        deepScoredAt:        l.deepScoredAt?.toISOString() ?? null,
        replyGeneratedAt:    l.replyGeneratedAt?.toISOString() ?? null,
        createdAt:           l.createdAt.toISOString(),
      })),
      total,
    });
  });
}
