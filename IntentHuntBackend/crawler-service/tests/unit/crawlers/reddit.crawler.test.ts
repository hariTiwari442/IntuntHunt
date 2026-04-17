import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedditCrawler } from '../../../src/crawlers/reddit.crawler.js';
import type { RedditSearchResponse } from '../../../src/types/crawler.types.js';

// Mock circuit breaker — pass-through in unit tests
vi.mock('../../../src/crawlers/circuit-breaker.js', () => ({
  redditCircuitBreaker: { execute: (fn: () => unknown) => fn() },
  hnCircuitBreaker:     { execute: (fn: () => unknown) => fn() },
}));

// Mock BaseCrawler.request so we don't hit the network
vi.mock('../../../src/crawlers/base.crawler.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/crawlers/base.crawler.js')>();
  return {
    BaseCrawler: class extends actual.BaseCrawler {
      protected source = 'reddit' as const;
      fetch(_keyword: string) { return Promise.resolve([]); }
      // expose request as mockable
      override async request<T>(url: string): Promise<T> {
        return (this as any)._mockRequest(url);
      }
    },
  };
});

const FIXTURE: RedditSearchResponse = {
  data: {
    after: null,
    children: [
      {
        data: {
          id:           'abc123',
          title:        'Looking for a CRM for my startup',
          selftext:     'We are 3 founders and need something simple.',
          author:       'startup_hari',
          subreddit:    'startups',
          score:        42,
          num_comments: 15,
          permalink:    '/r/startups/comments/abc123/looking_for_a_crm/',
          url:          'https://www.reddit.com/r/startups/comments/abc123/',
          created_utc:  1710000000,
          is_self:      true,
        },
      },
    ],
  },
};

describe('RedditCrawler — normalize()', () => {
  it('maps a Reddit post to NormalizedPost shape', async () => {
    const crawler = new RedditCrawler();
    // Directly test the private normalize method via fetch mocking
    // We stub request to return fixture data
    (crawler as any).request = vi.fn().mockResolvedValue(FIXTURE);
    // Also stub circuit breaker execute to pass-through
    const posts = await crawler.fetch('crm for startup');

    expect(posts).toHaveLength(1);
    const post = posts[0]!;

    expect(post.source).toBe('reddit');
    expect(post.externalId).toBe('abc123');
    expect(post.keyword).toBe('crm for startup');
    expect(post.title).toBe('Looking for a CRM for my startup');
    expect(post.author).toBe('u/startup_hari');
    expect(post.url).toBe('https://reddit.com/r/startups/comments/abc123/looking_for_a_crm/');
    expect(post.score).toBe(42);
    expect(post.commentCount).toBe(15);
    expect(post.subreddit).toBe('startups');
    expect(post.postedAt).toBeInstanceOf(Date);
    expect(post.postedAt!.getTime()).toBe(1710000000 * 1000);
    expect(post.rawData).toBeDefined();
  });

  it('filters out self-posts with no meaningful content', async () => {
    const shallow: RedditSearchResponse = {
      data: {
        after: null,
        children: [
          { data: { ...FIXTURE.data.children[0]!.data, selftext: 'short', is_self: true } },
        ],
      },
    };

    const crawler = new RedditCrawler();
    (crawler as any).request = vi.fn().mockResolvedValue(shallow);

    const posts = await crawler.fetch('crm');
    expect(posts).toHaveLength(0);
  });
});
