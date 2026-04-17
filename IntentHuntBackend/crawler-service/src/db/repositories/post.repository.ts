import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.client.js';
import type { NormalizedPost } from '../../types/crawler.types.js';
import type { ListPostsQuery } from '../../types/api.types.js';

export const postRepository = {
  /**
   * Bulk-upserts posts. Conflicts on (job_id, source, external_id) are ignored
   * so we never store duplicate leads for the same job.
   */
  async bulkUpsert(
    jobId:  string,
    taskId: string,
    posts:  NormalizedPost[],
  ): Promise<{ count: number }> {
    if (posts.length === 0) return { count: 0 };

    const values = posts.map((p) => ({
      jobId,
      taskId,
      source:       p.source as any,
      externalId:   p.externalId,
      keyword:      p.keyword,
      title:        p.title,
      content:      p.content,
      author:       p.author,
      url:          p.url,
      score:        p.score,
      commentCount: p.commentCount,
      subreddit:    p.subreddit,
      postedAt:     p.postedAt,
      rawData:        p.rawData as Prisma.InputJsonValue,
      suggestedReply: p.suggestedReply ?? null,
      strategy:       p.strategy ?? null,
      ...(p.intentScore != null
        ? { intentScore: new Prisma.Decimal(p.intentScore) }
        : {}),
    }));

    const result = await prisma.post.createMany({
      data:           values,
      skipDuplicates: true,   // ON CONFLICT DO NOTHING
    });

    return { count: result.count };
  },

  async findMany(query: ListPostsQuery & { userId: string }) {
    const page    = query.page  ?? 1;
    const limit   = Math.min(query.limit ?? 20, 100);
    const skip    = (page - 1) * limit;
    const sortBy  = query.sortBy  ?? 'intent_score';
    const sortDir = query.sortDir ?? 'desc';

    const columnMap: Record<string, string> = {
      intent_score: 'intentScore',
      posted_at:    'postedAt',
      score:        'score',
    };
    const orderField = columnMap[sortBy] ?? 'intentScore';

    const where: Prisma.PostWhereInput = {
      ...(query.jobId   ? { jobId:   query.jobId }              : {}),
      ...(query.source  ? { source:  query.source as any }      : {}),
      ...(query.keyword ? { keyword: { contains: query.keyword, mode: 'insensitive' } } : {}),
      ...(query.minIntentScore != null
        ? { intentScore: { gte: new Prisma.Decimal(query.minIntentScore) } }
        : {}),
      // Scope to user's own jobs
      job: { userId: query.userId },
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { [orderField]: sortDir },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    return { posts, total, page, limit };
  },

  async countByJob(jobId: string): Promise<number> {
    return prisma.post.count({ where: { jobId } });
  },
};
