/**
 * Re-score existing leads by enqueueing process-lead jobs for them.
 *
 * Usage:
 *   tsx scripts/rescore-existing.ts --product <productId>      # all leads for one product
 *   tsx scripts/rescore-existing.ts --product <id> --unscored  # only ones without deep score yet
 *   tsx scripts/rescore-existing.ts --all-unscored             # every lead across all products
 *
 * Workers pick them up via the existing process-lead queue → deep score + reply gen.
 * Frontend sees updates live via Supabase Realtime.
 */

import "../src/config/env.js";
import { prisma } from "../src/db/prisma.client.js";
import {
  processLeadQueue,
  type ProcessLeadPayload,
} from "../src/queues/queue.registry.js";
import type { ProductIntelligence } from "../src/pipeline/types.js";

interface Args {
  productId?:  string;
  unscored?:   boolean;
  allUnscored?: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < a.length; i++) {
    const flag = a[i];
    if (flag === "--product" && a[i + 1]) { out.productId   = a[i + 1]; i++; }
    if (flag === "--unscored")             out.unscored     = true;
    if (flag === "--all-unscored")         out.allUnscored  = true;
  }
  return out;
}

async function main() {
  const args = parseArgs();

  if (!args.productId && !args.allUnscored) {
    console.error("Usage:");
    console.error("  tsx scripts/rescore-existing.ts --product <productId> [--unscored]");
    console.error("  tsx scripts/rescore-existing.ts --all-unscored");
    process.exit(1);
  }

  // ── Build lead query ──────────────────────────────────────────────
  const where = args.allUnscored
    ? { deepScoredAt: null }
    : {
        productId: args.productId!,
        ...(args.unscored ? { deepScoredAt: null } : {}),
      };

  const leads = await prisma.lead.findMany({
    where,
    select: { id: true, productId: true, searchRunId: true },
  });

  console.error(`[rescore] found ${leads.length} leads to re-process`);
  if (leads.length === 0) {
    console.error("[rescore] nothing to do");
    process.exit(0);
  }

  // ── Cache product intelligence per productId (avoid N+1) ──────────
  const productIds = [...new Set(leads.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where:  { id: { in: productIds } },
    select: { id: true, intelligence: true },
  });

  const intelMap = new Map<string, string>();
  for (const p of products) {
    intelMap.set(p.id, JSON.stringify(p.intelligence as unknown as ProductIntelligence));
  }

  // ── Enqueue process-lead jobs ─────────────────────────────────────
  let queued = 0;
  let skipped = 0;
  for (const lead of leads) {
    const intelligenceJson = intelMap.get(lead.productId);
    if (!intelligenceJson) {
      console.error(`[rescore] skipping lead ${lead.id} — product ${lead.productId} has no intelligence`);
      skipped++;
      continue;
    }
    await processLeadQueue.add("process-lead", {
      searchRunId:      lead.searchRunId,
      productId:        lead.productId,
      leadId:           lead.id,
      intelligenceJson,
    } satisfies ProcessLeadPayload);
    queued++;
  }

  console.error(`[rescore] queued ${queued}, skipped ${skipped}`);
  console.error("[rescore] workers will process them. Watch the worker terminal + frontend (Realtime).");

  await prisma.$disconnect();
  // BullMQ connection needs a beat to flush, then exit
  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error("[rescore] FAILED:", err);
  process.exit(1);
});
