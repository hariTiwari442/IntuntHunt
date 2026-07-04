/**
 * Manually trigger a Find Leads run for a product.
 *
 * Use when a product exists but never got a search run (e.g. the user
 * created it but the orchestrator was never enqueued, or queries weren't
 * generated at creation time). The orchestrator self-heals missing
 * intelligence/queries by running the keyword engine from the product
 * description before searching.
 *
 * Usage:
 *   tsx scripts/trigger-search.ts <productId> <userId>
 *
 * Reads REDIS_URL + DATABASE_URL from .env (same as the worker).
 */

import { searchRunRepository } from "../src/db/repositories/search-run.repository.js";
import { orchestratorQueue, type OrchestratorPayload } from "../src/queues/queue.registry.js";
import { prisma } from "../src/db/prisma.client.js";

async function main() {
  const [productId, userId] = process.argv.slice(2);

  if (!productId || !userId) {
    console.error("Usage: tsx scripts/trigger-search.ts <productId> <userId>");
    process.exit(1);
  }

  // Sanity-check the product exists + belongs to the user
  const product = await prisma.product.findUnique({
    where:  { id: productId },
    select: { id: true, userId: true, description: true },
  });

  if (!product) {
    console.error(`❌ Product ${productId} not found`);
    process.exit(1);
  }
  if (product.userId !== userId) {
    console.error(`❌ Product ${productId} does not belong to user ${userId} (owner: ${product.userId})`);
    process.exit(1);
  }
  if (!product.description?.trim()) {
    console.error(`❌ Product ${productId} has no description — keyword engine can't run`);
    process.exit(1);
  }

  console.log(`✓ Product found. Description: "${product.description.slice(0, 80)}..."`);

  // Create the SearchRun row (status: running)
  const run = await searchRunRepository.create({ productId, userId });
  console.log(`✓ Created SearchRun ${run.id}`);

  // Enqueue the orchestrator job — the VM worker will pick it up
  await orchestratorQueue.add("orchestrate", {
    searchRunId: run.id,
    productId,
    userId,
  } satisfies OrchestratorPayload);

  console.log(`✓ Enqueued orchestrator job for SearchRun ${run.id}`);
  console.log(`\nWatch progress with:`);
  console.log(`  select status, queries_used, urls_found, total_urls, processed_urls, leads_scored`);
  console.log(`  from search_runs where id = '${run.id}';`);

  await orchestratorQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Trigger failed:", err);
  process.exit(1);
});
