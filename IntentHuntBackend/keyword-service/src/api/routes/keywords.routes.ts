import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { generateKeywords } from '../../keyword-engine/keyword-engine.service.js';

const GenerateKeywordsSchema = z.object({
  description: z.string().min(20, 'Description must be at least 20 characters').max(2000),
});

export async function keywordsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ---- POST /api/v1/keywords/generate ----
  app.post('/generate', async (request, reply) => {
    const body = GenerateKeywordsSchema.parse(request.body);

    try {
      const result = await generateKeywords(body.description);
      reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.status(502).send({ error: 'AI service unavailable', detail: message });
    }
  });
}
