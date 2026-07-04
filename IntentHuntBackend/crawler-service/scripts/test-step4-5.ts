/**
 * Standalone test for Step 4+5: Process Lead.
 *
 * Modes:
 *   1. Full pipeline 1→2→3→(4+5) inline:
 *      tsx scripts/test-step4-5.ts --description "Chrome extension that..."
 *
 *   2. Read step3-output.json + step1-output.json (fast iteration):
 *      tsx scripts/test-step4-5.ts step3.json --intel step1.json
 *
 *   3. Limit how many leads to process (for cheap testing):
 *      tsx scripts/test-step4-5.ts step3.json --intel step1.json --limit 5
 */

import "../src/config/env.js";
import { readFileSync, writeFileSync } from "fs";
import { runKeywordEngine } from "../src/pipeline/step1-keyword-engine.js";
import { runGoogleSearch } from "../src/pipeline/step2-google-search.js";
import { runPreScore } from "../src/pipeline/step3-pre-score.js";
import { runProcessLeads } from "../src/pipeline/step4-5-process-lead.js";
import type {
  KeywordEngineResult,
  PreScoreOutcome,
  PreScoredResult,
  ProductIntelligence,
} from "../src/pipeline/types.js";

function getOutPath(): string {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  return outIdx >= 0 ? args[outIdx + 1]! : "step4-5.json";
}

async function loadInputs(): Promise<{
  intelligence: ProductIntelligence;
  passing:      PreScoredResult[];
  limit:        number;
}> {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1] ?? "0") : 0;

  if (args[0] === "--description" && args[1]) {
    console.error("[Step 4+5] Running full pipeline 1→2→3 inline first...");
    const step1 = await runKeywordEngine(args[1]);
    const step2 = await runGoogleSearch(step1.queries, {
      platforms: ["reddit", "linkedin"],
      concurrency: 5,
      resultsPerQuery: 10,
      timeFilter: "qdr:y",
    });
    const step3 = await runPreScore(step2.results, step1.intelligence, {
      batchSize: 12,
      concurrency: 5,
      threshold: 30,
    });
    return { intelligence: step1.intelligence, passing: step3.passing, limit };
  }

  const intelIdx = args.indexOf("--intel");
  if (args[0] && intelIdx > 0 && args[intelIdx + 1]) {
    const step3 = JSON.parse(readFileSync(args[0], "utf8")) as PreScoreOutcome;
    const step1 = JSON.parse(readFileSync(args[intelIdx + 1]!, "utf8")) as KeywordEngineResult;
    return { intelligence: step1.intelligence, passing: step3.passing, limit };
  }

  console.error("Usage:");
  console.error("  tsx scripts/test-step4-5.ts --description \"<product description>\"");
  console.error("  tsx scripts/test-step4-5.ts <step3-output.json> --intel <step1-output.json> [--limit N]");
  process.exit(1);
}

async function main() {
  const { intelligence, passing, limit } = await loadInputs();

  const toProcess = limit > 0 ? passing.slice(0, limit) : passing;

  console.error("");
  console.error(`[Step 4+5] Processing ${toProcess.length} leads${limit > 0 ? ` (limit ${limit})` : ""}...`);

  const t0 = Date.now();
  const outcome = await runProcessLeads(toProcess, intelligence, { concurrency: 3 });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.error(`[Step 4+5] Done in ${elapsed}s`);
  console.error("");
  console.error("Process summary:");
  console.error(`  Attempted:   ${toProcess.length}`);
  console.error(`  Succeeded:   ${outcome.leads.length}`);
  console.error(`  Failed:      ${outcome.failures.length}`);
  console.error("");

  const byType = outcome.leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.leadType] = (acc[l.leadType] ?? 0) + 1;
    return acc;
  }, {});
  console.error("Lead type breakdown:");
  for (const t of ["hot", "warm", "possible", "unlikely", "not_a_lead"]) {
    console.error(`  ${t.padEnd(11)} ${byType[t] ?? 0}`);
  }
  console.error("");

  const competitorCount = outcome.leads.filter((l) => l.isCompetitorThread).length;
  if (competitorCount > 0) {
    console.error(`Competitor threads detected: ${competitorCount} (author is showcasing own tool)`);
    console.error("");
  }

  // Top 10 by intent
  const top = [...outcome.leads].sort((a, b) => b.intentScore - a.intentScore).slice(0, 10);
  console.error("Top 10 scored leads:");
  for (const l of top) {
    const where = l.subreddit ? `r/${l.subreddit}` : l.platform;
    const flag = l.isCompetitorThread ? " [COMP-THREAD]" : "";
    console.error(`  [${l.intentScore} ${l.leadType.padEnd(11)}]${flag} ${where.padEnd(22)} ${l.title.slice(0, 60)}`);
    console.error(`    ${l.url}`);
    console.error(`    → ${l.reasoning}`);
  }

  if (outcome.failures.length > 0) {
    console.error("");
    console.error("Failures:");
    for (const f of outcome.failures.slice(0, 5)) {
      console.error(`  [${f.stage}] ${f.url}`);
      console.error(`    ${f.error.slice(0, 150)}`);
    }
  }

  const outPath = getOutPath();
  writeFileSync(outPath, JSON.stringify(outcome, null, 2));
  console.error("");
  console.error(`Full JSON written to: ${outPath}`);
}

main().catch((err) => {
  console.error("[Step 4+5] FAILED:", err);
  process.exit(1);
});
