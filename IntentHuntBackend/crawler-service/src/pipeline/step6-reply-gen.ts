/**
 * Step 6: Reply Generator
 * ────────────────────────
 * For every lead scoring >= threshold (default 60), generate a platform-
 * appropriate suggested reply via GPT-4o.
 *
 * Principle: reply must provide GENUINE VALUE first. If the AI can't craft a
 * helpful reply (e.g. nothing useful to add), it returns `replyPossible: false`
 * and we skip the lead — better to surface nothing than to ship spam.
 *
 * Per-reply cost: ~$0.003 (gpt-4o, ~500 in / 200 out tokens).
 */

import { z } from "zod";
import { logger } from "../utils/logger.js";
import { openai, MODELS } from "../lib/openai.js";
import type {
  Platform,
  ProductIntelligence,
  ReplyGenInput,
  ReplyGenOptions,
  ReplyGenOutcome,
  ReplyGenOutput,
  ScoredLead,
} from "./types.js";

// ── Concurrency helper ──────────────────────────────────────────────────────

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

// ── Zod schema ──────────────────────────────────────────────────────────────

const ReplySchema = z.object({
  replyPossible:  z.boolean(),
  reply:          z.string(),
  replyType:      z.enum(["comment", "dm"]),
  confidenceNote: z.string(),
});

// ── Platform-specific rules ─────────────────────────────────────────────────

const PLATFORM_RULES: Record<Platform, string> = {
  reddit: `REDDIT RULES:
- Lead with GENUINE HELP. Answer their question or empathize with their pain FIRST.
- Use first-person and reference something specific from their post (proves you read it).
- Match the subreddit's tone (casual in r/guitarlessons, technical in r/chrome_extensions).
- Mention the product NATURALLY at the end, NOT as the main focus.
  ✅ "I've been using X for this — works pretty well for [specific use case]"
  ❌ "Check out X!" or "X is the best solution!"
- If other commenters already suggested tools, acknowledge them and add yours.
- Mention 1-2 alternatives alongside your product to appear balanced.
- Keep it under 150 words.
- NEVER lie about being the creator. Be transparent if you built it.`,

  linkedin: `LINKEDIN RULES:
- Professional tone — but human, not corporate.
- Start by adding to the discussion (a relevant insight or experience).
- Mention the product in context, not as a pitch.
- 2-3 sentences ideal, max 4.
- For DMs: more personal, reference their specific role / company / post.
- NEVER lead with "I work at X" — provide value first.`,
};

// ── Prompt construction ─────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You write social media replies that are GENUINELY HELPFUL first and " +
  "promotional second. A reader should think 'this person is helpful' — not " +
  "'this person is selling something.' If you cannot write a reply that " +
  "provides real value independent of mentioning the product, return " +
  "replyPossible: false. Return JSON only.";

