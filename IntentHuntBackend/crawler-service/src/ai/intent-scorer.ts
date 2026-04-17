import OpenAI from 'openai';
import { env } from '../config/env.js';
import type { NormalizedPost } from '../types/crawler.types.js';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey:  env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});

const BATCH_SIZE = 10;
const MODEL      = 'gpt-4o-mini';
const REPLY_THRESHOLD = env.REPLY_INTENT_THRESHOLD;

const VALID_STRATEGIES = new Set([
  'Reply to the post',
  'Join the discussion',
  'Target the commenters',
  'Share as a resource',
  'DM the author',
]);

interface ScoredPost extends NormalizedPost {
  intentScore:    number;       // 0-100
  suggestedReply: string | null;
  strategy:       string | null;
}

/**
 * Step 1: Scores each post's buying intent (0-100) + assigns a strategy tag.
 * Step 2: Only generates suggested replies for posts >= REPLY_THRESHOLD.
 * This minimises OpenAI API calls by skipping replies for low-intent posts.
 */
export async function scorePostIntents(
  posts:       NormalizedPost[],
  keyword:     string,
  productName?: string,
): Promise<ScoredPost[]> {
  if (posts.length === 0) return [];

  // Step 1 — score all posts + assign strategy
  const scoredBatches: ScoredPost[] = [];
  for (const batch of chunk(posts, BATCH_SIZE)) {
    const scored = await scoreBatch(batch, keyword, productName);
    scoredBatches.push(...scored);
  }

  // Step 2 — generate replies only for high-intent posts
  const highIntent = scoredBatches.filter(p => p.intentScore >= REPLY_THRESHOLD);

  logger.info(
    { total: scoredBatches.length, highIntent: highIntent.length, threshold: REPLY_THRESHOLD },
    'Generating replies for high-intent posts only',
  );

  const withReplies: ScoredPost[] = [];
  for (const batch of chunk(highIntent, BATCH_SIZE)) {
    const replied = await generateRepliesBatch(batch, keyword, productName);
    withReplies.push(...replied);
  }

  // Merge back — preserve original order
  const replyMap = new Map(withReplies.map(p => [p.externalId, p.suggestedReply]));
  return scoredBatches.map(p => ({
    ...p,
    suggestedReply: replyMap.get(p.externalId) ?? null,
  }));
}

// Step 1 — score + strategy, no reply generation
async function scoreBatch(
  posts:       NormalizedPost[],
  keyword:     string,
  productName?: string,
): Promise<ScoredPost[]> {
  const items = posts.map((p, i) => ({
    index:        i,
    title:        p.title,
    content:      (p.content ?? '').slice(0, 300),
    source:       p.source,
    commentCount: p.commentCount ?? 0,
  }));

  const productContext = productName ? `\nProduct being promoted: "${productName}"` : '';

  const prompt = `You are an expert at detecting buying intent in social media posts.

Keyword being searched: "${keyword}"${productContext}

SCORE each post (0-100) for BUYING INTENT:
90-100 = Actively asking for purchase recommendation RIGHT NOW ("looking for X", "which should I buy", "ready to switch")
70-89  = Clear frustration with current tool + seeking alternatives ("tired of X", "X is too expensive", competitor complaint)
50-69  = Researching options, comparing tools (not urgent but interested)
30-49  = General discussion about the category, mild interest
10-29  = Tangentially related, mostly informational
0-9    = Not relevant, venting without seeking solution, spam

STRATEGY — pick exactly one per post:
- "Reply to the post" — author is directly asking for a tool/solution (high intent, low comments)
- "Join the discussion" — active thread with many comments sharing experiences (high comments, good intent)
- "Target the commenters" — post itself isn't buying-intent but comments likely have people asking for alternatives
- "Share as a resource" — someone is writing a guide/list and the product fits as a mention
- "DM the author" — very specific post where a public reply might feel too salesy (especially LinkedIn)

Use source, commentCount, and content to decide. For LinkedIn posts, prefer "DM the author" for high-intent. For low-intent posts, prefer "Share as a resource" or "Target the commenters".

Posts:
${JSON.stringify(items, null, 2)}

Return exactly:
{
  "results": [
    { "score": 85, "strategy": "Reply to the post" },
    { "score": 15, "strategy": "Target the commenters" },
    ...
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model:           MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a buying intent analyst. Return valid JSON only.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.3,
    });

    const raw     = response.choices[0]?.message?.content ?? '{}';
    const parsed  = JSON.parse(raw) as { results?: Array<{ score?: number; strategy?: string }> };
    const results = parsed.results;

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error(`Expected ${posts.length} results, got ${results?.length ?? 0}`);
    }

    return posts.map((post, i) => {
      const strategy = results[i]?.strategy ?? null;
      return {
        ...post,
        intentScore:    Math.min(100, Math.max(0, Number(results[i]?.score) || 0)),
        suggestedReply: null,
        strategy:       strategy && VALID_STRATEGIES.has(strategy) ? strategy : null,
      };
    });
  } catch (err) {
    logger.warn({ err, keyword }, 'Intent scoring failed — defaulting to 0');
    return posts.map(post => ({ ...post, intentScore: 0, suggestedReply: null, strategy: null }));
  }
}

// Step 2 — generate replies only for high-intent posts
async function generateRepliesBatch(
  posts:        ScoredPost[],
  keyword:      string,
  productName?: string,
): Promise<ScoredPost[]> {
  const items = posts.map((p, i) => ({
    index:   i,
    title:   p.title,
    content: (p.content ?? '').slice(0, 300),
    source:  p.source,
    score:   p.intentScore,
  }));

  const productContext = productName ? `\nProduct being promoted: "${productName}"` : '';

  const prompt = `You are an expert at crafting helpful, non-spammy replies that subtly promote a product.

Keyword being searched: "${keyword}"${productContext}

Generate a SUGGESTED REPLY for each post:
- Lead with GENUINE VALUE first — answer their question, empathize with their pain, share a useful tip
- Mention the product naturally at the end, NOT as the main focus ("I've been using X for this and it helped")
- Match the tone of the platform (casual for Reddit, technical for HN)
- Keep it 2-4 sentences max
- NEVER sound like an ad or shill — no "Check out X!", no "X is the best!", no marketing language
- Use first person ("I found", "I switched to", "I've been using")

Posts:
${JSON.stringify(items, null, 2)}

Return exactly:
{
  "results": [
    { "reply": "I had the same issue with..." },
    ...
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model:           MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a community engagement expert. Return valid JSON only.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.7,
    });

    const raw     = response.choices[0]?.message?.content ?? '{}';
    const parsed  = JSON.parse(raw) as { results?: Array<{ reply?: string | null }> };
    const results = parsed.results;

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error(`Expected ${posts.length} reply results, got ${results?.length ?? 0}`);
    }

    return posts.map((post, i) => ({
      ...post,
      suggestedReply: results[i]?.reply ?? null,
    }));
  } catch (err) {
    logger.warn({ err, keyword }, 'Reply generation failed — skipping replies');
    return posts.map(post => ({ ...post, suggestedReply: null }));
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
