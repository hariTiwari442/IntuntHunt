/**
 * Process-lead worker.
 * ─────────────────────
 * One job per pre-qualified URL. Runs Steps 4+5 (fetch full content via
 * ScrapeCreators + deep-score via GPT-4o-mini). Updates the lead row in DB
 * (Realtime fires), then:
 *
 *   - If intentScore >= 60 → enqueue REPLY_GEN job
 *   - Increments SearchRun.processedUrls
 *   - If processedUrls === totalUrls → marks SearchRun completed
 *
 * Concurrency: 3 (ScrapeCreators rate-friendly).
 */

import { Worker } from "bullmq";
import { bullmqRedis } from "../cache/redis.client.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../db/prisma.client.js";
import { searchRunRepository } from "../db/repositories/search-run.repository.js";
import { leadRepository } from "../db/repositories/lead.repository.js";
import {
  QueueNames,
  replyGenQueue,
  type ProcessLeadPayload,
  type ReplyGenPayload,
} from "../queues/queue.registry.js";
// fetchPost is intentionally not imported — snippet-only mode (Step 4 skipped).
// Re-import "../lib/scrapecreators.js" if you want to bring back full content fetch.
// import { fetchPost } from "../lib/scrapecreators.js";
import { openai, MODELS } from "../lib/openai.js";
import type { ProductIntelligence } from "../pipeline/types.js";
import { z } from "zod";

const REPLY_THRESHOLD = 60;

// ── Deep-score prompt (mirrors step4-5-process-lead.ts) ─────────────────────

const DeepScoreSchema = z.object({
  intentScore:        z.number().min(0).max(100),
  leadType:           z.enum(["hot", "warm", "possible", "unlikely", "not_a_lead"]),
  reasoning:          z.string().min(1),
  replyOpportunity:   z.enum(["comment", "dm", "both", "none"]),
  suggestedAngle:     z.string(),
  isCompetitorThread: z.boolean().default(false),
});

function buildDeepScorePrompt(
  lead: { url: string; platform: string; subreddit: string | null; title: string;
          content: string; postScore: number; commentCount: number; topComments: string[];
          author: string | null },
  intelligence: ProductIntelligence,
): string {
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

POST (snippet-only mode — title + Google snippet, no full post body):
- Platform: ${lead.platform} (${subRef})
- Title: ${lead.title}
- Snippet: ${(lead.content ?? "").slice(0, 1500)}

⚠️ You are scoring on title + Google snippet only — body and comments are
not available. DO NOT penalise for short or missing content. The title +
snippet are the buyer signal. If the snippet shows pain or intent, score
accordingly even though it's brief.

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

async function deepScore(
  lead: Parameters<typeof buildDeepScorePrompt>[0],
  intelligence: ProductIntelligence,
): Promise<z.infer<typeof DeepScoreSchema>> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.DEEP_SCORE,
        response_format: { type: "json_object" },
        temperature:     0.3,
        messages: [
          { role: "system", content: "You are a lead qualification expert. Return JSON only." },
          { role: "user",   content: buildDeepScorePrompt(lead, intelligence) },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? "{}";
      return DeepScoreSchema.parse(JSON.parse(raw));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Deep score failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

function clampLeadType(score: number, isCompetitorThread: boolean) {
  if (isCompetitorThread) return "not_a_lead" as const;
  if (score >= 80) return "hot"        as const;
  if (score >= 60) return "warm"       as const;
  if (score >= 40) return "possible"   as const;
  if (score >= 20) return "unlikely"   as const;
  return                "not_a_lead"   as const;
}

// ── Main process function ───────────────────────────────────────────────────

async function process(payload: ProcessLeadPayload): Promise<void> {
  const { searchRunId, productId, leadId, intelligenceJson } = payload;
  const log = logger.child({ searchRunId, leadId });

  const intelligence = JSON.parse(intelligenceJson) as ProductIntelligence;

  // Load the lead row (already inserted with pre-score by orchestrator)
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // ── Step 4 (SKIPPED): snippet-only mode ──────────────────────────
  // ScrapeCreators content fetch is disabled. We use the Google snippet
  // (captured in Step 2) as the content for deep scoring. Lower fidelity
  // than full post + comments, but free and works on any tier.
  // To re-enable: replace the block below with the fetchPost(...) call.
  const snippetContent = lead.googleSnippet ?? "";

  await leadRepository.updateContent(leadId, {
    content:      snippetContent,
    // No author / post score / comments without a fetch — frontend handles nulls
    topComments:  [],
  });

  // ── Step 5: deep score (on snippet) ──────────────────────────────
  log.info("[process-lead] deep scoring (snippet mode)");
  const score = await deepScore(
    {
      url:          lead.url,
      platform:     lead.platform,
      subreddit:    lead.subreddit,
      title:        lead.title,
      content:      snippetContent,
      postScore:    0,
      commentCount: 0,
      topComments:  [],
      author:       null,
    },
    intelligence,
  );

  // Apply builder/competitor override
  const isCompetitor = score.isCompetitorThread;
  const finalScore = isCompetitor ? Math.min(score.intentScore, 10) : Math.round(score.intentScore);
  const finalLeadType = clampLeadType(finalScore, isCompetitor);

  await leadRepository.updateScore(leadId, {
    intentScore:        finalScore,
    leadType:           finalLeadType,
    reasoning:          score.reasoning,
    replyOpportunity:   score.replyOpportunity,
    suggestedAngle:     score.suggestedAngle,
    isCompetitorThread: isCompetitor,
  });

  log.info({ score: finalScore, leadType: finalLeadType }, "[process-lead] scored");

  // ── Enqueue reply gen if eligible ────────────────────────────────
  if (finalScore >= REPLY_THRESHOLD && !isCompetitor && score.replyOpportunity !== "none") {
    await replyGenQueue.add("reply-gen", {
      leadId,
      intelligenceJson,
    } satisfies ReplyGenPayload);
    log.info("[process-lead] reply-gen enqueued");
  }

  // ── Update SearchRun counters + completion check ─────────────────
  const { processedUrls, totalUrls } = await searchRunRepository.incrementProcessed(searchRunId);

  if (finalScore >= 40) {
    await prisma.searchRun.update({
      where: { id: searchRunId },
      data:  { leadsScored: { increment: 1 } },
    });
  }

  if (totalUrls != null && processedUrls >= totalUrls) {
    log.info({ processedUrls, totalUrls }, "[process-lead] all leads processed → marking SearchRun complete");
    await searchRunRepository.markCompleted(searchRunId);
  }
}

// ── Worker boot ─────────────────────────────────────────────────────────────

export function startProcessLeadWorker(): Worker {
  const worker = new Worker<ProcessLeadPayload>(
    QueueNames.PROCESS_LEAD,
    async (job) => {
      await process(job.data);
    },
    { connection: bullmqRedis, concurrency: 3 },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.warn({ jobId: job.id, leadId: job.data.leadId, err: err?.message },
      "[process-lead] job failed");
    // After all retries exhausted, still increment processedUrls so the
    // SearchRun completion check fires correctly.
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      try {
        const { processedUrls, totalUrls } = await searchRunRepository.incrementProcessed(job.data.searchRunId);
        if (totalUrls != null && processedUrls >= totalUrls) {
          await searchRunRepository.markCompleted(job.data.searchRunId);
        }
      } catch (e) {
        logger.error({ e }, "[process-lead] failed to increment after final failure");
      }
    }
  });

  worker.on("ready", () => logger.info("[process-lead] worker ready"));
  return worker;
}
