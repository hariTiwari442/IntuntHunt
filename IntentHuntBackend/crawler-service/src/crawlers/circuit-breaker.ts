import { logger } from '../utils/logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;  // failures before opening (default: 5)
  successThreshold: number;  // successes in HALF_OPEN to close (default: 2)
  timeout:          number;  // ms before OPEN → HALF_OPEN probe (default: 60_000)
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60_000,
    },
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureAt ?? 0);
      if (elapsed >= this.options.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.warn({ name: this.name }, 'Circuit breaker entering HALF_OPEN');
      } else {
        throw new Error(`Circuit breaker OPEN for source: ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = 'CLOSED';
        logger.info({ name: this.name }, 'Circuit breaker CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      logger.error({ name: this.name, failureCount: this.failureCount }, 'Circuit breaker OPEN');
    }
  }
}

// Singletons — one per source, shared across all processors in a worker process
export const redditCircuitBreaker = new CircuitBreaker('reddit');
export const hnCircuitBreaker = new CircuitBreaker('hackernews');
