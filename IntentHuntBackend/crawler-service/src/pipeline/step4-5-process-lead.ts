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
 * `deepScoreLead()` below is the single source of truth for the deep-score
 * prompt + competitor-override clamp. It's used both by `processOneLead()`
 * here (the CLI/standalone test path — see scripts/test-step4-5.ts) and by
 * the production process-lead poller (src/workers/process-lead.worker.ts).
 * Previously the poller kept its own inline copy of this ~200-line prompt,
 * and the two silently drifted apart after one was edited and the other
 * wasn't — this function existing in one place is what prevents that from
 * happening again.
 *
 * In production this runs inside a lightweight DB poller (concurrency 3).
 * The single-lead function makes the worker code trivial.
 */

import { z } from "zod";
import { openai, MODELS } from "../lib/openai.js";
import { fetchPost } from "../lib/scrapecreators.js";
import { logger } from "../utils/logger.js";
import type {
  LeadType,
  Platform,
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

/** Minimal shape deepScoreLead() needs — both callers' lead objects satisfy this. */
export interface DeepScoreLeadInput {
  url:          string;
  platform:     Platform | string;
  subreddit?:   string | null;
  title:        string;
  content:      string;
  postScore:    number;
  commentCount: number;
  topComments:  string[];
  author:       string | null;
}

export interface DeepScoreResult {
  intentScore:        number;
  leadType:           LeadType;
  reasoning:          string;
  replyOpportunity:   ReplyOpportunity;
  suggestedAngle:     string;
  isCompetitorThread: boolean;
}

function buildDeepScorePrompt(lead: DeepScoreLeadInput, intelligence: ProductIntelligence): string {
  const subRef = lead.subreddit ? `r/${lead.subreddit}` : lead.platform;
  const comments = lead.topComments.length > 0
    ? lead.topComments.slice(0, 3).map((c, i) => `Comment ${i + 1}: ${c.slice(0, 300)}`).join("\n---\n")
    : "(no comments)";

  return `PRODUCT CONTEXT:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- Problem solved: ${intelligence.problem}
- Audience: ${intelligence.audience}
- Direct competitors: ${intelligence.alternatives.join(", ")}
- Pain points: ${intelligence.pains.join("; ")}

POST:
- Platform: ${lead.platform} (${subRef})
- Author: ${lead.author ?? "unknown"}
- Title: ${lead.title}
- Post body: ${(lead.content ?? "").slice(0, 3000)}
- Score: ${lead.postScore} | Comments: ${lead.commentCount}
- Top comments:
${comments}

Note: not every platform's comments are available here (LinkedIn and
Twitter fetches don't include replies) — an empty comments section
doesn't mean anything by itself, don't penalise for it.

═══════════════════════════════════════════════════════════════════════
COMPETITOR / BUILDER CHECK — be careful with false positives:
═══════════════════════════════════════════════════════════════════════
isCompetitorThread = true if ANY of these is true:

A) STRONG SIGNAL (sufficient on its own, no other cue needed):
   The post OPENS like buyer pain ("I was struggling with...", "Tired of
   manually...") and then PIVOTS into walking through a SPECIFIC product's
   features/specs in detail (e.g. "it scans the card and pulls out name,
   phone, email in 3 seconds, no typing"). That pain-hook-then-feature-walkthrough
   shape is a marketing pattern, not a buyer asking for help — flag it even
   with no explicit "I built this" and no link to the product.

B) WEAKER SIGNALS (need 2+ of these together):
  • Explicit "I built", "I made", "my extension", "my tool", "I'm working on"
  • Links to their own Chrome Web Store / GitHub / website
  • "Show HN" or "feedback welcome" framing
  • Active promotional posture

C) CORPORATE ANNOUNCEMENT VOICE (sufficient on its own — common on Twitter/X,
   where companies post from the brand account rather than a founder's
   personal voice):
   The post announces or describes a product in first-person-PLURAL corporate
   voice — "we're excited to announce", "introducing X", "X is back", "our new
   app", "we help you…" — and then lists what that product does. A brand
   account never says "I built this"; it says "we launched this", so Signal B's
   first-person-singular wording will not fire here even though this is exactly
   the same self-promotion. The giveaway is the pronoun + announcement frame,
   NOT who the account claims to be.

   Note: announcement framing usually sits in the FIRST sentence, and a
   marketing post's remaining sentences often read like pure buyer pain
   ("no more manual entry!", "tired of typing contacts?"). Weigh the opening
   frame over the pain-flavoured sentences that follow it.

DO NOT mark as competitor thread just because:
  • Title says "Free youtube looper" (could be a user ASKING about free tools)
  • Title says "Best youtube looper" (likely a buyer comparing options)
  • Post mentions a competitor's name (buyers always mention competitors)
  • Title sounds tool-flavored without explicit "I built it"
  • The author describes THEIR OWN pain/workflow in detail without naming
    or pitching a specific product to solve it — that's just a real buyer
    venting, not promotion. Signal A requires an actual product being
    walked through, not just a detailed problem description.

If isCompetitorThread = true → score 0-10.
If unsure → leave isCompetitorThread = false and score normally.

═══════════════════════════════════════════════════════════════════════
PLATFORM COMPATIBILITY:
═══════════════════════════════════════════════════════════════════════
If author explicitly asks for an incompatible platform (e.g. Firefox-only when
your product is Chrome-only), subtract 20 from final score.

═══════════════════════════════════════════════════════════════════════
CATEGORY MATCH CHECK — BEFORE scoring HOT (80+):
═══════════════════════════════════════════════════════════════════════
HOT (80+) is reserved for posts that need EXACTLY this product's category.

If the user is asking for a DIFFERENT category of tool (even if related):
  → cap at WARM (60-79) maximum
  → never HOT

Example for a "business card scanner" product:
  ✅ "How do I scan business cards fast at trade shows?" → HOT 85 (exact match)
  ✅ "Tool to extract contacts from business card photos?" → HOT 80 (exact match)
  ❌ "Looking for a CRM with automation" → cap at WARM 65 (adjacent, wrong category)
  ❌ "Best follow-up automation tool?" → cap at WARM 60 (adjacent, wrong category)

Example for a "YouTube loop extension":
  ✅ "How do I loop a section of a YouTube video?" → HOT (exact match)
  ❌ "Best video editor for YouTube?" → cap at WARM (adjacent, different category)

Rule: if the user could solve their stated problem with a completely DIFFERENT
type of tool than yours, it is NOT a HOT lead — regardless of how explicit
their ask is. They are not in market for YOUR product.

═══════════════════════════════════════════════════════════════════════
SCORING — LEAN GENEROUS, NOT CONSERVATIVE (within category):
═══════════════════════════════════════════════════════════════════════

DEFAULT RULE: when the post matches the product's exact category AND
expresses pain or asks for a tool, ERR ON THE HIGH SIDE. Most buyers
don't type "looking for a tool" — they describe their pain. That IS
the buying signal — IF the category matches.

80-100 HOT — author is actively asking for a tool in THIS product's exact
              category, mentions competitor name, or describes urgent
              switching intent.
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
REPLY OPPORTUNITY — prefer "comment":
═══════════════════════════════════════════════════════════════════════
- "comment" (DEFAULT) — most active threads
- "dm" — LinkedIn specifically, or sensitive personal Reddit posts
- "none" — locked thread, post is from product team, or 5+ tool recs already

═══════════════════════════════════════════════════════════════════════
Return JSON:
{
  "intentScore":        <0-100>,
  "leadType":           "hot" | "warm" | "possible" | "unlikely" | "not_a_lead",
  "reasoning":          "<one sentence — state WHY this score, in the buyer's voice if possible>",
  "replyOpportunity":   "comment" | "dm" | "both" | "none",
  "suggestedAngle":     "<1-2 sentences: how to naturally bring up the product>",
  "isCompetitorThread": <true ONLY if author is explicitly showcasing own tool>
}`;
}

function leadTypeFromScore(score: number): LeadType {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "possible";
  if (score >= 20) return "unlikely";
  return "not_a_lead";
}

/**
 * Deep-score one post via GPT-4o-mini and apply the competitor-override
 * clamp. Single source of truth — see file header.
 *
 * @throws on hard GPT failure (after 1 retry).
 */
export async function deepScoreLead(
  lead: DeepScoreLeadInput,
  intelligence: ProductIntelligence,
): Promise<DeepScoreResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.DEEP_SCORE,
        response_format: { type: "json_object" },
        temperature:     0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: buildDeepScorePrompt(lead, intelligence) },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = DeepScoreSchema.parse(JSON.parse(raw));

      // Builder/competitor override: if flagged, clamp score and lead type
      // regardless of what the AI returned for intentScore.
      const isCompetitor = parsed.isCompetitorThread ?? false;
      const finalScore = isCompetitor
        ? Math.min(parsed.intentScore, 10)
        : Math.round(parsed.intentScore);
      // Safety: keep leadType consistent with the (rounded, clamped) score
      // even if the AI returned a mismatched one.
      const finalLeadType = isCompetitor ? "not_a_lead" : leadTypeFromScore(finalScore);

      return {
        intentScore:        finalScore,
        leadType:           finalLeadType,
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
    `Deep score failed for ${lead.url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// ── Single-lead processor (CLI/standalone test path) ────────────────────────

/**
 * Fetch full content + deep-score one lead. Used by scripts/test-step4-5.ts.
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

  // Step 5: deep score
  const scored = await deepScoreLead(rawLead, intelligence);

  return { ...rawLead, ...scored };
}

// ── Batch processor (test mode + sync runs) ─────────────────────────────────

/**
 * Process many leads with concurrency. In production the process-lead poller
 * handles leads one at a time as it claims them, but this function is useful
 * for the standalone CLI test + for sync runs (debugging, small batches).
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
