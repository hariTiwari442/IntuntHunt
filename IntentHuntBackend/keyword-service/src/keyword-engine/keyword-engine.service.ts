import { z } from "zod";
import { openaiClient } from "./openai.client.js";
import type {
  KeywordEngineResult,
  ProductIntelligence,
} from "./keyword-engine.types.js";

// Higher-quality model for keyword generation. Cost is negligible at this volume.
const MODEL = "gpt-4o";

// ── Banned query prefixes (safety net for AI slip-ups) ──────────────────────

const BANNED_QUERY_PREFIXES = [
  // Pure content marketing / informational patterns
  "best practices for",
  "top 10",
  "guide to",
  "introduction to",
  "overview of",
  "comparison of",
  "how to choose",
  // Clickbait / listicle / explainer patterns
  "what is",
  "ultimate guide",
  "complete guide",
  "beginner's guide",
  "everything you need to know",
  "history of",
  "future of",
];

// ── Invalid subreddits blocklist ────────────────────────────────────────────

const INVALID_SUBREDDITS = new Set([
  "funny",
  "memes",
  "dankmemes",
  "me_irl",
  "pics",
  "videos",
  "news",
  "worldnews",
  "politics",
  "politicalhumor",
  "askreddit",
  "showerthoughts",
  "todayilearned",
  "tifu",
  "aww",
  "cats",
  "dogs",
  "eyebleach",
  "gaming",
  "pcmasterrace",
  "all",
  "popular",
  "random",
]);

// ── Must-include subreddits ─────────────────────────────────────────────────
// Disabled — auto-injecting business subreddits caused noise for consumer
// products (e.g. searching "YouTube Repeat" in r/sales). The AI's subreddit
// picks are now trusted as-is. Re-enable conditionally if needed.

const ALWAYS_INCLUDE_SUBREDDITS: string[] = [];

// ── Post-generation filters ─────────────────────────────────────────────────

function filterQueries(queries: string[]): string[] {
  return queries.filter((q) => {
    const lower = q.toLowerCase();
    if (lower.split(/\s+/).length > 6) return false;
    return !BANNED_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix));
  });
}

function filterSubreddits(subreddits: string[]): string[] {
  return subreddits.filter((s) => !INVALID_SUBREDDITS.has(s.toLowerCase()));
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const IntelligenceSchema = z.object({
  productName: z.string().min(1),
  category: z.string().min(1),
  problem: z.string().min(1),
  audience: z.string().min(1),
  pains: z.array(z.string()).min(3).max(10),
  alternatives: z.array(z.string()).min(3),
  triggers: z.array(z.string()).min(2),
  searchPhrases: z.array(z.string()).min(3).max(10),
});

const QueriesAndSubredditsSchema = z.object({
  redditGlobal: z.array(z.string()).min(1),
  redditSubreddit: z.array(z.string()).min(1),
  hackernews: z.array(z.string()).min(1),
  linkedin: z.array(z.string()).min(1).max(2),
  subreddits: z
    .array(z.string().regex(/^[A-Za-z0-9_]+$/))
    .min(3)
    .max(10),
});

// ── Step 1: Extract product intelligence ────────────────────────────────────

async function extractIntelligence(
  description: string,
): Promise<ProductIntelligence> {
  const response = await openaiClient.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a senior product researcher who has analysed thousands of B2B and consumer products. You understand exactly how buyers describe their pain in public posts (Reddit, HN, LinkedIn). Respond with a single valid JSON object only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: `Analyse this product description and extract structured intelligence. Your output drives a lead-finding engine, so accuracy matters.

Product description:
${description}

Return JSON with these exact fields:

1. productName   — The EXACT product name (e.g. "Notion", "Lemlist", "SavvyCal"). If not stated, infer from context.

2. category      — 2-4 word category that REAL users would type in search (e.g. "cold email tool", "meeting scheduler app"). Avoid jargon.

3. problem       — One sentence stating the ROOT problem the product solves. Frame it from the buyer's perspective, not the product's.

4. audience      — Who specifically buys this? Be precise (e.g. "B2B SDRs at 10-100 person SaaS startups", not just "salespeople").

5. pains         — EXACTLY 5 specific, observable pain points. Each pain must be something a real buyer would mention in a post or complaint. Use the buyer's voice ("our deliverability tanked", "manual personalization eats hours"). NO abstract pains like "inefficiency".

6. alternatives  — 4-7 REAL competitor product names people currently use as alternatives. Brand names only (e.g. "Apollo", "Lemlist", "Outreach.io"). No generic descriptions like "email tools".

7. triggers     — 3-5 specific MOMENTS that push someone to actively look for this product RIGHT NOW. Each trigger should be a concrete event, not a vague want. Examples:
   ✅ "Apollo just raised prices 40%"
   ✅ "Gmail's new spam filter killed our deliverability"
   ✅ "We just hired 3 SDRs and need automation"
   ❌ "Need to grow sales" (too vague)

8. searchPhrases — 5-8 SHORT phrases (2-5 words each) that a buyer might literally TYPE into Reddit/HN/Google search when looking for this product. These should sound like raw search queries, not full sentences. Mix competitor-driven, pain-driven, and category-driven phrases.
   ✅ "apollo too expensive"
   ✅ "lemlist alternative"
   ✅ "cold email deliverability"
   ✅ "cheap cold email tool"
   ❌ "I am looking for a cold email tool" (too long/sentence-like)
   ❌ "best email" (too generic)

Return format:
{
  "productName":   "...",
  "category":      "...",
  "problem":       "...",
  "audience":      "...",
  "pains":         ["...", "...", "...", "...", "..."],
  "alternatives":  ["RealName1", "RealName2", "RealName3", "RealName4"],
  "triggers":      ["...", "...", "..."],
  "searchPhrases": ["phrase1", "phrase2", "phrase3", "phrase4", "phrase5"]
}`,
      },
    ],
    temperature: 0.4,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return IntelligenceSchema.parse(JSON.parse(raw) as unknown);
}

