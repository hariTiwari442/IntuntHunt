/**
 * Parse and validate URLs returned by Google search.
 *
 * Google's `site:` queries sometimes return:
 *   - Actual posts (good — keep)
 *   - User profiles, subreddit homepages, company pages (drop — not leads)
 *   - Wiki pages, help docs (drop — not leads)
 *
 * For each platform, we keep only URLs that look like a post a person wrote.
 */

import type { Platform } from "../pipeline/types.js";

interface ParsedUrl {
  platform:  Platform;
  isValid:   boolean;
  subreddit?: string;
  postId?:   string;
}

const REDDIT_POST_RE   = /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)/i;
const LINKEDIN_POST_RE = /^https?:\/\/(?:www\.)?linkedin\.com\/(?:posts|pulse)\//i;
// Twitter tweets: twitter.com/<user>/status/<id>  or  x.com/<user>/status/<id>
const TWITTER_POST_RE  = /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/(\d+)/i;

export function parseUrl(url: string): ParsedUrl | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    // ── Reddit ───────────────────────────────────────────
    if (host === "reddit.com" || host === "old.reddit.com" || host === "new.reddit.com") {
      const match = url.match(REDDIT_POST_RE);
      if (match) {
        return {
          platform:  "reddit",
          isValid:   true,
          subreddit: match[1],
          postId:    match[2],
        };
      }
      // Reddit URL but not a post (profile, sub homepage, wiki, etc.) — drop
      return { platform: "reddit", isValid: false };
    }

    // ── LinkedIn ─────────────────────────────────────────
    if (host === "linkedin.com") {
      if (LINKEDIN_POST_RE.test(url)) {
        return { platform: "linkedin", isValid: true };
      }
      return { platform: "linkedin", isValid: false };
    }

    // ── Twitter / X ──────────────────────────────────────
    if (host === "twitter.com" || host === "x.com") {
      const match = url.match(TWITTER_POST_RE);
      if (match) {
        return {
          platform: "twitter",
          isValid:  true,
          postId:   match[1],
        };
      }
      // Twitter URL but not a tweet (profile, lists, search) — drop
      return { platform: "twitter", isValid: false };
    }

    return null; // unknown platform
  } catch {
    return null;
  }
}
