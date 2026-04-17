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

  request.log.error({ err: error }, 'Unhandled error');
  reply.status(500).send({
    statusCode: 500,
    error:      'INTERNAL_SERVER_ERROR',
    message:    'An unexpected error occurred',
    requestId,
  });
}
