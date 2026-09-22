/**
 * ScrapeCreators content fetcher.
 * ──────────────────────────────
 * Used by Step 4 to fetch full post content + top comments for a single URL.
 * Reuses the round-robin key pool (sc-keys.ts) so we can run multiple accounts
 * and auto-rotate when one hits its quota.
 *
 * Platform endpoints:
 *   Reddit:   /v1/reddit/post/comments?url=...&trim=true
 *   LinkedIn: /v1/linkedin/post?url=...&trim=true
 *   Twitter:  /v1/twitter/tweet?url=...&trim=true
 *             (no replies in this response — a separate "Comments" endpoint
 *             exists for that, not wired up here; topComments is always [])
 */

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { nextKey, markDead, poolSize } from "../crawlers/sc-keys.js";
import type { Platform, RawLead } from "../pipeline/types.js";

const DEFAULT_BASE = "https://api.scrapecreators.com";

// ── Raw response shapes (defensive — fields may be missing) ─────────────────

interface ScRedditResponse {
  post?: {
    id?:           string;
    title?:        string;
    selftext?:     string;
    author?:       string;
    subreddit?:    string;
    score?:        number;
    ups?:          number;
    num_comments?: number;
    created_utc?: number;
    created_at?:  string;
    url?:         string;
    permalink?:   string;
  };
  comments?: Array<{
    body?:   string;
    author?: string;
    score?:  number;
  }>;
}

/**
 * Real shape of GET /v1/linkedin/post?trim=true, confirmed against a live
 * response on 2026-09-22:
 *
 *   success, credits_remaining, credits_charged, url, datePublished,
 *   description, media, images, image, author, comments, likeCount,
 *   commentCount
 *
 * The body is `description` at the root — there is no `post` wrapper and no
 * `post.text`. The previously declared shape was a guess that matched none
 * of it, so every field read back undefined and every LinkedIn lead was
 * stored with empty content.
 *
 * The legacy `post.*` fields are kept as optional fallbacks: they cost
 * nothing, and if the vendor ever returns that shape we degrade instead of
 * silently emptying the content again.
 */
interface ScLinkedInResponse {
  // Confirmed root shape.
  description?:   string;
  datePublished?: string;
  likeCount?:     number;
  commentCount?:  number;
  comments?:      Array<{ text?: string }>;
  author?:        { name?: string; url?: string; profile_url?: string };

  // Legacy / alternative shapes, tried only if the above are absent.
  post?: {
    text?:      string;
    author?:    { name?: string; profile_url?: string };
    stats?:     { total_reactions?: number; comments?: number };
    posted_at?: { date?: string; timestamp?: number };
  };
  text?:      string;
  stats?:     { total_reactions?: number; comments?: number };
  posted_at?: { date?: string; timestamp?: number };
}

interface ScTwitterResponse {
  legacy?: {
    full_text?:      string;
    created_at?:     string;
    favorite_count?: number;
    reply_count?:    number;
    retweet_count?:  number;
    quote_count?:    number;
  };
  core?: {
    user_results?: {
      result?: {
        legacy?: {
          screen_name?: string;
        };
      };
    };
  };
}

// ── Generic GET with key rotation ───────────────────────────────────────────

