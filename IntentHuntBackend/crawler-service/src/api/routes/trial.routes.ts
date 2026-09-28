/**
 * Trial scan routes — the pre-signup homepage flow.
 *
 * A visitor pastes a product URL; we read the page and show back the product
 * description we found, so they can correct it before anything is derived
 * from it. No account exists yet, so the URL is the identity key (see
 * TrialScan in schema.prisma).
 *
 * Cost shape matters here, because this runs for strangers:
 *   POST /trial/analyze    — page fetch only. Free, ~1s. No AI call.
 *   POST /trial/:id/scan   — everything paid: keyword engine + lead search.
 *
 * Keeping the keyword engine on the second call (not the first) is
 * deliberate. It means an anonymous paste costs nothing, and — more
 * importantly — the description the engine reads is the one the visitor has
 * already corrected. Per CLAUDE.md, Step 1 is the single point of failure
 * for scoring quality, so letting a human fix its input first is the
 * cheapest quality win available.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.client.js";
import { extractWebsiteContent, normaliseUrl, WebsiteFetchError } from "../../lib/website.js";
import { runKeywordEngine } from "../../pipeline/step1-keyword-engine.js";
import { searchRunRepository } from "../../db/repositories/search-run.repository.js";
import { env } from "../../config/env.js";
import { FIXTURE_LEADS } from "./trial-fixtures.js";
import type { ProductIntelligence } from "../../pipeline/types.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ route: "trial" });

const AnalyzeSchema = z.object({
  url: z.string().trim().min(3, "URL is required").max(500),
});

const StartScanSchema = z.object({
  /** The visitor's corrected description; falls back to what we extracted. */
  description: z.string().trim().min(1).max(4000).optional(),
});

/**
 * Fixed id for the profile that owns not-yet-claimed trial products.
 *
 * products.user_id is a real FK to profiles(id), so a trial product needs
 * *an* owner before anyone has signed up. Using one known system row keeps
 * the constraint honest and makes unclaimed trial data trivial to find —
 * rather than making user_id nullable, which every query that assumes an
 * owner would then have to handle.
 */
const TRIAL_OWNER_ID    = "00000000-0000-4000-8000-000000000001";
const TRIAL_OWNER_EMAIL = "trial-scans@intenthunt.internal";

let trialOwnerReady = false;

