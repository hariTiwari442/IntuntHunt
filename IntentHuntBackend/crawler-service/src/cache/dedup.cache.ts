import type Redis from 'ioredis';
import type { SourceType } from '../types/job.types.js';
import type { NormalizedPost } from '../types/crawler.types.js';

const CACHE_TTL_SECONDS = 3600;  // 1 hour

/**
 * Redis-backed dedup cache.
 * Prevents re-crawling the same keyword+source combination within TTL window.
 * Scoped per keyword — NOT globally — so the same post can appear for different users.
 *
 * Cache key: "dedup:{source}:{normalized-keyword}"
 * Value: JSON array of external IDs already seen for this keyword+source
 */
export class DedupCache {
  constructor(private readonly redis: Redis) {}

  private buildKey(source: SourceType, keyword: string): string {
    const normalized = keyword.toLowerCase().trim().replace(/\s+/g, '-');
    return `dedup:${source}:${normalized}`;
  }

  /** Returns true if this keyword+source was crawled recently (within TTL) */
  async isRecent(source: SourceType, keyword: string): Promise<boolean> {
    const key = this.buildKey(source, keyword);
    return (await this.redis.exists(key)) === 1;
  }

  /** Records that we crawled this keyword+source, stores seen external IDs */
  async markCrawled(source: SourceType, keyword: string, externalIds: string[]): Promise<void> {
    const key = this.buildKey(source, keyword);
    await this.redis
      .multi()
      .set(key, JSON.stringify(externalIds))
      .expire(key, CACHE_TTL_SECONDS)
      .exec();
  }

  /**
   * Filters posts to only those not already seen in the Redis cache.
   * On a cache miss, all posts pass through.
   */
  async filterNew(source: SourceType, keyword: string, posts: NormalizedPost[]): Promise<NormalizedPost[]> {
    const key = this.buildKey(source, keyword);
    const cached = await this.redis.get(key);
    if (!cached) return posts;

    const seenIds = new Set<string>(JSON.parse(cached) as string[]);
    return posts.filter((p) => !seenIds.has(p.externalId));
  }
}
