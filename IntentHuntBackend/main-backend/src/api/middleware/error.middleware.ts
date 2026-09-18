import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../utils/errors.js';

export function errorHandler(
  error:   FastifyError | Error,
  request: FastifyRequest,
  reply:   FastifyReply,
): void {
  const requestId = request.id;

  if (error instanceof ZodError) {
    reply.status(400).send({
      statusCode: 400,
      error:      'VALIDATION_ERROR',
      message:    error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      requestId,
    });
    return;
  }

  if ('validation' in error && error.validation) {
    reply.status(400).send({
      statusCode: 400,
      error:      'VALIDATION_ERROR',
      message:    error.message,
      requestId,
    });
    return;
  }

  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error:      error.code,
      message:    error.message,
      requestId,
    });
    return;
  }

  // Framework-level errors that already carry their own 4xx statusCode —
  // @fastify/rate-limit's 429 is the one that surfaced this: it throws a
  // plain Error{statusCode:429}, which matched none of the branches above
  // and fell all the way to the generic 500 below. That reported every
  // rate-limited request on every route as "something broke on our end"
  // instead of "slow down", silently, since a 500 still "works" in the
  // sense of returning *a* response. Only 4xx is passed through here —
  // an unexpected 5xx from Fastify itself should still hit the logged
  // catch-all path below.
  const statusCode = (error as FastifyError).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    reply.status(statusCode).send({
      statusCode,
      error:      (error as FastifyError).code ?? 'REQUEST_ERROR',
      message:    error.message,
      requestId,
    });
    return;
  }

  request.log.error({ err: error }, 'Unhandled error');
  reply.status(500).send({
    statusCode: 500,
    error:      'INTERNAL_SERVER_ERROR',
    message:    'An unexpected error occurred',
    requestId,
  });
}