async function ensureTrialOwner(): Promise<string> {
  if (trialOwnerReady) return TRIAL_OWNER_ID;

  // The constraint chain is products.user_id → profiles.id → auth.users.id,
  // so the auth row has to exist before the profile does. Only `id` is NOT
  // NULL without a default on auth.users, which is enough for a service
  // account that never signs in — it holds no credentials and exists purely
  // to satisfy ownership until a real user claims the scan.
  await prisma.$executeRawUnsafe(
    `INSERT INTO auth.users (id, email, created_at, updated_at)
     VALUES ($1::uuid, $2, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    TRIAL_OWNER_ID,
    TRIAL_OWNER_EMAIL,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO profiles (id, email, name, plan, plan_status, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Trial scans (system)', 'starter', 'active', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    TRIAL_OWNER_ID,
    TRIAL_OWNER_EMAIL,
  );

  trialOwnerReady = true;
  return TRIAL_OWNER_ID;
}

/** Public shape — never leaks extractedText or queries (our search strategy). */
function present(scan: {
  id: string; url: string; status: string; productName: string | null;
  description: string | null; intelligence: unknown; errorMessage: string | null;
}) {
  const i = (scan.intelligence ?? null) as ProductIntelligence | null;
  return {
    scanId:      scan.id,
    url:         scan.url,
    status:      scan.status,
    productName: scan.productName,
    description: scan.description,
    error:       scan.errorMessage,
    // Only present after the scan has been started — analyse alone doesn't
    // derive intelligence.
    summary: i
      ? {
          category:    i.category,
          audience:    i.audience,
          pains:       i.pains ?? [],
          competitors: i.alternatives ?? [],
        }
      : null,
  };
}

export async function trialRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /trial/analyze { url }
   * Extract + derive intelligence. Idempotent per URL.
   */
  app.post("/trial/analyze", async (request, reply) => {
    const { url: rawUrl } = AnalyzeSchema.parse(request.body);

    let url: string;
    try {
      url = normaliseUrl(rawUrl);
    } catch (err) {
      reply.status(400).send({
        statusCode: 400,
        error:      "INVALID_URL",
        message:    err instanceof WebsiteFetchError ? err.message : "Invalid URL",
      });
      return;
    }

    // Cache hit: someone already analysed this product. Costs nothing to
    // serve, and means a popular URL is only ever paid for once.
    const existing = await prisma.trialScan.findUnique({ where: { url } });
    if (existing && existing.status !== "failed") {
      log.info({ url, scanId: existing.id }, "[trial] cache hit");
      reply.send(present(existing));
      return;
    }

    // Claim the URL before doing the work, so two visitors racing on the same
    // URL can't both pay for it. upsert (not create) because a prior failed
    // attempt may have left a row behind.
    const scan = await prisma.trialScan.upsert({
      where:  { url },
      create: { url, status: "analyzing" },
      update: { status: "analyzing", errorMessage: null },
    });

    try {
      // Extraction only. No AI call here — see the file header for why.
      const site = await extractWebsiteContent(url);

      const updated = await prisma.trialScan.update({
        where: { id: scan.id },
        data: {
          extractedText:    site.text,
          extractionSource: site.source,
          // Best-effort product name from the page title: everything before
          // the first separator, since titles are usually "Name — tagline".
          productName:      site.title.split(/[|–—:·]/)[0]?.trim() || null,
          description:      site.description,
          status:           "ready",
          errorMessage:     null,
        },
      });

      log.info(
        { url, scanId: scan.id, source: site.source, chars: site.text.length },
        "[trial] extracted",
      );
      reply.send(present(updated));
    } catch (err) {
      const message =
        err instanceof WebsiteFetchError
          ? err.message
          : "We couldn't read that page. Try the main product page, or paste a description instead.";

      await prisma.trialScan.update({
        where: { id: scan.id },
        data:  { status: "failed", errorMessage: message },
      });

      log.warn({ url, err: err instanceof Error ? err.message : err }, "[trial] analyse failed");
      reply.status(422).send({ statusCode: 422, error: "ANALYZE_FAILED", message });
    }
  });

  /**
   * POST /trial/:scanId/scan { description? }
   *
   * The "find conversations" click. Everything paid happens here: the
   * keyword engine runs on the description the visitor just confirmed (or
   * corrected), then a SearchRun is created and the orchestrator poller
   * takes it from there.
   */
  app.post("/trial/:scanId/scan", async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    const { description } = StartScanSchema.parse(request.body ?? {});

    const scan = await prisma.trialScan.findUnique({ where: { id: scanId } });
    if (!scan) {
      reply.status(404).send({ statusCode: 404, error: "NOT_FOUND", message: "Scan not found" });
      return;
    }

    // Already running or done — hand back the existing run rather than
    // paying for a second one. Covers double-clicks and page refreshes.
    if (scan.searchRunId) {
      reply.status(202).send({ ...present(scan), searchRunId: scan.searchRunId });
      return;
    }

    // The visitor's correction wins over what we scraped.
    const finalDescription = (description ?? scan.description ?? "").trim();
    if (finalDescription.length < 20) {
      reply.status(400).send({
        statusCode: 400,
        error:      "DESCRIPTION_TOO_SHORT",
        message:    "Tell us a bit more about the product before we search.",
      });
      return;
    }

    try {
      await prisma.trialScan.update({
        where: { id: scan.id },
        data:  { status: "scanning", description: finalDescription },
      });

      const { intelligence, queries } = await runKeywordEngine(finalDescription);

      // Trial products need an owner because products.user_id is a real FK to
      // profiles. One system profile holds them until someone signs up and
      // claims the scan, at which point user_id is simply reassigned — the
      // leads follow automatically since they hang off the product.
      const ownerId = await ensureTrialOwner();

      const product = await prisma.product.create({
        data: {
          userId:       ownerId,
          name:         intelligence.productName || scan.productName || "Untitled",
          description:  finalDescription,
          productUrl:   scan.url,
          intelligence: intelligence as unknown as object,
          queries:      queries as unknown as object,
          subreddits:   Object.keys(queries.redditSubreddit ?? {}),
        },
      });

      // Local UI testing: complete the run immediately with fixture leads.
      // Deliberately does NOT enqueue anything — the queue is the shared
      // production database, so a queued run would be claimed and paid for by
      // the production worker regardless of any local mocking.
      if (env.MOCK_PIPELINE === "true") {
        const mockRun = await prisma.searchRun.create({
          data: {
            productId:     product.id,
            userId:        ownerId,
            status:        "completed",
            queriesUsed:   9,
            urlsFound:     46,
            urlsPreScored: FIXTURE_LEADS.length,
            totalUrls:     FIXTURE_LEADS.length,
            processedUrls: FIXTURE_LEADS.length,
            leadsScored:   FIXTURE_LEADS.filter((l) => l.intentScore >= 40).length,
            completedAt:   new Date(),
          },
        });

        const now = new Date();
        await prisma.lead.createMany({
          data: FIXTURE_LEADS.map((l) => ({
            productId:          product.id,
            searchRunId:        mockRun.id,
            url:                `${l.url}?scan=${mockRun.id.slice(0, 8)}`, // keep (productId,url) unique per run
            platform:           l.platform,
            subreddit:          l.subreddit,
            title:              l.title,
            content:            l.content,
            author:             l.author,
            postScore:          l.postScore,
            commentCount:       l.commentCount,
            preScore:           l.intentScore,
            googleSnippet:      l.content.slice(0, 160),
            querySource:        "mock-fixture",
            intentScore:        l.intentScore,
            leadType:           l.leadType as never,
            reasoning:          l.reasoning,
            replyOpportunity:   l.replyOpportunity as never,
            suggestedAngle:     l.suggestedAngle,
            isCompetitorThread: l.isCompetitorThread,
            postedAt:           new Date(now.getTime() - 1000 * 60 * 60 * 6),
            contentFetchedAt:   now,
            deepScoredAt:       now,
            processedAt:        now,
          })),
          skipDuplicates: true,
        });

        const done = await prisma.trialScan.update({
          where: { id: scan.id },
          data: {
            productId:    product.id,
            searchRunId:  mockRun.id,
            productName:  intelligence.productName || scan.productName,
            intelligence: intelligence as unknown as object,
            queries:      queries as unknown as object,
            status:       "scanned",
          },
        });

        log.warn(
          { scanId: scan.id, leads: FIXTURE_LEADS.length },
          "[trial] MOCK_PIPELINE — completed with fixtures, nothing queued",
        );
        reply.status(202).send({ ...present(done), searchRunId: mockRun.id });
        return;
      }

      const run = await searchRunRepository.create({ productId: product.id, userId: ownerId });

      const updated = await prisma.trialScan.update({
        where: { id: scan.id },
        data: {
          productId:    product.id,
          searchRunId:  run.id,
          productName:  intelligence.productName || scan.productName,
          intelligence: intelligence as unknown as object,
          queries:      queries as unknown as object,
        },
      });

      log.info(
        { scanId: scan.id, productId: product.id, searchRunId: run.id },
        "[trial] scan started",
      );
      reply.status(202).send({ ...present(updated), searchRunId: run.id });
    } catch (err) {
      await prisma.trialScan.update({
        where: { id: scan.id },
        data:  { status: "failed", errorMessage: "We couldn't start that search. Please try again." },
      });
      log.error({ scanId: scan.id, err: err instanceof Error ? err.message : err }, "[trial] scan failed");
      reply.status(500).send({
        statusCode: 500,
        error:      "SCAN_FAILED",
        message:    "We couldn't start that search. Please try again.",
      });
    }
  });

  /**
   * POST /trial/:scanId/claim — hand a trial scan to a real account.
   *
   * Called right after signup. The whole point of the URL-as-identity design:
   * the product and its leads already exist, owned by the system profile, so
   * claiming is a single ownership reassignment. Nothing is re-scanned and
   * nothing is recomputed — the leads they saw before signing up are exactly
   * the ones they get.
   *
   * Requires an authenticated user (x-user-id is set by main-backend's
   * gateway, which runs authMiddleware).
   */
  app.post("/trial/:scanId/claim", async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    const userId = request.headers["x-user-id"] as string | undefined;

    if (!userId) {
      reply.status(401).send({ statusCode: 401, error: "UNAUTHORIZED", message: "Sign in required" });
      return;
    }

    const scan = await prisma.trialScan.findUnique({ where: { id: scanId } });
    if (!scan) {
      reply.status(404).send({ statusCode: 404, error: "NOT_FOUND", message: "Scan not found" });
      return;
    }

    // Already claimed by this user — return the product so a repeated call
    // (double-submit, refresh) is harmless rather than an error.
    if (scan.claimedByUserId === userId) {
      reply.send({ productId: scan.productId, alreadyClaimed: true });
      return;
    }

    if (scan.claimedByUserId) {
      reply.status(409).send({
        statusCode: 409,
        error:      "ALREADY_CLAIMED",
        message:    "This scan has already been claimed by another account.",
      });
      return;
    }

    if (!scan.productId) {
      reply.status(400).send({
        statusCode: 400,
        error:      "NOTHING_TO_CLAIM",
        message:    "That scan hasn't been run yet.",
      });
      return;
    }

    await prisma.$transaction([
      // Ownership moves; the leads follow automatically because they hang off
      // the product and the search run, not off the user.
      prisma.product.update({
        where: { id: scan.productId },
        data:  { userId },
      }),
      prisma.searchRun.updateMany({
        where: { productId: scan.productId },
        data:  { userId },
      }),
      prisma.trialScan.update({
        where: { id: scan.id },
        data:  { claimedByUserId: userId, claimedAt: new Date() },
      }),
    ]);

    log.info({ scanId, userId, productId: scan.productId }, "[trial] claimed");
    reply.send({ productId: scan.productId, alreadyClaimed: false });
  });

  /**
   * GET /trial/:scanId — poll a scan.
   *
   * Once a search is running this carries the pipeline's real counters, so
   * the progress UI reflects actual work rather than a faked timer. Also
   * returns a preview of the best leads found so far, which lets results
   * stream in while the scan is still going.
   */
  app.get("/trial/:scanId", async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    const scan = await prisma.trialScan.findUnique({ where: { id: scanId } });
    if (!scan) {
      reply.status(404).send({ statusCode: 404, error: "NOT_FOUND", message: "Scan not found" });
      return;
    }

    const base = present(scan);
    if (!scan.searchRunId) {
      reply.send(base);
      return;
    }

    const run = await prisma.searchRun.findUnique({
      where:  { id: scan.searchRunId },
      select: {
        status: true, urlsFound: true, urlsPreScored: true, totalUrls: true,
        processedUrls: true, leadsScored: true, errorMessage: true,
      },
    });

    // Mirror terminal pipeline state onto the scan so a refresh after
    // completion doesn't show "scanning" forever.
    if (run && run.status === "completed" && scan.status !== "scanned") {
      await prisma.trialScan.update({ where: { id: scan.id }, data: { status: "scanned" } });
    }

    const topLeads = scan.productId
      ? await prisma.lead.findMany({
          where: {
            productId:          scan.productId,
            isCompetitorThread: false,
            deepScoredAt:       { not: null },
          },
          orderBy: { intentScore: "desc" },
          take:    12,
          select: {
            id: true, platform: true, subreddit: true, title: true, url: true,
            intentScore: true, leadType: true, reasoning: true, postedAt: true,
          },
        })
      : [];

    reply.send({
      ...base,
      status: run?.status === "completed" ? "scanned" : base.status,
      progress: run
        ? {
            stage:         run.status,
            urlsFound:     run.urlsFound,
            urlsPreScored: run.urlsPreScored,
            totalUrls:     run.totalUrls,
            processedUrls: run.processedUrls,
            leadsScored:   run.leadsScored,
            error:         run.errorMessage,
          }
        : null,
      leads: topLeads,
    });
  });
}
