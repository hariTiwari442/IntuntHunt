/**
 * Step 1: Keyword Engine
 * ──────────────────────
 * Single GPT-4o call that turns a plain-English product description into:
 *   - ProductIntelligence (productName, productType, pains, competitors, etc.)
 *   - QueryBundle (Google `site:` queries per platform)
 *
 * The engine generates queries for ALL 5 platforms (Reddit, LinkedIn, Twitter,
 * Product Hunt, Indie Hackers), but v1 only fans out Reddit + LinkedIn.
 * Twitter/PH/IH queries are kept in the bundle so we can flip them on later
 * without re-running the engine.
 *
 * Caching is handled by the orchestrator — this function is pure.
 */

import { z } from "zod";
import { openai, MODELS } from "../lib/openai.js";
import type {
  KeywordEngineResult,
  ProductIntelligence,
  ProductType,
  QueryBundle,
} from "./types.js";

// ── Per-product-type platform weights ───────────────────────────────────────
// How many queries to generate per platform for each product type.
// Consumer products skip LinkedIn (nobody posts about Chrome extensions there).

const PLATFORM_WEIGHTS: Record<
  ProductType,
  {
    redditGlobal:           number;
    redditSubredditPerSub:  number;   // how many queries per subreddit (in the map)
    linkedin:               number;
    twitter:                number;
    producthunt:            number;
    indiehackers:           number;
  }
> = {
  b2b_saas:           { redditGlobal: 6, redditSubredditPerSub: 3, linkedin: 3, twitter: 2, producthunt: 1, indiehackers: 1 },
  consumer_extension: { redditGlobal: 6, redditSubredditPerSub: 2, linkedin: 0, twitter: 1, producthunt: 1, indiehackers: 0 },
  developer_tool:     { redditGlobal: 5, redditSubredditPerSub: 3, linkedin: 1, twitter: 2, producthunt: 1, indiehackers: 1 },
  consumer_app:       { redditGlobal: 6, redditSubredditPerSub: 3, linkedin: 0, twitter: 2, producthunt: 1, indiehackers: 0 },
  marketplace:        { redditGlobal: 5, redditSubredditPerSub: 2, linkedin: 2, twitter: 2, producthunt: 1, indiehackers: 1 },
};

// ── Blocklists (safety nets after AI output) ────────────────────────────────

const BANNED_QUERY_PREFIXES = [
  "best practices for",
  "top 10",
  "guide to",
  "introduction to",
  "overview of",
  "comparison of",
  "how to choose",
  "what is",
  "ultimate guide",
  "complete guide",
  "beginner's guide",
  "everything you need to know",
  "history of",
  "future of",
];

const AMBIGUOUS_STANDALONE_TERMS = new Set([
  "looper", "enhancer", "booster", "helper", "manager",
  "optimizer", "assistant", "tracker", "monitor", "reader",
  "player", "recorder", "capture", "converter", "actions",
  "magic", "repeat",
]);

// Multi-word phrases whose words *together* still match too many unrelated
// domains. e.g. "playback control" matches smart TVs, car infotainment.
// Substring-checked against the full query, so "youtube playback control" is
// also killed — disambiguation must come from product-specific words, not
// from wrapping an ambiguous phrase in more generic ones.
const AMBIGUOUS_PHRASES = [
  "playback control",
  "playback speed",
  "video player",
  "media controls",
  "media player",
  "speed control",
  "remote control",
  "video segment",
  "video editing",
];

const INVALID_SUBREDDITS = new Set([
  "funny", "memes", "dankmemes", "me_irl", "pics", "videos",
  "news", "worldnews", "politics", "askreddit", "showerthoughts",
  "todayilearned", "tifu", "aww", "cats", "dogs", "eyebleach",
  "gaming", "pcmasterrace", "all", "popular", "random",
  "anime", "movies", "music", "television", "hfy",
  "options", "wallstreetbets", "cryptocurrency", "eurovision",
]);

// ── Zod schemas (validate AI output) ────────────────────────────────────────

const IntelligenceSchema = z.object({
  productName:   z.string().min(1),
  productType:   z.enum(["b2b_saas", "consumer_extension", "developer_tool", "consumer_app", "marketplace"]),
  category:      z.string().min(1),
  problem:       z.string().min(1),
  audience:      z.string().min(1),
  pains:         z.array(z.string()).min(3).max(10),
  alternatives:  z.array(z.string()).min(3),
  triggers:      z.array(z.string()).min(2),
  searchPhrases: z.array(z.string()).min(3).max(10),
});

