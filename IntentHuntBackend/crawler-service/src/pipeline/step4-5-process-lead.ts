/**
 * Step 4 + 5: Process Lead (Fetch + Deep Score)
 * ──────────────────────────────────────────────
 * Combined worker job: takes one pre-qualified URL, fetches full post content
 * via ScrapeCreators, then runs GPT-4o-mini deep-score on the full content.
 *
 * Returns ScoredLead = RawLead + { intentScore, leadType, reasoning,
 * replyOpportunity, suggestedAngle }.
 *
 * Per-lead cost:
 *   ScrapeCreators fetch: ~$0.001
 *   GPT-4o-mini score:    ~$0.0003
 *   Total per lead:       ~$0.0013
 *
 * In production this runs inside a BullMQ worker (concurrency 3-5 per worker).
 * The single-lead function makes the worker code trivial.
 */

import { z } from "zod";
import { openai, MODELS } from "../lib/openai.js";
import { fetchPost } from "../lib/scrapecreators.js";
import { logger } from "../utils/logger.js";
import type {
  LeadType,
  PreScoredResult,
  ProcessLeadOptions,
  ProcessLeadOutcome,
  ProductIntelligence,
  RawLead,
  ReplyOpportunity,
  ScoredLead,
} from "./types.js";

// ── Concurrency helper (same shape as steps 2/3) ────────────────────────────

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

// ── Zod schema for deep score response ──────────────────────────────────────

const DeepScoreSchema = z.object({
  intentScore:        z.number().min(0).max(100),
  leadType:           z.enum(["hot", "warm", "possible", "unlikely", "not_a_lead"]),
  reasoning:          z.string().min(1),
  replyOpportunity:   z.enum(["comment", "dm", "both", "none"]),
  suggestedAngle:     z.string(),
  isCompetitorThread: z.boolean().default(false),
});

// ── Deep score prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a lead qualification expert evaluating social media posts to determine " +
  "if the author is a potential customer for a specific product. You return JSON " +
  "only. No markdown, no explanation outside the JSON.";

