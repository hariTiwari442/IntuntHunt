/**
 * Standalone test for Step 6: Reply Generator.
 *
 * Modes:
 *   1. Read scored leads from step4-5.json + intelligence from step1.json:
 *      tsx scripts/test-step6.ts step4-5.json --intel step1.json
 *
 *   2. Limit how many replies to generate (for cheap testing):
 *      tsx scripts/test-step6.ts step4-5.json --intel step1.json --limit 3
 */

import "../src/config/env.js";
import { readFileSync, writeFileSync } from "fs";
import { runReplyGen } from "../src/pipeline/step6-reply-gen.js";
import type {
  KeywordEngineResult,
  ProcessLeadOutcome,
  ScoredLead,
  ProductIntelligence,
} from "../src/pipeline/types.js";

function getOutPath(): string {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  return outIdx >= 0 ? args[outIdx + 1]! : "step6.json";
}

async function loadInputs(): Promise<{
  intelligence: ProductIntelligence;
  leads:        ScoredLead[];
  limit:        number;
}> {
  const args = process.argv.slice(2);
  const intelIdx = args.indexOf("--intel");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1] ?? "0") : 0;

  if (!args[0] || intelIdx < 0) {
    console.error("Usage:");
    console.error("  tsx scripts/test-step6.ts <step4-5.json> --intel <step1.json> [--limit N]");
    process.exit(1);
  }

  const step45 = JSON.parse(readFileSync(args[0], "utf8")) as ProcessLeadOutcome;
  const step1  = JSON.parse(readFileSync(args[intelIdx + 1]!, "utf8")) as KeywordEngineResult;

  return { intelligence: step1.intelligence, leads: step45.leads, limit };
}

async function main() {
  const { intelligence, leads, limit } = await loadInputs();

  const sorted = [...leads].sort((a, b) => b.intentScore - a.intentScore);
  const target = limit > 0 ? sorted.slice(0, limit) : sorted;

  console.error("");
  console.error(`[Step 6] Generating replies for ${target.length} leads (filtering >= 60)...`);

  const t0 = Date.now();
  const outcome = await runReplyGen(target, intelligence, {
    concurrency: 5,
    threshold:   60,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.error(`[Step 6] Done in ${elapsed}s`);
  console.error("");

  const possible   = outcome.replies.filter((r) => r.output.replyPossible).length;
  const declined   = outcome.replies.length - possible;

  console.error("Reply gen summary:");
  console.error(`  Eligible (>=60):  ${target.length - outcome.skipped}`);
  console.error(`  Replies written:  ${possible}`);
  console.error(`  Declined by AI:   ${declined}`);
  console.error(`  Skipped (<60):    ${outcome.skipped}`);
  console.error(`  Failures:         ${outcome.failures.length}`);
  console.error("");

  // Print top 5 replies
  console.error("Top 5 replies:");
  const top = outcome.replies
    .filter((r) => r.output.replyPossible)
    .slice(0, 5);
  for (const r of top) {
    const lead = leads.find((l) => l.url === r.url)!;
    const where = lead.subreddit ? `r/${lead.subreddit}` : lead.platform;
    console.error("");
    console.error(`  [${lead.intentScore} ${lead.leadType}] ${where} • ${lead.title.slice(0, 60)}`);
    console.error(`  ${r.url}`);
    console.error(`  → Type: ${r.output.replyType}`);
    console.error(`  → Reply: ${r.output.reply.slice(0, 300)}${r.output.reply.length > 300 ? "..." : ""}`);
    if (r.output.confidenceNote) {
      console.error(`  → Note: ${r.output.confidenceNote}`);
    }
  }

  const outPath = getOutPath();
  writeFileSync(outPath, JSON.stringify(outcome, null, 2));
  console.error("");
  console.error(`Full output written to: ${outPath}`);
}

main().catch((err) => {
  console.error("[Step 6] FAILED:", err);
  process.exit(1);
});