async function scGet<T>(path: string, queryParams: Record<string, string>): Promise<T> {
  const base = env.SCRAPECREATORS_BASE_URL ?? DEFAULT_BASE;
  const qs = new URLSearchParams(queryParams).toString();
  const url = `${base}${path}?${qs}`;

  const maxAttempts = Math.max(poolSize(), 1);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pick = nextKey();
    if (!pick) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(url, {
        headers: {
          "x-api-key": pick.key,
          Accept:      "application/json",
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Permanent quota/auth errors → mark this key dead so no future request
      // (this one or any other) picks it again, then move on to the next key.
      if (response.status === 402 || response.status === 403) {
        markDead(pick.index, `HTTP ${response.status}`);
        lastError = new Error(`ScrapeCreators HTTP ${response.status} on key #${pick.index}`);
        continue;
      }

      // Rate limit — this key is probably still fine, just try the next one
      // for this request instead of retiring it.
      if (response.status === 429) {
        logger.warn({ keyIndex: pick.index }, "[scrapecreators] 429, trying next key");
        lastError = new Error("ScrapeCreators rate-limited");
        continue;
      }

      // Any other HTTP error (500, 404, malformed response, etc.) — could be
      // this key, could be the URL, could be a blip on ScrapeCreators' side.
      // Don't mark the key dead (we don't know it's the key's fault), but do
      // try the next key before giving up on the whole request.
      const text = await response.text().catch(() => "");
      lastError = new Error(`ScrapeCreators HTTP ${response.status}: ${text.slice(0, 200)}`);
      logger.warn({ keyIndex: pick.index, status: response.status, path }, "[scrapecreators] request failed, trying next key");
      continue;
    } catch (err) {
      // Network-level failure (timeout, DNS, connection reset, etc.) — same
      // deal, try the next key rather than failing the whole request on one
      // bad connection attempt.
      if (lastError === null) lastError = err;
      logger.warn({ err, keyIndex: pick.index, path }, "[scrapecreators] request errored, trying next key");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("All ScrapeCreators keys exhausted or dead");
}

// ── Reddit fetcher ──────────────────────────────────────────────────────────

async function fetchRedditPost(url: string): Promise<Omit<RawLead, "preScore" | "googleSnippet" | "querySource">> {
  const data = await scGet<ScRedditResponse>("/v1/reddit/post/comments", { url, trim: "true" });
  const post = data.post ?? {};

  // Derive subreddit from path
  const subMatch = url.match(/\/r\/([A-Za-z0-9_]+)/);
  const subreddit = subMatch?.[1] ?? post.subreddit;

  // Date parsing — Reddit sometimes returns ISO, sometimes Unix
  let postedAt: Date | null = null;
  if (post.created_utc) postedAt = new Date(post.created_utc * 1000);
  else if (post.created_at) {
    const d = new Date(post.created_at);
    if (!isNaN(d.getTime())) postedAt = d;
  }

  // Top comments — Reddit's `comments` array is usually sorted by score already
  const topComments = (data.comments ?? [])
    .filter((c) => c.body && c.body.length > 0)
    .slice(0, 5)
    .map((c) => c.body!.slice(0, 500));

  return {
    url,
    platform:     "reddit",
    ...(subreddit ? { subreddit } : {}),
    title:        post.title ?? "(no title)",
    content:      post.selftext ?? "",
    author:       post.author ?? null,
    postScore:    post.score ?? post.ups ?? 0,
    commentCount: post.num_comments ?? 0,
    postedAt,
    topComments,
  };
}

// ── LinkedIn fetcher ────────────────────────────────────────────────────────

async function fetchLinkedInPost(url: string): Promise<Omit<RawLead, "preScore" | "googleSnippet" | "querySource">> {
  const data = await scGet<ScLinkedInResponse>("/v1/linkedin/post", { url, trim: "true" });
  const legacy = data.post ?? {};

  // `description` first — that's where the body actually is.
  const text =
    (typeof data.description === "string" && data.description) ||
    (typeof legacy.text === "string" && legacy.text) ||
    (typeof data.text === "string" && data.text) ||
    "";

  // Widened explicitly: the root author carries `url`, the legacy one
  // `profile_url`, and the union of the two narrows to neither.
  const author: { name?: string; url?: string; profile_url?: string } | null =
    data.author ?? legacy.author ?? null;
  const profileUrl = author?.profile_url ?? author?.url ?? null;

  let postedAt: Date | null = null;
  const rawDate = data.datePublished ?? legacy.posted_at?.date ?? data.posted_at?.date;
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) postedAt = d;
  }

  // Comments DO come back, contrary to the old comment here claiming they
  // don't — they were simply never read.
  const topComments = (data.comments ?? [])
    .map((c) => (typeof c?.text === "string" ? c.text.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);

  return {
    url,
    platform:     "linkedin",
    // LinkedIn posts have no title, so the opening line stands in for one —
    // trimmed at a word boundary rather than mid-word.
    title:        text.slice(0, 200).replace(/\s+\S*$/, "") || "(no title)",
    content:      text,
    author:       author?.name ?? null,
    ...(profileUrl ? { authorProfileUrl: profileUrl } : {}),
    postScore:    data.likeCount ?? legacy.stats?.total_reactions ?? data.stats?.total_reactions ?? 0,
    commentCount: data.commentCount ?? legacy.stats?.comments ?? data.stats?.comments ?? 0,
    postedAt,
    topComments,
  };
}

// ── Twitter fetcher ─────────────────────────────────────────────────────────

async function fetchTwitterPost(url: string): Promise<Omit<RawLead, "preScore" | "googleSnippet" | "querySource">> {
  const data = await scGet<ScTwitterResponse>("/v1/twitter/tweet", { url, trim: "true" });
  const legacy = data.legacy ?? {};
  const screenName = data.core?.user_results?.result?.legacy?.screen_name;

  let postedAt: Date | null = null;
  if (legacy.created_at) {
    const d = new Date(legacy.created_at);
    if (!isNaN(d.getTime())) postedAt = d;
  }

  const text = legacy.full_text ?? "";

  return {
    url,
    platform:     "twitter",
    title:        text.slice(0, 200) || "(no title)",
    content:      text,
    author:       screenName ? `@${screenName}` : null,
    postScore:    legacy.favorite_count ?? 0,
    commentCount: legacy.reply_count ?? 0,
    postedAt,
    topComments:  [], // tweet-details response has no replies; separate endpoint would be needed
  };
}

// ── Public dispatch ─────────────────────────────────────────────────────────

/**
 * Fetch full post content for a single URL. Returns a partial RawLead — the
 * caller stitches in preScore + googleSnippet + querySource from prior steps.
 */
export async function fetchPost(
  url: string,
  platform: Platform,
): Promise<Omit<RawLead, "preScore" | "googleSnippet" | "querySource">> {
  if (platform === "reddit")   return fetchRedditPost(url);
  if (platform === "linkedin") return fetchLinkedInPost(url);
  if (platform === "twitter")  return fetchTwitterPost(url);
  throw new Error(`Unsupported platform: ${platform}`);
}
