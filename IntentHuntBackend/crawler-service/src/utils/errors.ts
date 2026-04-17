import type { SourceType } from '../types/job.types.js';

// ---- Typed application errors (API layer) ----

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, 404, 'NOT_FOUND');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// ---- Crawler errors (worker layer) ----

export class CrawlerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
    public readonly retryable: boolean,
    public readonly source: SourceType,
  ) {
    super(message);
    this.name = 'CrawlerError';
  }
}

// HTTP status codes that warrant a retry (transient failures)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export function classifyHttpError(
  statusCode: number,
  source: SourceType,
  message: string,
): CrawlerError {
  return new CrawlerError(message, statusCode, RETRYABLE_STATUS_CODES.has(statusCode), source);
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof CrawlerError) return error.retryable;
  // Network timeouts are always retryable
  if (error instanceof Error && error.name === 'AbortError') return true;
  // Unknown errors: conservative retry
  return true;
}
