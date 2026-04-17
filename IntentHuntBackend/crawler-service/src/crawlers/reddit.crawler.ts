import { BaseCrawler } from './base.crawler.js';
import { redditCircuitBreaker } from './circuit-breaker.js';
import { env } from '../config/env.js';
import type {
  NormalizedPost,
  SCRedditSearchResponse,
  SCRedditPost,
  SCSubredditSearchResponse,
  SCSubredditSearchPost,
} from '../types/crawler.types.js';

const SC_BASE = env.SCRAPECREATORS_BASE_URL ?? 'https://api.scrapecreators.com/v1/reddit';

export class RedditCrawler extends BaseCrawler {
  protected readonly source = 'reddit' as const;

  async fetch(keyword: string, subreddit?: string | null): Promise<NormalizedPost[]> {
    return redditCircuitBreaker.execute(async () => {
      if (subreddit) {
        return this.searchSubreddit(keyword, subreddit);
      }
      return this.globalSearch(keyword);
    });
  }

  /** Global Reddit search via ScrapeCreators /v1/reddit/search */
  private async globalSearch(keyword: string): Promise<NormalizedPost[]> {
    const params = new URLSearchParams({
      query:     keyword,
      sort:      'relevance',
      timeframe: 'month',
    });

    const data = await this.scRequest<SCRedditSearchResponse>(
      `${SC_BASE}/search?${params.toString()}`,
    );

    if (!data.success || !data.posts) return [];

    const posts = data.posts.map((post) => this.normalizeGlobal(post, keyword));
    return this.filterRelevant(posts, keyword);
  }

  /** Subreddit-scoped search via ScrapeCreators /v1/reddit/subreddit/search */
  private async searchSubreddit(keyword: string, subreddit: string): Promise<NormalizedPost[]> {
    const params = new URLSearchParams({
      subreddit,
      query:     keyword,
      sort:      'relevance',
      timeframe: 'month',
    });

    const data = await this.scRequest<SCSubredditSearchResponse>(
      `${SC_BASE}/subreddit/search?${params.toString()}`,
    );

    if (!data.success || !data.posts) return [];

    const posts = data.posts.map((post) => this.normalizeSubreddit(post, keyword));
    return this.filterRelevant(posts, keyword);
  }

  /** Make authenticated request to ScrapeCreators */
  private async scRequest<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const { fetch } = await import('undici');
      const response = await fetch(url, {
        signal: controller.signal as AbortSignal,
        headers: {
          'x-api-key': env.SCRAPECREATORS_API_KEY,
          'Accept':    'application/json',
        },
      });

      if (!response.ok) {
        const { classifyHttpError } = await import('../utils/errors.js');
        throw classifyHttpError(response.status, 'reddit', `ScrapeCreators HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeDate(post: { created_utc?: number; created_at_iso?: string; created_at?: string }): Date | null {
    if (post.created_utc) return new Date(post.created_utc * 1000);
    const iso = post.created_at_iso ?? post.created_at;
    if (iso) { const d = new Date(iso); return isNaN(d.getTime()) ? null : d; }
    return null;
  }

  private normalizeGlobal(post: SCRedditPost, keyword: string): NormalizedPost {
    return {
      source:       'reddit',
      externalId:   post.id,
      keyword,
      title:        post.title,
      content:      post.selftext ?? null,
      author:       `u/${post.author}`,
      url:          post.url?.startsWith('http')
        ? post.url
        : `https://reddit.com${post.permalink ?? `/r/${post.subreddit}/comments/${post.id}`}`,
      score:        post.score ?? post.ups,
      commentCount: post.num_comments,
      subreddit:    post.subreddit,
      postedAt:     this.safeDate(post),
      rawData:      post as unknown as Record<string, unknown>,
    };
  }

  private normalizeSubreddit(post: SCSubredditSearchPost, keyword: string): NormalizedPost {
    // Extract post ID from URL if available
    const idMatch = post.url?.match(/comments\/([a-z0-9]+)/);
    const externalId = post.id ?? idMatch?.[1] ?? `${post.subreddit}-${post.created_utc}`;

    return {
      source:       'reddit',
      externalId,
      keyword,
      title:        post.title,
      content:      post.selftext ?? null,
      author:       post.author ? `u/${post.author}` : null,
      url:          post.url?.startsWith('http') ? post.url : `https://reddit.com${post.url}`,
      score:        post.ups,
      commentCount: post.num_comments,
      subreddit:    post.subreddit,
      postedAt:     this.safeDate(post as any),
      rawData:      post as unknown as Record<string, unknown>,
    };
  }
}
