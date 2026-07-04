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

interface ScLinkedInResponse {
  post?: {
    text?:         string;
    activity_id?:  string;
    full_urn?:     string;
    post_url?:     string;
    author?: {
      name?:        string;
      profile_url?: string;
    };
    stats?: {
      total_reactions?: number;
      comments?:        number;
    };
    posted_at?: {
      date?:      string;
      timestamp?: number;
    };
  };
  // Some endpoints flatten the post at root — handle both shapes
  text?:        string;
  activity_id?: string;
  post_url?:    string;
  author?:      { name?: string; profile_url?: string };
  stats?:       { total_reactions?: number; comments?: number };
  posted_at?:   { date?: string; timestamp?: number };
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

      // Permanent quota/auth errors → mark dead, try next key
      if (response.status === 402 || response.status === 403) {
        markDead(pick.index, `HTTP ${response.status}`);
        lastError = new Error(`ScrapeCreators HTTP ${response.status} on key #${pick.index}`);
        continue;
      }

      // Rate limit — try next key without killing this one (BullMQ retries handle longer waits)
      if (response.status === 429) {
        logger.warn({ keyIndex: pick.index }, "[scrapecreators] 429, trying next key");
        lastError = new Error("ScrapeCreators rate-limited");
        continue;
      }

      // Other errors — don't retry across keys
      const text = await response.text().catch(() => "");
      throw new Error(`ScrapeCreators HTTP ${response.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      if (lastError === null) lastError = err;
      logger.warn({ err, keyIndex: pick.index, path }, "[scrapecreators] request errored");
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

  // The response may have the post at root or nested under `post`. Try both.
  const post = data.post ?? data;

  const text = typeof post.text === "string" ? post.text : "";
  const author = post.author ?? null;

  let postedAt: Date | null = null;
  if (post.posted_at?.date) {
    const d = new Date(post.posted_at.date);
    if (!isNaN(d.getTime())) postedAt = d;
  }

  return {
    url,
    platform:                              "linkedin",
    title:                                 text.slice(0, 200) || "(no title)",
    content:                               text,
    author:                                author?.name ?? null,
    ...(author?.profile_url ? { authorProfileUrl: author.profile_url } : {}),
    postScore:                             post.stats?.total_reactions ?? 0,
    commentCount:                          post.stats?.comments ?? 0,
    postedAt,
    topComments:                           [],   // LinkedIn endpoint doesn't return comments in basic response
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
  throw new Error(`Unsupported platform: ${platform}`);
}
