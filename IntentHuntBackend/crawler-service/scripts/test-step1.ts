/**
 * Standalone test for Step 1: Keyword Engine.
 *
 * Usage:
 *   tsx scripts/test-step1.ts "Chrome extension for YouTube that lets users loop specific sections"
 *
 * Outputs the full bundle as pretty JSON. Pipe to a file:
 *   tsx scripts/test-step1.ts "..." > step1-output.json
 */

import "../src/config/env.js"; // validates env
import { writeFileSync } from "fs";
import { runKeywordEngine } from "../src/pipeline/step1-keyword-engine.js";

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1]! : "step1.json";
  const description = args[0] !== "--out" ? args[0] : undefined;
  if (!description) {
    console.error("Usage: tsx scripts/test-step1.ts \"<product description>\" [--out path.json]");
    process.exit(1);
  }

  console.error("[Step 1] Running keyword engine...");
  const t0 = Date.now();
  const result = await runKeywordEngine(description);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.error(`[Step 1] Done in ${elapsed}s`);
  console.error("");
  console.error("Intelligence summary:");
  console.error(`  productName:    ${result.intelligence.productName}`);
  console.error(`  productType:    ${result.intelligence.productType}`);
  console.error(`  category:       ${result.intelligence.category}`);
  console.error(`  competitors:    ${result.intelligence.alternatives.join(", ")}`);
  console.error("");
  console.error("Query counts:");
  console.error(`  redditGlobal:    ${result.queries.redditGlobal.length}`);
  console.error(`  redditSubreddit: ${Object.keys(result.queries.redditSubreddit).length} subs, ${Object.values(result.queries.redditSubreddit).flat().length} queries`);
  console.error(`  linkedin:        ${result.queries.linkedin.length}`);
  console.error(`  twitter:         ${result.queries.twitter.length}`);
  console.error(`  producthunt:     ${result.queries.producthunt.length}`);
  console.error(`  indiehackers:    ${result.queries.indiehackers.length}`);
  console.error("");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error(`Full output written to: ${outPath}`);
}

main().catch((err) => {
  console.error("[Step 1] FAILED:", err);
  process.exit(1);
});
