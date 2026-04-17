import { z } from "zod";
import { openaiClient } from "./openai.client.js";
import type {
  KeywordEngineResult,
  ProductIntelligence,
} from "./keyword-engine.types.js";

const MODEL = "gpt-4o-mini";

// ── Banned query prefixes (safety net for AI slip-ups) ──────────────────────

const BANNED_QUERY_PREFIXES = [
  "recommendations for",
  "comparison of",
  "security of",
  "best practices for",
  "how to choose",
  "top 10",
  "best tools for",
  "guide to",
  "introduction to",
  "overview of",
  "review of",
  "pros and cons",
];

// ── Invalid subreddits blocklist ────────────────────────────────────────────

const INVALID_SUBREDDITS = new Set([
  "funny", "memes", "dankmemes", "me_irl", "pics", "videos",
  "news", "worldnews", "politics", "politicalhumor",
  "askreddit", "showerthoughts", "todayilearned", "tifu",
  "aww", "cats", "dogs", "eyebleach",
  "gaming", "pcmasterrace", "all", "popular", "random",
]);

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
  pains: z.array(z.string()).min(1).max(10),
  alternatives: z.array(z.string()).min(1),
  triggers: z.array(z.string()).min(1),
});

const QueriesSchema = z.object({
  redditGlobal: z.array(z.string()).min(1),
  redditSubreddit: z.array(z.string()).min(1),
  hackernews: z.array(z.string()).min(1),
  linkedin: z.array(z.string()).min(1).max(2),
});

const SubredditsSchema = z.object({
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
          "You are a product analyst. Respond with a single valid JSON object only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: `Given this product description, extract the following and return as JSON:

1. productName  – The exact name of this product (e.g. "Lose It", "Hootsuite", "Notion")
2. category     – 2-4 word category name people would search (e.g. "calorie tracker app", "social media scheduler")
3. problem      – The core problem it solves (1 sentence)
4. audience     – Who exactly the target audience is (1 sentence)
5. pains        – 5 specific pain points it addresses (array of strings)
6. alternatives – REAL competitor product names people currently use instead (array of 4-7 real names)
7. triggers     – Specific moments that make someone urgently need this product (array of strings)

IMPORTANT: For alternatives, return REAL product/brand names only — not generic descriptions.

Return format:
{
  "productName":  "...",
  "category":     "...",
  "problem":      "...",
  "audience":     "...",
  "pains":        ["...", "...", "...", "...", "..."],
  "alternatives": ["RealName1", "RealName2", "RealName3", "RealName4"],
  "triggers":     ["...", "..."]
}

Product description:
${description}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return IntelligenceSchema.parse(JSON.parse(raw) as unknown);
}

// ── Step 2: Generate search queries (REDUCED for credit efficiency) ─────────

async function generateQueries(
  intelligence: ProductIntelligence,
): Promise<{ redditGlobal: string[]; redditSubreddit: string[]; hackernews: string[]; linkedin: string[] }> {
  const response = await openaiClient.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert at finding potential customers on Reddit, Hacker News, and LinkedIn. You generate search queries that return HIGHLY RELEVANT results. Respond with a single valid JSON object only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: `Based on this product intelligence, generate search queries to find potential leads.

Product Intelligence:
- Product name: ${intelligence.productName}
- Category: ${intelligence.category}
- Problem: ${intelligence.problem}
- Audience: ${intelligence.audience}
- Pain points: ${intelligence.pains.join(", ")}
- Alternatives they use: ${intelligence.alternatives.join(", ")}
- Trigger moments: ${intelligence.triggers.join(", ")}

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES (follow exactly):
═══════════════════════════════════════════════════════════════════════

1. SIMPLE KEYWORDS WIN — short queries get better results
   ✅ "${intelligence.category}"
   ❌ "recommendations for ${intelligence.category}"

2. NEVER use generic prefixes like "recommendations for...", "comparison of...", "best practices for..."

3. Include competitor names as STANDALONE queries:
   ${intelligence.alternatives
     .slice(0, 2)
     .map((a) => `✅ "${a}" (standalone)`)
     .join("\n   ")}
   ${intelligence.alternatives
     .slice(0, 2)
     .map((a) => `✅ "${a} alternative"`)
     .join("\n   ")}

4. Every query must be 1-5 words (shorter = better match rate)

═══════════════════════════════════════════════════════════════════════
QUERY STRUCTURE:
═══════════════════════════════════════════════════════════════════════

redditGlobal (6 queries — used for Reddit-wide search, 1 API hit each):
- 2x: Direct product queries ("[category] app", "[category]")
- 2x: Competitor names + "[competitor] alternative"
- 2x: Natural pain phrases ("can't find [x]", "need [x]")

redditSubreddit (4 queries — used inside specific subreddits, 1 API hit each):
- 2x: Broader category/pain terms that work well within niche subreddits
- 2x: Competitor names as standalone (subreddit context makes them specific)

Hacker News queries (5 total — free, no credit cost):
- 2x: Direct queries ("[category]", "[category] startup")
- 2x: Competitor names as standalone
- 1x: Industry term ("[category] market" or "building [category]")

LinkedIn queries (2 total — used for LinkedIn post search to find buyers):
- These must be BUYER-INTENT phrases that a potential customer would write in a LinkedIn post
- Focus on pain points, switching decisions, or requests for tool recommendations
- Examples: "looking for [category] tool", "switched from [competitor]"
- Keep each query 2-5 words, natural language that matches how professionals write on LinkedIn

═══════════════════════════════════════════════════════════════════════

Return exactly:
{
  "redditGlobal": [ /* 6 queries, each 1-5 words */ ],
  "redditSubreddit": [ /* 4 queries, each 1-4 words */ ],
  "hackernews": [ /* 5 queries, each 1-4 words */ ],
  "linkedin": [ /* exactly 2 buyer-intent queries, each 2-5 words */ ]
}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return QueriesSchema.parse(JSON.parse(raw) as unknown);
}

// ── Step 3: Suggest target subreddits (reduced to 5-8) ──────────────────────

async function suggestSubreddits(
  intelligence: ProductIntelligence,
): Promise<string[]> {
  const response = await openaiClient.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Reddit researcher. Respond with a single valid JSON object only. No markdown, no explanation.",
      },
      {
        role: "user",
        content: `Suggest the best subreddits to find people who would buy or switch to: ${intelligence.productName} (${intelligence.category})

Target audience: ${intelligence.audience}
Competitors they use: ${intelligence.alternatives.join(", ")}

RULES:
1. Return 5-8 subreddit names WITHOUT the r/ prefix
2. Mix of BROAD (e.g. entrepreneur) AND NICHE ones
3. Prioritize subreddits where people post "looking for X", "recommend X"
4. Real, active subreddits only
5. NO meme, news, or generic subreddits

Return:
{
  "subreddits": ["name1", "name2", ...]
}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return SubredditsSchema.parse(JSON.parse(raw) as unknown).subreddits;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateKeywords(
  description: string,
): Promise<KeywordEngineResult> {
  const intelligence = await extractIntelligence(description);
  const [rawQueries, rawSubreddits] = await Promise.all([
    generateQueries(intelligence),
    suggestSubreddits(intelligence),
  ]);

  const queries = {
    redditGlobal:    filterQueries(rawQueries.redditGlobal),
    redditSubreddit: filterQueries(rawQueries.redditSubreddit),
    hackernews:      filterQueries(rawQueries.hackernews),
    linkedin:        filterQueries(rawQueries.linkedin).slice(0, 2),
  };
  const subreddits = filterSubreddits(rawSubreddits);

  return { intelligence, queries, subreddits };
}