// ── Step 2: Generate queries + subreddits in a SINGLE call ──────────────────
// Combined so the AI sees both at once → queries match the chosen subreddits.
// Includes 2 few-shot examples (B2B SaaS + Chrome extension) to anchor quality.

async function generateQueriesAndSubreddits(
  intelligence: ProductIntelligence,
): Promise<{
  redditGlobal: string[];
  redditSubreddit: string[];
  hackernews: string[];
  linkedin: string[];
  subreddits: string[];
}> {
  const competitors = intelligence.alternatives.slice(0, 4);

  const response = await openaiClient.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a senior growth marketer who has run hundreds of social-listening campaigns. You understand the EXACT phrases buyers use in Reddit/HN/LinkedIn posts when they're shopping for a tool, AND which subreddits have an active 'what tool do you use?' culture. Your queries are short, specific, and match real buyer language. Respond with a single valid JSON object only. No markdown, no explanation.",
      },

      // ── Few-shot example 1: B2B SaaS (cold email tool) ────────────────────
      {
        role: "user",
        content: `Generate queries and subreddits for this product:

Product:
- Name: Lemlist
- Category: cold email outreach tool
- Audience: B2B SDRs at 10-100 person SaaS startups
- Pains: ["deliverability tanks after 500 emails/day", "manual personalization eats hours", "Apollo's pricing keeps creeping up"]
- Direct competitors: Apollo, Instantly, Smartlead, Outreach.io
- Triggers: ["Apollo raised prices 40%", "Gmail's new spam filter killed deliverability"]
- Buyer search phrases: ["apollo alternative", "lemlist vs apollo", "cold email deliverability", "cheap cold email tool", "instantly review"]`,
      },
      {
        role: "assistant",
        content: JSON.stringify({
          redditGlobal: [
            "Apollo alternative",
            "Instantly alternative",
            "Smartlead",
            "Apollo",
            "cold email deliverability",
            "cold email for startups",
          ],
          redditSubreddit: [
            "Apollo",
            "Instantly",
            "deliverability",
            "cold email tool",
          ],
          hackernews: [
            "Apollo",
            "Instantly",
            "Show HN cold email",
            "email deliverability",
            "cold email for SaaS",
          ],
          linkedin: ["switched from Apollo", "looking for cold email tool"],
          subreddits: [
            "coldemail",
            "sales",
            "SaaS",
            "Entrepreneur",
            "startups",
            "smallbusiness",
          ],
        }),
      },

      // ── Few-shot example 2: Indie / Chrome extension ──────────────────────
      {
        role: "user",
        content: `Generate queries and subreddits for this product:

Product:
- Name: Superhuman Reader
- Category: AI reading Chrome extension
- Audience: knowledge workers who skim Reddit/HN/articles all day
- Pains: ["too many tabs open", "can't keep up with long reads", "Pocket sync is broken"]
- Direct competitors: Pocket, Readwise, Matter, Instapaper
- Triggers: ["Pocket shutting down", "spending 2 hrs/day reading newsletters"]
- Buyer search phrases: ["pocket alternative", "readwise alternative", "AI reading tool", "chrome read later", "matter app review"]`,
      },
      {
        role: "assistant",
        content: JSON.stringify({
          redditGlobal: [
            "Pocket alternative",
            "Readwise alternative",
            "Matter app",
            "Pocket shutting down",
            "AI reading tool",
            "Chrome extension reader",
          ],
          redditSubreddit: [
            "Pocket",
            "Readwise",
            "reading list",
            "AI tools",
          ],
          hackernews: [
            "Readwise",
            "Pocket",
            "Show HN AI reader",
            "tab management",
            "read later for HN",
          ],
          linkedin: ["switching from Pocket", "looking for reading tool"],
          subreddits: [
            "chrome_extensions",
            "productivity",
            "InternetIsBeautiful",
            "SideProject",
            "microsaas",
            "selfhosted",
          ],
        }),
      },

      // ── Actual request ────────────────────────────────────────────────────
      {
        role: "user",
        content: `Now generate queries and subreddits for THIS product (same format as the examples above):

Product:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- Problem: ${intelligence.problem}
- Audience: ${intelligence.audience}
- Pains buyers express: ${intelligence.pains.join("; ")}
- Direct competitors: ${intelligence.alternatives.join(", ")}
- Trigger moments: ${intelligence.triggers.join("; ")}
- Buyer search phrases (USE THESE — they are literal phrases buyers type): ${intelligence.searchPhrases.join(" | ")}

═══════════════════════════════════════════════════════════════════════
HOW BUYER-INTENT SEARCH WORKS:
═══════════════════════════════════════════════════════════════════════
Reddit/HN/LinkedIn search returns posts whose TEXT contains your query words. So your query must match phrases that appear in posts written BY buyers — not posts about the category in general.

High-intent posts look like:
  • "Looking for an alternative to ${competitors[0] ?? "Apollo"}, anyone tried...?"
  • "${competitors[0] ?? "Apollo"} just raised prices, what are you switching to?"
  • "Best ${intelligence.category} for a 5-person team?"
  • "Why I left ${competitors[1] ?? "Lemlist"}"

═══════════════════════════════════════════════════════════════════════
HARD RULES:
═══════════════════════════════════════════════════════════════════════
✅ DO:
  • Use competitor names standalone
  • Use "[competitor] alternative" — explicit switching intent
  • Use short pain phrases buyers actually type
  • Keep each query 1-5 words

❌ DON'T:
  • Generic prefixes ("recommendations for", "best practices for", "guide to")
  • Marketing-speak ("solution", "platform", "leveraging")
  • Long sentences — Reddit search degrades past 5 words
  • Generic single words that match 1000s of posts ("email", "sales", "marketing")

═══════════════════════════════════════════════════════════════════════
SUBREDDIT PICKING RULES:
═══════════════════════════════════════════════════════════════════════
  • Pick subreddits where members actively POST asking for tools
  • Niche > broad (r/coldemail > r/marketing for a cold email tool)
  • Match audience exactly (r/sales for B2B SDRs, r/SideProject for indie hackers)
  • Avoid subs where users BUILD the tool instead of BUY it
  • 5-8 subreddits, no r/ prefix, exact case

═══════════════════════════════════════════════════════════════════════
QUERY MIX:
═══════════════════════════════════════════════════════════════════════
redditGlobal (6 queries, 1-5 words each):
  • 2x competitor standalone
  • 2x "[competitor] alternative"
  • 1x specific pain phrase
  • 1x category + audience modifier

redditSubreddit (4 queries, 1-4 words each — broader since subreddit narrows audience):
  • 2x competitor standalone
  • 1x pain phrase
  • 1x category alone

hackernews (5 queries, 1-4 words each):
  • 2x competitor standalone
  • 1x "Show HN [category]" or "[category] startup"
  • 1x technical/infra angle from the pains
  • 1x category + audience

linkedin (exactly 2 queries, 2-5 words each):
  • 1x "switched from [competitor]" or "switching from [competitor]"
  • 1x "looking for [category]" or trigger phrase

subreddits (5-8 entries):
  • Niche-first, then broad
  • No r/ prefix, exact case (e.g. "SaaS" not "saas")

Return JSON with this exact shape:
{
  "redditGlobal":    [ /* 6 strings */ ],
  "redditSubreddit": [ /* 4 strings */ ],
  "hackernews":      [ /* 5 strings */ ],
  "linkedin":        [ /* 2 strings */ ],
  "subreddits":      [ /* 5-8 strings */ ]
}`,
      },
    ],
    temperature: 0.4,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return QueriesAndSubredditsSchema.parse(JSON.parse(raw) as unknown);
}

