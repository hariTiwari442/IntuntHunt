import { ApifyClient } from 'apify-client';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { NormalizedPost } from '../types/crawler.types.js';

const ACTOR_ID  = '5QnEH5N71IK2mFLrP';
const MAX_POSTS = 50;

interface ApifyLinkedInPost {
  activity_id?: string;
  full_urn?:    string;
  post_url?:    string;
  text?:        string;
  author?: {
    name?:    string;
    headline?: string;
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
  [key: string]: unknown;
}

export class LinkedInCrawler {
  readonly source = 'linkedin' as const;
  private client: ApifyClient;
  private mockBaseUrl: string | undefined;

  constructor() {
    this.client = new ApifyClient({ token: env.APIFY_API_KEY });
    this.mockBaseUrl = env.APIFY_BASE_URL;
  }

  async fetch(keyword: string): Promise<NormalizedPost[]> {
    logger.info({ keyword }, 'LinkedIn crawl starting');

    try {
      let items: unknown[];

      if (this.mockBaseUrl) {
        // Mock mode — hit local mock server directly
        const runRes = await fetch(`${this.mockBaseUrl}/v2/acts/${ACTOR_ID}/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keyword, sort_type: 'relevance', page_number: 1, date_filter: '', limit: MAX_POSTS }),
        });
        const run = await runRes.json() as { defaultDatasetId: string };

        const dataRes = await fetch(`${this.mockBaseUrl}/v2/datasets/${run.defaultDatasetId}/items`);
        items = await dataRes.json() as unknown[];
      } else {
        // Real Apify
        const run = await this.client.actor(ACTOR_ID).call({
          keyword,
          sort_type:   'relevance',
          page_number: 1,
          date_filter: '',
          limit:       MAX_POSTS,
        });

        const dataset = await this.client
          .dataset(run.defaultDatasetId)
          .listItems();
        items = dataset.items;
      }

      const posts = (items as ApifyLinkedInPost[])
        .map(item => this.normalize(item, keyword))
        .filter((p): p is NormalizedPost => p !== null);

      logger.info({ keyword, count: posts.length }, 'LinkedIn crawl complete');
      return posts;
    } catch (err) {
      logger.warn({ err, keyword }, 'LinkedIn crawl failed');
      return [];
    }
  }

  private normalize(item: ApifyLinkedInPost, keyword: string): NormalizedPost | null {
    const text = typeof item.text === 'string' ? item.text : '';
    if (!text) return null;

    const externalId = item.activity_id ?? item.full_urn ?? item.post_url ?? `li-${keyword}-${Date.now()}`;
    const postedRaw  = item.posted_at?.date;

    return {
      source:       'linkedin',
      externalId:   String(externalId),
      keyword,
      title:        text.slice(0, 200),
      content:      text.length > 200 ? text : null,
      author:       item.author?.name ?? null,
      url:          typeof item.post_url === 'string' ? item.post_url : null,
      score:        item.stats?.total_reactions ?? null,
      commentCount: item.stats?.comments ?? null,
      subreddit:    null,
      postedAt:     postedRaw ? this.safeDate(postedRaw) : null,
      rawData:      item as Record<string, unknown>,
    };
  }

  private safeDate(value: string): Date | null {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}
