/**
 * Standalone test for Step 3: Pre-Score.
 *
 * Modes:
 *   1. Run all three steps inline:
 *      tsx scripts/test-step3.ts --description "Chrome extension that..."
 *
 *   2. Read step2-output.json (faster — skip re-running Serper):
 *      tsx scripts/test-step3.ts step2.json --intel step1.json
 *
 * Prints stats to stderr, full JSON outcome to stdout.
 */

import "../src/config/env.js";
import { readFileSync, writeFileSync } from "fs";
import { runKeywordEngine } from "../src/pipeline/step1-keyword-engine.js";
import { runGoogleSearch } from "../src/pipeline/step2-google-search.js";
import { runPreScore } from "../src/pipeline/step3-pre-score.js";
import type {
  GoogleSearchResult,
  KeywordEngineResult,
  ProductIntelligence,
} from "../src/pipeline/types.js";

function getOutPath(): string {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  return outIdx >= 0 ? args[outIdx + 1]! : "step3.json";
}

async function loadInputs(): Promise<{
  intelligence: ProductIntelligence;
  search: GoogleSearchResult;
}> {
  const args = process.argv.slice(2);

  if (args[0] === "--description" && args[1]) {
    console.error("[Step 3] Running Step 1 + Step 2 inline first...");
    const step1 = await runKeywordEngine(args[1]);
    const step2 = await runGoogleSearch(step1.queries, {
      platforms: ["reddit", "linkedin"],
      concurrency: 5,
      resultsPerQuery: 10,
      timeFilter: "qdr:y",
    });
    return { intelligence: step1.intelligence, search: step2 };
  }

  if (args[0] && args[1] === "--intel" && args[2]) {
    const step2 = JSON.parse(readFileSync(args[0], "utf8")) as GoogleSearchResult;
    const step1 = JSON.parse(readFileSync(args[2], "utf8")) as KeywordEngineResult;
    return { intelligence: step1.intelligence, search: step2 };
  }

  console.error("Usage:");
  console.error("  tsx scripts/test-step3.ts --description \"<product description>\"");
  console.error("  tsx scripts/test-step3.ts <step2-output.json> --intel <step1-output.json>");
  process.exit(1);
}

async function main() {
  const { intelligence, search } = await loadInputs();

  console.error("");
  console.error(`[Step 3] Pre-scoring ${search.results.length} URLs via GPT-4o-mini...`);

  const t0 = Date.now();
  const outcome = await runPreScore(search.results, intelligence, {
    batchSize: 12,
    concurrency: 5,
    threshold: 30,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.error(`[Step 3] Done in ${elapsed}s`);
  console.error("");
  console.error("Pre-score summary:");
  console.error(`  Total scored:    ${outcome.scored.length}`);
  console.error(`  Passing (>=30):  ${outcome.passing.length}`);
  console.error(`  Dropped:         ${outcome.scored.length - outcome.passing.length}`);
  console.error(`  GPT batch calls: ${outcome.totalCalls}`);
  console.error(`  Batch errors:    ${outcome.errors.length}`);
  console.error("");

  // Score distribution
  const buckets: Record<string, number> = {
    "80-100": 0, "60-79": 0, "40-59": 0, "20-39": 0, "0-19": 0,
  };
  for (const r of outcome.scored) {
    if      (r.preScore >= 80) buckets["80-100"]++;
    else if (r.preScore >= 60) buckets["60-79"]++;
    else if (r.preScore >= 40) buckets["40-59"]++;
    else if (r.preScore >= 20) buckets["20-39"]++;
    else                       buckets["0-19"]++;
  }
  console.error("Score distribution:");
  for (const [range, count] of Object.entries(buckets)) {
    console.error(`  ${range.padEnd(8)} ${count}`);
  }
  console.error("");

  // Top 10 highest-scoring leads
  const top = [...outcome.scored]
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, 10);
  console.error("Top 10 by preScore:");
  for (const r of top) {
    const where = r.subreddit ? `r/${r.subreddit}` : r.platform;
    console.error(`  [${r.preScore}] ${where.padEnd(25)} ${r.title.slice(0, 70)}`);
    console.error(`         ${r.link}`);
  }
  console.error("");

  const outPath = getOutPath();
  writeFileSync(outPath, JSON.stringify(outcome, null, 2));
  console.error(`Full outcome written to: ${outPath}`);
}

main().catch((err) => {
  console.error("[Step 3] FAILED:", err);
  process.exit(1);
});
