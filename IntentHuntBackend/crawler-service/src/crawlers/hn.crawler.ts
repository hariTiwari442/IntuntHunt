import { BaseCrawler } from './base.crawler.js';
import { hnCircuitBreaker } from './circuit-breaker.js';
import { env } from '../config/env.js';
import type { HNSearchResponse, NormalizedPost } from '../types/crawler.types.js';

const HN_BASE = env.HN_BASE_URL ?? 'https://hn.algolia.com/api/v1';

export class HNCrawler extends BaseCrawler {
  protected readonly source = 'hackernews' as const;

  async fetch(keyword: string): Promise<NormalizedPost[]> {
    return hnCircuitBreaker.execute(async () => {
      const query   = keyword.split(' ').length <= 3 ? `"${keyword}"` : keyword;
      const encoded = encodeURIComponent(query);
      const url = `${HN_BASE}/search?query=${encoded}&tags=story&hitsPerPage=25`;
      const data = await this.request<HNSearchResponse>(url);
      return this.filterRelevant(this.normalize(data, keyword), keyword);
    });
  }

  private normalize(data: HNSearchResponse, keyword: string): NormalizedPost[] {
    return data.hits.map((hit) => ({
      source:       'hackernews' as const,
      externalId:   hit.objectID,
      keyword,
      title:        hit.title,
      content:      hit.story_text ?? null,
      author:       hit.author,
      url:          `https://news.ycombinator.com/item?id=${hit.objectID}`,
      score:        hit.points,
      commentCount: hit.num_comments,
      subreddit:    null,
      postedAt:     new Date(hit.created_at),
      rawData:      hit as unknown as Record<string, unknown>,
    }));
  }
}
