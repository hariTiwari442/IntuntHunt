/**
 * Standalone test for Step 2: Google Search.
 *
 * Two modes:
 *   1. Read a step1-output.json file (pipes nicely after test-step1):
 *      tsx scripts/test-step1.ts "description" > step1.json
 *      tsx scripts/test-step2.ts step1.json
 *
 *   2. Run Step 1 first, then Step 2 inline:
 *      tsx scripts/test-step2.ts --description "Chrome extension that..."
 *
 * Outputs the Google search result bundle as pretty JSON on stdout.
 * Progress + counts go to stderr.
 */

import "../src/config/env.js"; // validates env
import { readFileSync, writeFileSync } from "fs";
import { runKeywordEngine } from "../src/pipeline/step1-keyword-engine.js";
import { runGoogleSearch } from "../src/pipeline/step2-google-search.js";
import type { KeywordEngineResult } from "../src/pipeline/types.js";

function getOutPath(): string {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  return outIdx >= 0 ? args[outIdx + 1]! : "step2.json";
}

async function loadBundle(): Promise<KeywordEngineResult> {
  const args = process.argv.slice(2);

  if (args[0] === "--description" && args[1]) {
    console.error("[Step 2] Running Step 1 inline first...");
    return runKeywordEngine(args[1]);
  }

  if (args[0] && args[0] !== "--out") {
    const text = readFileSync(args[0], "utf8");
    return JSON.parse(text) as KeywordEngineResult;
  }

  console.error("Usage:");
  console.error(
    "  tsx scripts/test-step2.ts <step1-output.json> [--out path.json]",
  );
  console.error(
    '  tsx scripts/test-step2.ts --description "<product description>" [--out path.json]',
  );
  process.exit(1);
}

async function main() {
  const bundle = await loadBundle();

  console.error("");
  console.error("[Step 2] Running Google search via Serper.dev...");

  const t0 = Date.now();
  const result = await runGoogleSearch(bundle.queries, {
    platforms: ["reddit", "linkedin"], // v1
    concurrency: 5,
    resultsPerQuery: 10,
    timeFilter: "qdr:y",
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.error(`[Step 2] Done in ${elapsed}s`);
  console.error("");
  console.error("Search summary:");
  console.error(`  Queries executed:     ${result.queriesExecuted}`);
  console.error(`  Raw results:          ${result.totalRaw}`);
  console.error(`  After dedup + filter: ${result.totalAfterDedup}`);
  console.error(`  Errors:               ${result.errors.length}`);
  console.error("");

  // Per-platform breakdown
  const byPlatform = result.results.reduce<Record<string, number>>((acc, r) => {
    acc[r.platform] = (acc[r.platform] ?? 0) + 1;
    return acc;
  }, {});
  console.error("Results by platform:");
  for (const [platform, count] of Object.entries(byPlatform)) {
    console.error(`  ${platform.padEnd(10)} ${count}`);
  }

  // Reddit subreddit breakdown
  const bySubreddit = result.results
    .filter((r) => r.platform === "reddit" && r.subreddit)
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.subreddit!] = (acc[r.subreddit!] ?? 0) + 1;
      return acc;
    }, {});
  if (Object.keys(bySubreddit).length > 0) {
    console.error("");
    console.error("Top subreddits:");
    Object.entries(bySubreddit)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([sub, count]) => {
        console.error(`  r/${sub.padEnd(25)} ${count}`);
      });
  }

  const outPath = getOutPath();
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error("");
  console.error(`Full output written to: ${outPath}`);
}

main().catch((err) => {
  console.error("[Step 2] FAILED:", err);
  process.exit(1);
});
