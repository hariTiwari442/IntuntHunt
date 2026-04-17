import { describe, it, expect } from 'vitest';
import { computeBackoffDelay } from '../../../src/utils/retry.js';

describe('computeBackoffDelay', () => {
  it('returns 5s for attempt 0', () => {
    expect(computeBackoffDelay(0)).toBe(5_000);
  });

  it('doubles with each attempt', () => {
    expect(computeBackoffDelay(1)).toBe(10_000);
    expect(computeBackoffDelay(2)).toBe(20_000);
    expect(computeBackoffDelay(3)).toBe(40_000);
  });

  it('caps at 5 minutes', () => {
    expect(computeBackoffDelay(10)).toBe(300_000);
    expect(computeBackoffDelay(100)).toBe(300_000);
  });
});
