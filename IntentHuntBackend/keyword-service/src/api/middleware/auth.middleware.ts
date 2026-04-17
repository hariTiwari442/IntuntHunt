import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../utils/errors.js';

/**
 * Auth middleware — in production this verifies a JWT from the API gateway.
 * The gateway is expected to forward the authenticated userId in a trusted header
 * (X-User-Id) after verifying the JWT. This service trusts the gateway.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply:  FastifyReply,
): Promise<void> {
  const userId = request.headers['x-user-id'];

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new UnauthorizedError('X-User-Id header is required');
  }

  request.userId = userId.trim();
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}