function buildDeepScorePrompt(lead: RawLead, intelligence: ProductIntelligence): string {
  const subRef = lead.subreddit ? `r/${lead.subreddit}` : lead.platform;
  const comments = lead.topComments.length > 0
    ? lead.topComments.slice(0, 3).map((c, i) => `Comment ${i + 1}: ${c.slice(0, 300)}`).join("\n")
    : "(no comments)";

  return `PRODUCT CONTEXT:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- Problem solved: ${intelligence.problem}
- Audience: ${intelligence.audience}
- Direct competitors: ${intelligence.alternatives.join(", ")}
- Pain points: ${intelligence.pains.join("; ")}

POST TO EVALUATE:
- Platform: ${lead.platform} (${subRef})
- Author: ${lead.author ?? "unknown"}
- Title: ${lead.title}
- Content: ${(lead.content ?? "").slice(0, 1500)}
- Score: ${lead.postScore}, Comments: ${lead.commentCount}

TOP COMMENTS (context for whether others are already discussing this):
${comments}

═══════════════════════════════════════════════════════════════════════
COMPETITOR / BUILDER CHECK — be careful with false positives:
═══════════════════════════════════════════════════════════════════════
isCompetitorThread = true ONLY IF the author is clearly SHOWCASING their
own competing tool. Strong signals required (need 2+ of these):
  • Explicit "I built", "I made", "my extension", "my tool", "I'm working on"
  • Links to their own Chrome Web Store / GitHub / website
  • "Show HN" or "feedback welcome" framing
  • Active promotional posture

DO NOT mark as competitor thread just because:
  • Title says "Free youtube looper" (could be a user ASKING about free tools)
  • Title says "Best youtube looper" (likely a buyer comparing options)
  • Post mentions a competitor's name (buyers always mention competitors)
  • Title sounds tool-flavored without explicit "I built it"

If isCompetitorThread = true → score 0-10, leadType = "not_a_lead".
If unsure → leave isCompetitorThread = false and score normally.

═══════════════════════════════════════════════════════════════════════
PLATFORM COMPATIBILITY CHECK:
═══════════════════════════════════════════════════════════════════════
If the author explicitly asks for an incompatible platform (e.g. Firefox-only
when your product is Chrome-only), subtract 20 from the final score.

═══════════════════════════════════════════════════════════════════════
CATEGORY MATCH CHECK — BEFORE scoring HOT (80+):
═══════════════════════════════════════════════════════════════════════
HOT (80+) is reserved for posts that need EXACTLY this product's category.

If the user is asking for a DIFFERENT category of tool (even if related):
  → cap at WARM (60-79) maximum
  → never HOT

Example for a "business card scanner" product:
  ✅ "How do I scan business cards fast at trade shows?" → HOT 85 (exact match)
  ❌ "Looking for a CRM with automation" → cap at WARM 65 (adjacent, wrong category)
  ❌ "Best follow-up automation tool?" → cap at WARM 60 (adjacent, wrong category)

Example for a "YouTube loop extension":
  ✅ "How do I loop a section of a YouTube video?" → HOT (exact match)
  ❌ "Best video editor for YouTube?" → cap at WARM (adjacent, different category)

Rule: if the user could solve their stated problem with a completely DIFFERENT
type of tool than yours, it is NOT a HOT lead — regardless of how explicit
their ask is. They are not in market for YOUR product.

═══════════════════════════════════════════════════════════════════════
SCORING (0-100) — LEAN GENEROUS, NOT CONSERVATIVE (within category):
═══════════════════════════════════════════════════════════════════════

DEFAULT RULE: when the post matches the product's EXACT category AND
expresses pain or asks for a tool, ERR ON THE HIGH SIDE. Most buyers
don't type "looking for a tool" — they describe their pain. That IS
the buying signal — IF the category matches.

80-100 HOT — author is actively asking for a tool, mentions competitor name,
              or describes urgent switching intent.
              e.g. "anyone know a [category]?", "[competitor] alternative?",
              "[competitor] just broke / raised prices"

60-79  WARM — author describes the EXACT pain this product solves, OR has
              clear frustration with a competitor / status-quo workflow.
              DEFAULT to WARM (60-79) when:
                • Post is in the right category AND user expresses frustration
                  → e.g. "HELP. I can't find the repeat button" for a YouTube
                    loop product = WARM (~70), not POSSIBLE
                • User explicitly compares competitors
                • User says "tired of X" / "X is too expensive" / "X is broken"
              DO NOT downgrade to POSSIBLE/UNLIKELY just because the user
              didn't literally type "what tool should I use?"

40-59  POSSIBLE — related topic, no pain expressed, intent genuinely unclear.
                  Use this ONLY when the post is in the category but the
                  author seems to be discussing rather than struggling.

20-39  UNLIKELY — tangentially related but user is clearly not in buying
                  mode (e.g. casual mention, off-topic main thread).

 0-19  NOT_A_LEAD — completely off-topic, spam, author already solved it,
                    different domain entirely, or confirmed competitor thread.

═══════════════════════════════════════════════════════════════════════
ANTI-BIAS RULES:
═══════════════════════════════════════════════════════════════════════
❌ Don't add "but intent is unclear" caveats to drag scores down.
   If the pain is described, the intent IS clear enough — score it warm/hot.
❌ Don't be conservative when the post matches multiple product pains.
❌ Don't downgrade for short post bodies — many real buyer posts are short.

═══════════════════════════════════════════════════════════════════════
REPLY OPPORTUNITY — be GENEROUS with "comment":
═══════════════════════════════════════════════════════════════════════

Set replyOpportunity = "comment" when:
  • Active discussion comparing tools (even if OP already chose one — commenters reading later are still leads)
  • Other commenters in the thread are looking for alternatives or asking follow-ups
  • The thread has 3+ comments showing real engagement
  • OP's chosen tool has problems someone might want to know about
  • The post is a "competitor thread" (builder showcasing their own) — commenters often ask "is there an alternative that does X?"

Set replyOpportunity = "dm" when:
  • LinkedIn post with specific decision-maker
  • Very personal Reddit post where a public reply would feel intrusive

Set replyOpportunity = "both" when:
  • A public comment AND a DM follow-up would both be appropriate

Set replyOpportunity = "none" ONLY when:
  • The post is from the product team themselves
  • The thread is locked / archived (cannot reply)
  • The thread ALREADY has 5+ tool recommendations and adding another would be pure spam
  • The author has explicitly said "no recommendations please"

In most cases: prefer "comment" over "none". A thoughtful reply almost always has value.

═══════════════════════════════════════════════════════════════════════
ADDITIONAL CHECKS:
═══════════════════════════════════════════════════════════════════════
- Is the post recent enough to engage? (>6 months old = score -20)
- Would replying with this product feel natural, or forced and salesy?

═══════════════════════════════════════════════════════════════════════
Return JSON exactly:
{
  "intentScore":        <0-100>,
  "leadType":           "hot" | "warm" | "possible" | "unlikely" | "not_a_lead",
  "reasoning":          "<one sentence — why this score, shown to the user>",
  "replyOpportunity":   "comment" | "dm" | "both" | "none",
  "suggestedAngle":     "<1-2 sentences: how to naturally bring up the product>",
  "isCompetitorThread": <true if author is showcasing a competing tool, else false>
}`;
}

