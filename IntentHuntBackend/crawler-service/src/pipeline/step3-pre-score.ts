/**
 * Step 3: Pre-Score on Google snippets
 * ─────────────────────────────────────
 * Takes ~134 raw GoogleResults from Step 2 and uses GPT-4o-mini to score
 * each one 0-100 based on TITLE + SNIPPET ONLY. No content fetch.
 *
 * Goal: kill ~80% of noise cheaply before we spend ScrapeCreators credits
 * fetching full content. Anything scoring < threshold (default 30) is dropped.
 *
 * Strategy:
 *   - Batch 12 results per GPT call → ~12 calls for 134 URLs
 *   - 5 batches in parallel → ~3 round-trips total
 *   - Lenient threshold (30) — better to fetch a few extra than miss a hot lead
 *   - Cost: ~$0.005-0.01 per full pipeline run
 */

import { z } from "zod";
import { logger } from "../utils/logger.js";
import { openai, MODELS } from "../lib/openai.js";
import type {
  GoogleResult,
  PreScoredResult,
  PreScoreOptions,
  PreScoreOutcome,
  ProductIntelligence,
} from "./types.js";

// ── Concurrency helper (same as step 2) ─────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

// ── Zod schema for AI response ──────────────────────────────────────────────

const BatchResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().min(0),
      score: z.number().min(0).max(100),
    }),
  ),
});

// ── Prompt construction ─────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a lead qualification pre-screener. You evaluate search-result " +
  "snippets to decide if the post is likely from a potential customer for " +
  "a specific product. You score conservatively but inclusively — when in " +
  "doubt, give a higher score (we filter more precisely later with full " +
  "content). Respond with JSON only. No markdown, no explanation.";

function buildUserPrompt(
  intelligence: ProductIntelligence,
  batch: GoogleResult[],
  startIdx: number,
): string {
  const items = batch
    .map((r, i) => {
      const subRef = r.subreddit ? ` (r/${r.subreddit})` : "";
      return `[${startIdx + i}] platform: ${r.platform}${subRef}
Title: ${r.title}
Snippet: ${r.snippet}`;
    })
    .join("\n\n");

  return `PRODUCT CONTEXT:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- What it solves: ${intelligence.problem}
- Target audience: ${intelligence.audience}
- Direct competitors: ${intelligence.alternatives.join(", ")}
- Pain points buyers express: ${intelligence.pains.join("; ")}

═══════════════════════════════════════════════════════════════════════
SCORING RUBRIC (0-100) — score each post based on TITLE + SNIPPET only:
═══════════════════════════════════════════════════════════════════════

80-100 = HOT — clearly asking for this tool / mentioning competitor by name /
         describing the exact pain. Examples:
         • "Looking for X alternative"
         • "Anyone know a [category]?"
         • "X just broke / raised prices — what now?"

60-79  = WARM — likely discussing the problem space with possible buyer intent.
         Author hasn't explicitly asked but seems to need a solution.

40-59  = POSSIBLE — related topic, intent unclear. Worth fetching full content
         to be sure.

20-39  = UNLIKELY — tangentially related, mostly informational, no buyer signal.

0-19   = NOT A LEAD — off-topic, different domain, person is the competitor,
         or person already solved their problem.

═══════════════════════════════════════════════════════════════════════
RULES:
═══════════════════════════════════════════════════════════════════════
- Score CONSERVATIVELY but INCLUSIVELY. If unsure between 25 and 40, pick 40.
- Snippets are short — incomplete information is normal. Don't penalize for that.
- Posts where someone is BUILDING the product (not BUYING it) score low.
- Posts from competitors promoting their own tool score 0.

═══════════════════════════════════════════════════════════════════════
POSTS TO SCORE:
═══════════════════════════════════════════════════════════════════════

${items}

═══════════════════════════════════════════════════════════════════════
Return EXACTLY this shape (one entry per post, in any order — index field maps to post):
{
  "results": [
    { "index": ${startIdx},     "score": <0-100> },
    { "index": ${startIdx + 1}, "score": <0-100> },
    ...
  ]
}`;
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Pre-score all Google results using their title + snippet.
 *
 * @param results       Raw GoogleResults from Step 2
 * @param intelligence  Product context (from Step 1)
 * @param options       Tuning knobs
 */
export async function runPreScore(
  results: GoogleResult[],
  intelligence: ProductIntelligence,
  options: PreScoreOptions = {},
): Promise<PreScoreOutcome> {
  const batchSize   = options.batchSize   ?? 12;
  const concurrency = options.concurrency ?? 5;
  const threshold   = options.threshold   ?? 30;

  if (results.length === 0) {
    return { scored: [], passing: [], totalCalls: 0, errors: [] };
  }

  // Slice into batches
  const batches: { startIdx: number; items: GoogleResult[] }[] = [];
  for (let i = 0; i < results.length; i += batchSize) {
    batches.push({ startIdx: i, items: results.slice(i, i + batchSize) });
  }

  logger.info(
    { total: results.length, batches: batches.length, batchSize, threshold },
    "[step3] Starting pre-score",
  );

  const errors: PreScoreOutcome["errors"] = [];

  // Each batch returns Map<index, score>
  const batchOutcomes = await mapWithConcurrency(batches, concurrency, async (batch, batchIdx) => {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.PRE_SCORE,
        response_format: { type: "json_object" },
        temperature:     0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: buildUserPrompt(intelligence, batch.items, batch.startIdx) },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = BatchResponseSchema.parse(JSON.parse(raw));

      // Map index → score (some batches return indices in arbitrary order)
      const scoreMap = new Map<number, number>();
      for (const entry of parsed.results) {
        // Clamp to valid range
        scoreMap.set(entry.index, Math.max(0, Math.min(100, Math.round(entry.score))));
      }
      return { startIdx: batch.startIdx, scoreMap };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ batchIndex: batchIdx, error: msg });
      logger.warn({ err, batchIdx, batchSize: batch.items.length }, "[step3] Batch scoring failed");
      return { startIdx: batch.startIdx, scoreMap: new Map<number, number>() };
    }
  });

  // Merge all score maps and attach to results
  const allScores = new Map<number, number>();
  for (const outcome of batchOutcomes) {
    for (const [idx, score] of outcome.scoreMap.entries()) {
      allScores.set(idx, score);
    }
  }

  const scored: PreScoredResult[] = results.map((r, i) => ({
    ...r,
    preScore: allScores.get(i) ?? 0,   // missing score (batch failure) → 0 → dropped
  }));

  const passing = scored.filter((r) => r.preScore >= threshold);

  logger.info(
    {
      total: scored.length,
      passing: passing.length,
      dropped: scored.length - passing.length,
      threshold,
      errorCount: errors.length,
    },
    "[step3] Pre-score complete",
  );

  return {
    scored,
    passing,
    totalCalls: batches.length,
    errors,
  };
}
