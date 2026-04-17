import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as profileService from '../../services/profile.service.js';

const UpdateProfileSchema = z.object({
  name:      z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // All profile routes require auth
  app.addHook('preHandler', authMiddleware);

  // GET /profile/me
  app.get('/me', async (request, reply) => {
    const profile = await profileService.getProfile(request.userId);
    reply.send(profile);
  });

  // PATCH /profile/me
  app.patch('/me', async (request, reply) => {
    const body = UpdateProfileSchema.parse(request.body);
    const profile = await profileService.updateProfile(request.userId, body);
    reply.send(profile);
  });

  // GET /profile/stats
  app.get('/stats', async (request, reply) => {
    const stats = await profileService.getProfileStats(request.userId);
    reply.send(stats);
  });
}