function leadTypeFromScore(score: number): LeadType {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "possible";
  if (score >= 20) return "unlikely";
  return "not_a_lead";
}

// ── Single-lead processor ───────────────────────────────────────────────────

/**
 * Fetch full content + deep-score one lead. Used by the BullMQ worker per task.
 * Throws on hard failure (fetch error, GPT error after retry).
 */
export async function processOneLead(
  preScored: PreScoredResult,
  intelligence: ProductIntelligence,
): Promise<ScoredLead> {
  // Step 4: fetch full content
  const fetched = await fetchPost(preScored.link, preScored.platform);

  const rawLead: RawLead = {
    ...fetched,
    preScore:      preScored.preScore,
    googleSnippet: preScored.snippet,
    querySource:   preScored.query,
  };

  // Step 5: deep score (one GPT call)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.DEEP_SCORE,
        response_format: { type: "json_object" },
        temperature:     0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: buildDeepScorePrompt(rawLead, intelligence) },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = DeepScoreSchema.parse(JSON.parse(raw));

      // Safety: keep leadType consistent with score even if AI returns mismatched
      const derivedType = leadTypeFromScore(parsed.intentScore);

      // Builder/competitor override: if flagged, clamp score and lead type
      // regardless of what the AI returned for intentScore.
      const isCompetitor = parsed.isCompetitorThread ?? false;
      const finalScore = isCompetitor
        ? Math.min(parsed.intentScore, 10)
        : Math.round(parsed.intentScore);

      return {
        ...rawLead,
        intentScore:        finalScore,
        leadType:           isCompetitor ? "not_a_lead" : derivedType,
        reasoning:          parsed.reasoning,
        replyOpportunity:   parsed.replyOpportunity,
        suggestedAngle:     parsed.suggestedAngle,
        isCompetitorThread: isCompetitor,
      };
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `Deep score failed for ${preScored.link}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// ── Batch processor (test mode + sync runs) ─────────────────────────────────

/**
 * Process many leads with concurrency. In production the orchestrator enqueues
 * one BullMQ task per lead, but this function is useful for the standalone
 * CLI test + for sync runs (debugging, small batches).
 */
export async function runProcessLeads(
  preScored: PreScoredResult[],
  intelligence: ProductIntelligence,
  options: ProcessLeadOptions = {},
): Promise<ProcessLeadOutcome> {
  const concurrency = options.concurrency ?? 3;

  logger.info({ total: preScored.length, concurrency }, "[step4-5] Processing leads");

  const failures: ProcessLeadOutcome["failures"] = [];
  const leads: ScoredLead[] = [];

  await mapWithConcurrency(preScored, concurrency, async (p) => {
    try {
      const scored = await processOneLead(p, intelligence);
      leads.push(scored);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Categorize: "Deep score failed" → score stage, else fetch
      const stage: "fetch" | "score" = msg.includes("Deep score") ? "score" : "fetch";
      failures.push({ url: p.link, stage, error: msg });
      logger.warn({ err, url: p.link, stage }, "[step4-5] Lead failed");
    }
  });

  logger.info(
    { total: preScored.length, succeeded: leads.length, failed: failures.length },
    "[step4-5] Processing complete",
  );

  return { leads, failures };
}
