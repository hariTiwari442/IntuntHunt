import { fetch } from 'undici';
import type { NormalizedPost } from '../types/crawler.types.js';
import type { SourceType } from '../types/job.types.js';
import { classifyHttpError } from '../utils/errors.js';

const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'IntentHunt/1.0 (+https://intenthunt.com)';

// Common words that carry no meaning for relevance matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on',
  'at', 'by', 'is', 'it', 'its', 'as', 'be', 'do', 'if', 'up', 'so',
  'vs', 'via', 'how', 'what', 'best', 'tool', 'app', 'use', 'with',
  'from', 'that', 'this', 'are', 'was', 'has', 'have', 'not', 'any',
]);

export abstract class BaseCrawler {
  protected abstract readonly source: SourceType;

  abstract fetch(keyword: string, ...args: unknown[]): Promise<NormalizedPost[]>;

  /**
   * Drops posts where neither title nor content contains any significant word
   * from the keyword. Catches cases where quoted search still leaks through.
   */
  protected filterRelevant(posts: NormalizedPost[], keyword: string): NormalizedPost[] {
    const significantWords = keyword
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // If all words are stop words, skip filtering
    if (significantWords.length === 0) return posts;

    return posts.filter((post) => {
      const text = `${post.title} ${post.content ?? ''}`.toLowerCase();
      return significantWords.some((word) => text.includes(word));
    });
  }

  protected async request<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal as AbortSignal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept':     'application/json',
        },
      });

      if (!response.ok) {
        throw classifyHttpError(response.status, this.source, `HTTP ${response.status} from ${url}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}