const QueryBundleSchema = z.object({
  redditGlobal:    z.array(z.string()).min(1).max(10),
  // 8 subreddits × 2 queries = max 16 sub-scoped queries.
  // This is the hard ceiling — runtime sanitizer below also enforces it
  // even if AI returns more entries than the schema allows.
  redditSubreddit: z.record(
    z.string().regex(/^[A-Za-z0-9_]+$/, "Invalid subreddit name"),
    z.array(z.string()).min(1).max(2),
  ),
  linkedin:        z.array(z.string()).max(5),
  twitter:         z.array(z.string()).max(5),
  producthunt:     z.array(z.string()).max(3),
  indiehackers:    z.array(z.string()).max(3),
});

// Hard volume caps enforced after AI output (in case Zod's max() doesn't catch overflow).
const MAX_SUBREDDITS_PER_PRODUCT = 8;
const MAX_QUERIES_PER_SUBREDDIT  = 2;

const ResponseSchema = z.object({
  intelligence: IntelligenceSchema,
  queries:      QueryBundleSchema,
});

// ── Post-AI filters ─────────────────────────────────────────────────────────

/** Case-insensitive dedup, preserving first occurrence and original casing. */
function dedup(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries.filter((q) => {
    const key = q.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterQuery(q: string): boolean {
  const lower = q.toLowerCase().trim();
  if (lower.length === 0) return false;
  if (lower.split(/\s+/).length > 6) return false;
  if (BANNED_QUERY_PREFIXES.some((p) => lower.startsWith(p))) return false;

  // Reject queries containing any ambiguous multi-word phrase. "youtube
  // playback control" gets killed because the "playback control" core still
  // drags in smart TVs, car infotainment, etc. Adding "youtube" doesn't
  // disambiguate enough — real disambiguation needs product-specific words
  // like "loop" or "ab repeat".
  if (AMBIGUOUS_PHRASES.some((p) => lower.includes(p))) return false;

  // Block 1-2 word queries where every word is in the ambiguous set
  const words = lower.split(/\s+/);
  if (
    words.length <= 2 &&
    words.every((w) => AMBIGUOUS_STANDALONE_TERMS.has(w.replace(/s$/, "")))
  ) {
    return false;
  }
  return true;
}

function sanitizeQueries(raw: QueryBundle): QueryBundle {
  // Order: filter → dedup → cap. Filter removes garbage; dedup removes
  // duplicates; cap enforces hard volume limits so a runaway AI output can't
  // explode into 100+ queries per crawl.
  const clean = (qs: string[]) => dedup(qs.filter(filterQuery));

  // Build subreddit map with caps
  const subEntries = Object.entries(raw.redditSubreddit)
    .filter(([sub]) => !INVALID_SUBREDDITS.has(sub.toLowerCase()))
    .map(([sub, queries]) => [sub, clean(queries).slice(0, MAX_QUERIES_PER_SUBREDDIT)] as const)
    .filter(([, queries]) => queries.length > 0)
    .slice(0, MAX_SUBREDDITS_PER_PRODUCT);

  return {
    redditGlobal:    clean(raw.redditGlobal).slice(0, 8),
    redditSubreddit: Object.fromEntries(subEntries),
    linkedin:        clean(raw.linkedin).slice(0, 4),
    twitter:         clean(raw.twitter).slice(0, 3),
    producthunt:     clean(raw.producthunt).slice(0, 2),
    indiehackers:    clean(raw.indiehackers).slice(0, 2),
  };
}

// Enforce platform-skip rules: consumer products must have empty LinkedIn.
function enforceSkipRules(intelligence: ProductIntelligence, queries: QueryBundle): QueryBundle {
  const weights = PLATFORM_WEIGHTS[intelligence.productType];
  return {
    ...queries,
    linkedin:     weights.linkedin     === 0 ? [] : queries.linkedin,
    twitter:      weights.twitter      === 0 ? [] : queries.twitter,
    producthunt:  weights.producthunt  === 0 ? [] : queries.producthunt,
    indiehackers: weights.indiehackers === 0 ? [] : queries.indiehackers,
  };
}

// ── Prompt construction ─────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a senior growth marketer who has run hundreds of social-listening " +
  "campaigns. You generate Google site: search queries that find people in " +
  "buying mode across Reddit, LinkedIn, Twitter, Product Hunt, and Indie Hackers. " +
  "You understand the exact phrases buyers use when they're shopping for a tool. " +
  "Respond with a single valid JSON object only. No markdown, no explanation.";

const USER_PROMPT_TEMPLATE = (description: string) => `Generate a complete lead-finding bundle for this product.

PRODUCT DESCRIPTION:
${description}

═══════════════════════════════════════════════════════════════════════
HOW THIS DRIVES OUR SEARCH:
═══════════════════════════════════════════════════════════════════════
Your output goes through this pipeline:
  1. Each query gets prefixed with site:reddit.com / site:linkedin.com etc.
  2. Google ranks the results (semantic + phrase-aware, unlike Reddit native search)
  3. We pre-score titles + snippets to filter noise
  4. Survivors get full content fetched + deep-scored

Because Google handles relevance, your queries can use NATURAL LANGUAGE
and longer phrases (4-6 words is fine on Google — unlike Reddit native search
where it degrades past 3-4 words). Phrases in quotes help: "youtube loop extension".

═══════════════════════════════════════════════════════════════════════
PRODUCT-TYPE CLASSIFICATION (one of these exactly):
═══════════════════════════════════════════════════════════════════════
  • b2b_saas           — sold to businesses/teams, recurring revenue
  • consumer_extension — browser extension, individual users install from store
  • developer_tool     — SDK, CLI, API, dev-focused
  • consumer_app       — mobile/web app for individual consumers
  • marketplace        — connects buyers + sellers, two-sided

CRITICAL: A Chrome extension is ALWAYS "consumer_extension" even if it targets professionals.
A CLI tool or npm package is ALWAYS "developer_tool".

═══════════════════════════════════════════════════════════════════════
WHAT TO RETURN:
═══════════════════════════════════════════════════════════════════════

intelligence:
  productName:    EXACT product name (infer if not stated)
  productType:    one of the 5 enums above
  category:       2-4 word category (e.g. "YouTube loop extension", "cold email tool")
  problem:        1 sentence in buyer's voice ("I want to loop part of a YouTube video...")
  audience:       Specific. NOT "professionals" — say WHO and WHERE they hang out
  pains:          5 specific pains in buyer's voice (e.g. "Apollo raised prices 40%")
  alternatives:   3-6 REAL competitor product names you are 95%+ CERTAIN exist with active users.
                  If unsure about a name, OMIT it. Phantom competitors waste search credits.
                  Use the EXACT FULL NAME as users would write it (e.g. "Looper for YouTube",
                  "Magic Actions for YouTube", "Enhancer for YouTube" — not "Looper", "Magic", "Enhancer").
                  Quality over quantity: 3 real competitors > 7 with 3 hallucinated.
  triggers:       3-5 concrete events that make someone search NOW
  searchPhrases:  5-8 short phrases (2-5 words) a buyer would literally TYPE in Google
                  Every word must be specific enough to avoid unrelated domains
                  ✅ "youtube ab repeat chrome"
                  ❌ "playback control" (matches every media player)

queries (Google site: queries — Google adds the site: prefix later):
  redditGlobal:    array of full-Reddit queries
  redditSubreddit: MAP { subreddit → queries } — each sub gets queries tuned to its vocabulary
  linkedin:        array of LinkedIn-style queries
  twitter:         array of Twitter/X queries
  producthunt:     array of PH queries
  indiehackers:    array of IH queries

═══════════════════════════════════════════════════════════════════════
PER-PLATFORM QUERY STRATEGY:
═══════════════════════════════════════════════════════════════════════

REDDIT (global) — what does a buyer literally write in a post title/body?
  ✅ "Looper for YouTube alternative"
  ✅ "loop part of youtube video"
  ✅ "youtube ab repeat chrome extension"
  ❌ "video segment looper" (matches guitar loopers)

REDDIT (per-subreddit) — vocabulary varies per community:
  In r/guitarlessons: short queries OK ("loop", "repeat section") — sub gives context
  In r/chrome_extensions: needs product context ("youtube loop", "video repeat")
  In r/productivity: broad subs need specific queries ("youtube loop extension")

  SUBREDDIT COUNT — pick based on audience breadth:
  • TIGHT audience (one community): 3-5 subreddits
    e.g. "B2B SDRs" → r/sales, r/SaaS, r/coldemail, r/startups
  • BROAD audience (multiple distinct communities): 6-8 subreddits
    e.g. "musicians + language learners + students" needs r/guitarlessons,
    r/pianolearning, r/learnmusic, r/languagelearning, r/musictheory,
    r/YoutubeHelp, r/chrome_extensions
  • Always include 1-2 use-case subs where people DO the activity (not just discuss tools)
  • HARD CAP: maximum 8 subreddits total. Do NOT exceed this. Pick the BEST 8.

  QUERIES PER SUBREDDIT:
  • EXACTLY 1-2 queries per subreddit. Maximum 2.
  • Subreddit context already narrows the audience — extra queries dilute results.
  • Pick the SHARPEST 1-2 phrases for each sub.

LINKEDIN — natural keyword combos, NOT prescriptive phrases:
  Google's LinkedIn index is sparse. Exact phrases like "looking for X" or
  "switched to X" almost never appear in indexed posts. Use SHORT, LOOSE
  keyword combos that match how people actually post.

  ✅ "trade show business cards"        (3 keywords, no quote markers)
  ✅ "digitize business cards"
  ✅ "scan business cards trade show"
  ✅ "lead capture event"
  ❌ "looking for business card scanner" (too prescriptive, near-zero index hits)
  ❌ "switched to cardSnap"              (your product's name won't be indexed yet)
  ❌ "anyone use [product]"              (rare in LinkedIn posts)

  Rules:
  - 2-4 keywords each, separated by spaces
  - NEVER wrap in quotes — Step 2 handles formatting
  - Use ACTIVITY / PAIN keywords, not user-question patterns
  - Empty if productType is consumer_extension or consumer_app.

TWITTER — short, casual asks:
  ✅ "need youtube looper"
  ✅ "cold email tool recommendation"

PRODUCT HUNT — product discovery context:
  ✅ "youtube loop"
  ✅ "cold email automation"

INDIE HACKERS — founder/builder community:
  ✅ "youtube extension"
  ✅ "cold email saas"

═══════════════════════════════════════════════════════════════════════
WHEN TO LEAVE A PLATFORM ARRAY EMPTY:
═══════════════════════════════════════════════════════════════════════
Leave a platform's array as [] ONLY when that platform is genuinely
irrelevant for this product type:
  • consumer_extension / consumer_app: linkedin = [], indiehackers = []
    (nobody discusses Chrome extensions or consumer apps on LinkedIn/IH)
  • All other product types: every platform should have at least 1 query.

Do NOT leave a platform empty just because you struggled to think of a query.
If a platform is listed for this product type, generate the required number.

═══════════════════════════════════════════════════════════════════════
HARD RULES:
═══════════════════════════════════════════════════════════════════════
  • Every query 1-5 words
  • EVERY WORD MUST CARRY WEIGHT. Drop filler:
    ✅ "loop section youtube video"     ❌ "loop part of youtube video"
    ✅ "repeat section youtube"          ❌ "repeat section of youtube video"
    ✅ "youtube loop"                    ❌ "youtube loop specific part"
    Words like "of", "the", "part", "specific" usually add nothing on Google.
  • NEVER use generic prefixes: "best practices for", "top 10", "guide to", "what is", "ultimate guide"
  • NEVER use standalone ambiguous terms: looper, enhancer, booster, helper, actions, magic, repeat
    (always pair with product context — "youtube looper" is fine, "looper" alone is not)
  • NEVER use ambiguous multi-word phrases as a whole query:
    ❌ "playback control" (matches smart TVs, car infotainment)
    ❌ "video player" (matches sports replays, media players)
    ❌ "speed control" (matches motorcycles, drones, fans)
  • Competitor names as standalone queries ONLY if unique enough (use FULL name: "Looper for YouTube" not "Looper")
  • Subreddit names: exact case, no r/ prefix, valid subreddit name format
  • PREFER FEWER, TIGHTER queries over more loose ones. 6 sharp queries beat 8 loose ones.

═══════════════════════════════════════════════════════════════════════
FEW-SHOT EXAMPLE 1 — B2B SaaS (cold email tool):
═══════════════════════════════════════════════════════════════════════
Description: "Lemlist is a cold email outreach tool for B2B SDRs with built-in deliverability"
{
  "intelligence": {
    "productName": "Lemlist",
    "productType": "b2b_saas",
    "category": "cold email outreach tool",
    "problem": "I need to send cold emails at scale without landing in spam",
    "audience": "B2B SDRs at 10-100 person SaaS startups doing outbound sales",
    "pains": [
      "Apollo just raised prices 40%",
      "Gmail's spam filter killed our deliverability",
      "manual personalization eats hours every week",
      "current tool's UI is too complex for a 5-person team",
      "no built-in email warming"
    ],
    "alternatives": ["Apollo.io", "Instantly", "Smartlead", "Outreach.io"],
    "triggers": [
      "Apollo raised prices significantly",
      "Gmail's new sender guidelines killed deliverability",
      "Just hired 3 SDRs and need scale"
    ],
    "searchPhrases": [
      "apollo alternative",
      "lemlist vs apollo",
      "cold email deliverability",
      "cheap cold email tool",
      "instantly review"
    ]
  },
  "queries": {
    "redditGlobal": [
      "Apollo alternative",
      "Instantly alternative",
      "cold email deliverability",
      "Smartlead vs Instantly",
      "outreach tool for startups",
      "Apollo too expensive"
    ],
    "redditSubreddit": {
      "coldemail": ["deliverability", "Apollo", "email warmup"],
      "sales": ["cold email tool", "Apollo alternative", "outreach platform"],
      "SaaS": ["cold outreach", "outbound tool"]
    },
    "linkedin": ["switched from Apollo", "looking for cold email tool", "outreach platform recommendation"],
    "twitter": ["cold email tool recommendation", "Apollo alternative"],
    "producthunt": ["cold email"],
    "indiehackers": ["cold email saas"]
  }
}

═══════════════════════════════════════════════════════════════════════
FEW-SHOT EXAMPLE 2 — Consumer Chrome Extension (YouTube loop):
═══════════════════════════════════════════════════════════════════════
Description: "Chrome extension that lets users loop specific sections of YouTube videos"
{
  "intelligence": {
    "productName": "Repeatly",
    "productType": "consumer_extension",
    "category": "YouTube loop extension",
    "problem": "I want to loop specific sections of YouTube videos without rewinding manually",
    "audience": "Musicians, language learners, students practicing from YouTube tutorials",
    "pains": [
      "I keep rewinding to the same 10 seconds of a guitar tutorial",
      "YouTube only lets you loop the whole video, not a section",
      "my current loop extension broke after a Chrome update",
      "I need to loop multiple sections back to back",
      "manually scrubbing back every time is exhausting"
    ],
    "alternatives": ["Looper for YouTube", "AB Repeat Player", "Enhancer for YouTube"],
    "triggers": [
      "Started learning guitar from YouTube",
      "Existing loop extension got removed from Chrome store",
      "Practicing dance choreography section by section"
    ],
    "searchPhrases": [
      "loop part of youtube video",
      "youtube ab repeat chrome",
      "repeat section youtube",
      "youtube loop extension"
    ]
  },
  "queries": {
    "redditGlobal": [
      "youtube loop extension",
      "youtube ab repeat",
      "Looper for YouTube alternative",
      "loop section youtube video",
      "youtube repeat chrome extension",
      "AB Repeat Player youtube"
    ],
    "redditSubreddit": {
      "chrome_extensions": ["youtube loop", "youtube repeat"],
      "youtube": ["loop section", "ab repeat"],
      "guitarlessons": ["loop", "repeat section", "slow down youtube"],
      "languagelearning": ["youtube loop", "repeat video section"],
      "musictheory": ["loop youtube", "repeat section"],
      "pianolearning": ["loop youtube", "repeat section"],
      "YoutubeHelp": ["loop section", "repeat part"]
    },
    "linkedin": [],
    "twitter": ["youtube loop extension"],
    "producthunt": ["youtube loop"],
    "indiehackers": []
  }
}

═══════════════════════════════════════════════════════════════════════
NOW GENERATE FOR THE GIVEN PRODUCT.
═══════════════════════════════════════════════════════════════════════
Return ONLY the JSON. No markdown, no explanation.`;

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Generate the full keyword + query bundle for a product.
 * Pure function: no DB, no caching. Caller decides when to call.
 *
 * @throws If GPT returns invalid JSON or schema validation fails twice in a row.
 */
export async function runKeywordEngine(
  description: string,
): Promise<KeywordEngineResult> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model:           MODELS.KEYWORD_ENGINE,
        response_format: { type: "json_object" },
        temperature:     0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: USER_PROMPT_TEMPLATE(description) },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = ResponseSchema.parse(JSON.parse(raw));

      const queries = enforceSkipRules(parsed.intelligence, sanitizeQueries(parsed.queries));

      return { intelligence: parsed.intelligence, queries };
    } catch (err) {
      lastError = err;
      // Loop will retry once
    }
  }

  throw new Error(
    `Keyword engine failed after 2 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
