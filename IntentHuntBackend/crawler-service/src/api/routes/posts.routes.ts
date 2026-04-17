import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { postRepository } from '../../db/repositories/post.repository.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { ListPostsResponse, PostSummary } from '../../types/api.types.js';

const ListPostsQuerySchema = z.object({
  jobId:          z.string().uuid().optional(),
  source:         z.enum(['reddit', 'hackernews', 'linkedin']).optional(),
  keyword:        z.string().optional(),
  minIntentScore: z.coerce.number().min(0).max(100).optional(),
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  sortBy:         z.enum(['intent_score', 'posted_at', 'score']).default('intent_score'),
  sortDir:        z.enum(['asc', 'desc']).default('desc'),
});

export async function postsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ---- GET /api/v1/posts ----
  app.get('/', async (request, reply) => {
    const query = ListPostsQuerySchema.parse(request.query);

    const { posts, total, page, limit } = await postRepository.findMany({
      ...query,
      userId: request.userId,
    });

    const response: ListPostsResponse = {
      posts: posts.map((p): PostSummary => ({
        id:             p.id,
        jobId:          p.jobId,
        source:         p.source as any,
        keyword:        p.keyword,
        title:          p.title,
        content:        p.content ?? null,
        author:         p.author ?? null,
        url:            p.url ?? null,
        score:          p.score ?? null,
        commentCount:   p.commentCount ?? null,
        subreddit:      p.subreddit ?? null,
        postedAt:       p.postedAt?.toISOString() ?? null,
        fetchedAt:      p.fetchedAt.toISOString(),
        intentScore:    p.intentScore ? Number(p.intentScore) : null,
        suggestedReply: (p as any).suggestedReply ?? null,
        strategy:       (p as any).strategy ?? null,
      })),
      total,
      page,
      limit,
    };

    reply.send(response);
  });
}