// ── Step 3: Critique & refine the generated queries/subreddits ──────────────
// Takes the first-pass output and asks the AI to score each item, replacing
// anything weak. This catches the 1-2 generic queries that slip through.

async function critiqueAndRefine(
  intelligence: ProductIntelligence,
  draft: z.infer<typeof QueriesAndSubredditsSchema>,
): Promise<z.infer<typeof QueriesAndSubredditsSchema>> {
  const response = await openaiClient.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a critical reviewer for buyer-intent search queries. You spot generic, weak, or off-target queries and replace them with sharper ones. Respond with a single valid JSON object only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: `Review this draft and improve weak entries. Keep the same structure and counts.

Product context:
- Name: ${intelligence.productName}
- Category: ${intelligence.category}
- Audience: ${intelligence.audience}
- Direct competitors: ${intelligence.alternatives.join(", ")}
- Pains: ${intelligence.pains.join("; ")}
- Buyer search phrases: ${intelligence.searchPhrases.join(" | ")}

Draft to critique:
${JSON.stringify(draft, null, 2)}

═══════════════════════════════════════════════════════════════════════
SCORING RUBRIC (0-10):
═══════════════════════════════════════════════════════════════════════

10 = Pure buyer-intent. Competitor name, "[X] alternative", or a phrase only buyers type.
 8 = Strong buyer signal but slightly generic.
 6 = Mixed — will catch some buyers but also irrelevant posts.
 4 = Mostly informational matches.
 2 = Generic. Matches random unrelated posts.
 0 = Meaningless or off-topic.

═══════════════════════════════════════════════════════════════════════
RULES FOR REFINEMENT:
═══════════════════════════════════════════════════════════════════════

1. Any query scoring < 7 → REPLACE it with a sharper one
2. Replacements should pull from:
   • Competitor names from the alternatives list
   • Buyer search phrases above (use them verbatim when possible)
   • Pain phrases from the pains list
3. Keep the EXACT same count per field (6 / 4 / 5 / 2 / 5-8 subreddits)
4. Keep all queries 1-5 words
5. For subreddits: replace any subreddit where the audience BUILDS instead of BUYS the tool, or where the sub is too broad (r/marketing for a niche tool)

Return the refined JSON with the same shape:
{
  "redditGlobal":    [ /* 6 strings */ ],
  "redditSubreddit": [ /* 4 strings */ ],
  "hackernews":      [ /* 5 strings */ ],
  "linkedin":        [ /* 2 strings */ ],
  "subreddits":      [ /* 5-8 strings */ ]
}`,
      },
    ],
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return QueriesAndSubredditsSchema.parse(JSON.parse(raw) as unknown);
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateKeywords(
  description: string,
): Promise<KeywordEngineResult> {
  const intelligence = await extractIntelligence(description);
  const draft = await generateQueriesAndSubreddits(intelligence);

  // Critique step — refines weak queries by replacing them with sharper ones.
  // If critique fails for any reason, fall back to the original draft.
  let refined = draft;
  try {
    refined = await critiqueAndRefine(intelligence, draft);
  } catch {
    refined = draft;
  }

  const queries = {
    redditGlobal: filterQueries(refined.redditGlobal),
    redditSubreddit: filterQueries(refined.redditSubreddit),
    hackernews: filterQueries(refined.hackernews),
    linkedin: filterQueries(refined.linkedin).slice(0, 2),
  };
  const subreddits = mergeWithAlwaysInclude(filterSubreddits(refined.subreddits));

  return { intelligence, queries, subreddits };
}

// Merge AI-picked subreddits with the always-include list.
// Dedupe case-insensitively (Reddit names are case-insensitive in practice).
function mergeWithAlwaysInclude(aiPicks: string[]): string[] {
  const seen = new Set(aiPicks.map((s) => s.toLowerCase()));
  const merged = [...aiPicks];
  for (const sub of ALWAYS_INCLUDE_SUBREDDITS) {
    if (!seen.has(sub.toLowerCase())) {
      merged.push(sub);
      seen.add(sub.toLowerCase());
    }
  }
  return merged;
}
