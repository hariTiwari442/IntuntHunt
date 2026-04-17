import type { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../config/supabase.js';
import { UnauthorizedError } from '../../utils/errors.js';

/**
 * Verifies the Supabase-issued JWT from the Authorization header.
 * Uses Supabase admin client to support both HS256 and ES256 tokens.
 * Attaches userId and userEmail to the request object.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  request.userId    = data.user.id;
  request.userEmail = data.user.email ?? '';
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}
