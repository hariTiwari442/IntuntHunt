import { describe, it, expect, vi } from 'vitest';
import { HNCrawler } from '../../../src/crawlers/hn.crawler.js';
import type { HNSearchResponse } from '../../../src/types/crawler.types.js';

vi.mock('../../../src/crawlers/circuit-breaker.js', () => ({
  redditCircuitBreaker: { execute: (fn: () => unknown) => fn() },
  hnCircuitBreaker:     { execute: (fn: () => unknown) => fn() },
}));

const FIXTURE: HNSearchResponse = {
  hits: [
    {
      objectID:     'hn_001',
      title:        'Ask HN: Best open-source CRM?',
      story_text:   'Looking for recommendations for a lightweight CRM.',
      author:       'indiefounder',
      points:       87,
      num_comments: 34,
      url:          null,
      created_at:   '2026-03-18T14:22:00.000Z',
      _tags:        ['story', 'author_indiefounder'],
    },
  ],
  nbHits:      1,
  page:        0,
  nbPages:     1,
  hitsPerPage: 25,
};

describe('HNCrawler — normalize()', () => {
  it('maps an HN hit to NormalizedPost shape', async () => {
    const crawler = new HNCrawler();
    (crawler as any).request = vi.fn().mockResolvedValue(FIXTURE);

    const posts = await crawler.fetch('open source crm');

    expect(posts).toHaveLength(1);
    const post = posts[0]!;

    expect(post.source).toBe('hackernews');
    expect(post.externalId).toBe('hn_001');
    expect(post.keyword).toBe('open source crm');
    expect(post.title).toBe('Ask HN: Best open-source CRM?');
    expect(post.author).toBe('indiefounder');
    expect(post.score).toBe(87);
    expect(post.commentCount).toBe(34);
    expect(post.subreddit).toBeNull();
    // url is null in fixture so should fall back to HN item URL
    expect(post.url).toContain('news.ycombinator.com/item?id=hn_001');
    expect(post.postedAt).toBeInstanceOf(Date);
    expect(post.postedAt!.toISOString()).toBe('2026-03-18T14:22:00.000Z');
  });
});
