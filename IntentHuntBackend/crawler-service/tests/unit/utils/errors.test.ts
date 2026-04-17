import { describe, it, expect } from 'vitest';
import { classifyHttpError, isRetryable, CrawlerError } from '../../../src/utils/errors.js';

describe('classifyHttpError', () => {
  it.each([429, 500, 502, 503, 504])('marks %i as retryable', (status) => {
    const err = classifyHttpError(status, 'reddit', `HTTP ${status}`);
    expect(err.retryable).toBe(true);
  });

  it.each([400, 401, 403, 404])('marks %i as non-retryable', (status) => {
    const err = classifyHttpError(status, 'reddit', `HTTP ${status}`);
    expect(err.retryable).toBe(false);
  });
});

describe('isRetryable', () => {
  it('returns true for retryable CrawlerError', () => {
    const err = new CrawlerError('rate limited', 429, true, 'reddit');
    expect(isRetryable(err)).toBe(true);
  });

  it('returns false for non-retryable CrawlerError', () => {
    const err = new CrawlerError('not found', 404, false, 'reddit');
    expect(isRetryable(err)).toBe(false);
  });

  it('returns true for AbortError (timeout)', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isRetryable(err)).toBe(true);
  });

  it('returns true for unknown errors (conservative)', () => {
    expect(isRetryable(new Error('unknown'))).toBe(true);
  });
});
