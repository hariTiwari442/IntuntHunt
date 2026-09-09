import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../utils/errors.js';
import { env } from '../../config/env.js';

/**
 * Auth middleware — in production this verifies a JWT from the API gateway.
 * The gateway is expected to forward the authenticated userId in a trusted header
 * (X-User-Id) after verifying the JWT. This service trusts the gateway.
 *
 * This service is deployed publicly (Cloud Run), so we also require
 * X-Internal-Key to match a shared secret only main-backend knows —
 * otherwise anyone could call /generate with no auth and burn OpenAI credits.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply:  FastifyReply,
): Promise<void> {
  const internalKey = request.headers['x-internal-key'];
  if (internalKey !== env.INTERNAL_SERVICE_KEY) {
    throw new UnauthorizedError('Invalid or missing X-Internal-Key');
  }

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