function buildUserPrompt(input: ReplyGenInput): string {
  const { lead, intelligence, productUrl } = input;
  const subRef = lead.subreddit ? `r/${lead.subreddit}` : lead.platform;

  const topComments = lead.topComments.length > 0
    ? lead.topComments.slice(0, 3).map((c, i) => `Comment ${i + 1}: ${c.slice(0, 300)}`).join("\n---\n")
    : "(no comments)";

  return `PRODUCT:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- Problem it solves: ${intelligence.problem}
- Direct competitors: ${intelligence.alternatives.join(", ")}
${productUrl ? `- Website: ${productUrl}` : ""}

POST:
- Platform: ${lead.platform} (${subRef})
- Author: ${lead.author ?? "unknown"}
- Title: ${lead.title}
- Content: ${(lead.content ?? "").slice(0, 1000)}

TOP COMMENTS (so you don't duplicate what's already said):
${topComments}

AI SCORING CONTEXT (already analysed):
- Intent score:        ${lead.intentScore}
- Lead type:           ${lead.leadType}
- Reasoning:           ${lead.reasoning}
- Reply opportunity:   ${lead.replyOpportunity}
- Suggested angle:     ${lead.suggestedAngle}
${lead.isCompetitorThread ? "- COMPETITOR THREAD: Author is showcasing their own tool. The COMMENTERS may be leads — phrase reply to be useful to them, not OP." : ""}

═══════════════════════════════════════════════════════════════════════
PLATFORM RULES:
═══════════════════════════════════════════════════════════════════════
${PLATFORM_RULES[lead.platform]}

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES (ALL PLATFORMS):
═══════════════════════════════════════════════════════════════════════
- The reply MUST provide genuine value EVEN WITHOUT mentioning the product.
  Test: if you removed the product mention, would the reply still be helpful?
  If not → replyPossible: false.

- If the post already has someone recommending YOUR product, DON'T duplicate —
  find a fresh angle (e.g. compare to a feature, add a tip) or return false.

- If reply would feel forced or salesy, return replyPossible: false.

- Mention 1-2 alternatives alongside your product when natural.

- Never use marketing speak ("game-changing", "revolutionary", "ultimate").

═══════════════════════════════════════════════════════════════════════
Return JSON exactly:
{
  "replyPossible":  true | false,
  "reply":          "<the reply text, or empty string if not possible>",
  "replyType":      "comment" | "dm",
  "confidenceNote": "<one sentence: any concern about how this will land>"
}`;
}

// ── Single-lead reply ───────────────────────────────────────────────────────

/**
 * Generate a suggested reply for one scored lead. Used by the reply-gen worker.
 *
 * @throws on hard GPT failure (after 1 retry).
 */
export async function generateOneReply(
  input: ReplyGenInput,
): Promise<ReplyGenOutput> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.REPLY_GEN,
        response_format: { type: "json_object" },
        temperature:     0.7,             // bit more variation for natural-sounding replies
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: buildUserPrompt(input) },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      return ReplySchema.parse(JSON.parse(raw));
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `Reply gen failed for ${input.lead.url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// ── Batch processor (test + sync runs) ──────────────────────────────────────

/**
 * Generate replies for many leads. Skips anything below `threshold` intent
 * score. In production this runs per-lead inside a BullMQ worker; this batch
 * function is for testing + standalone runs.
 */
export async function runReplyGen(
  leads: ScoredLead[],
  intelligence: ProductIntelligence,
  options: ReplyGenOptions = {},
  productUrl?: string,
): Promise<ReplyGenOutcome> {
  const concurrency = options.concurrency ?? 5;
  const threshold   = options.threshold   ?? 60;

  // Skip leads below threshold or marked as competitor threads (their OP isn't a lead).
  // (Even though the AI was instructed to phrase replies for commenters in
  //  competitor threads, for v1 we won't auto-generate replies for them — too
  //  much risk of bad output. Surface them in UI without auto-replies.)
  const eligible = leads.filter((l) => l.intentScore >= threshold && !l.isCompetitorThread);
  const skipped  = leads.length - eligible.length;

  logger.info(
    { total: leads.length, eligible: eligible.length, skipped, threshold },
    "[step6] Generating replies",
  );

  const failures: ReplyGenOutcome["failures"] = [];
  const replies:  ReplyGenOutcome["replies"]  = [];

  await mapWithConcurrency(eligible, concurrency, async (lead) => {
    try {
      const output = await generateOneReply({
        lead,
        intelligence,
        ...(productUrl ? { productUrl } : {}),
      });
      replies.push({ url: lead.url, output });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ url: lead.url, error: msg });
      logger.warn({ err, url: lead.url }, "[step6] Reply gen failed");
    }
  });

  const possible    = replies.filter((r) => r.output.replyPossible).length;
  const impossible  = replies.length - possible;

  logger.info(
    { eligible: eligible.length, generated: possible, declined: impossible, failed: failures.length },
    "[step6] Reply gen complete",
  );

  return { replies, skipped, failures };
}
