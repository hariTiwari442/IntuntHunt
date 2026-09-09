import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../utils/errors.js';
import { env } from '../../config/env.js';

/**
 * Auth middleware — in production this verifies a JWT from the API gateway.
 * The gateway is expected to forward the authenticated userId in a trusted header
 * (X-User-Id) after verifying the JWT. This service trusts the gateway.
 *
 * This service is deployed publicly (Cloud Run), so X-User-Id alone isn't
 * enough — anyone could set it to any value. We also require X-Internal-Key
 * to match a shared secret only main-backend knows, proving the request
 * actually came through the gateway and not directly from the internet.
 *
 * For local development / testing, a mock userId can be passed directly
 * as long as INTERNAL_SERVICE_KEY matches too.
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

  // Attach to request for use in route handlers
  request.userId = userId.trim();
}

// Extend Fastify's request type to carry userId
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}
