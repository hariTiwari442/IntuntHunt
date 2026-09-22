/**
 * Trial scan routes — the pre-signup homepage flow.
 *
 * A visitor pastes a product URL; we extract the page, derive the product
 * intelligence from it, and show that back for review. No account exists
 * yet, so the URL is the identity key (see TrialScan in schema.prisma).
 *
 * Cost shape matters here, because this runs for strangers:
 *   POST /trial/analyze  — 1 page fetch (free) + 1 gpt-4o call (~1c). Cached
 *                          by URL, so repeat visitors on the same product
 *                          cost nothing.
 *   The expensive part (the actual lead search) stays behind a separate,
 *   deliberate click — it is NOT triggered here.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.client.js";
import { extractWebsiteContent, normaliseUrl, WebsiteFetchError } from "../../lib/website.js";
import { runKeywordEngine } from "../../pipeline/step1-keyword-engine.js";
import type { ProductIntelligence } from "../../pipeline/types.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ route: "trial" });

const AnalyzeSchema = z.object({
  url: z.string().trim().min(3, "URL is required").max(500),
});

/**
 * Turn the structured intelligence into the editable paragraph we show back.
 * This becomes `Product.description` on claim, and re-running Step 1 on it
 * must reproduce comparable intelligence — so it has to read like the
 * description a user would have typed, not like a JSON dump.
 */
function composeDescription(i: ProductIntelligence): string {
  const parts = [
    `${i.productName} is a ${i.category}.`,
    i.problem ? `It solves: ${i.problem}` : "",
    i.audience ? `Built for ${i.audience}.` : "",
    i.pains?.length ? `Customers typically struggle with: ${i.pains.join("; ")}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
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
    // Just enough to make the review screen feel like we understood them.
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
      const site = await extractWebsiteContent(url);

      const { intelligence, queries } = await runKeywordEngine(site.text);
      const description = composeDescription(intelligence);

      const updated = await prisma.trialScan.update({
        where: { id: scan.id },
        data: {
          extractedText:    site.text,
          extractionSource: site.source,
          productName:      intelligence.productName,
          description,
          intelligence:     intelligence as unknown as object,
          queries:          queries as unknown as object,
          status:           "ready",
          errorMessage:     null,
        },
      });

      log.info(
        { url, scanId: scan.id, source: site.source, product: intelligence.productName },
        "[trial] analysed",
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

  /** GET /trial/:scanId — poll/refetch a scan the visitor already started. */
  app.get("/trial/:scanId", async (request, reply) => {
    const { scanId } = request.params as { scanId: string };
    const scan = await prisma.trialScan.findUnique({ where: { id: scanId } });
    if (!scan) {
      reply.status(404).send({ statusCode: 404, error: "NOT_FOUND", message: "Scan not found" });
      return;
    }
    reply.send(present(scan));
  });
}
