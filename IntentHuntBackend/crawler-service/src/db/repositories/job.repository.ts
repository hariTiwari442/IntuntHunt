import { prisma } from '../prisma.client.js';
import type { JobStatus, SourceType } from '../../types/job.types.js';
import type { JobSummary, ListJobsQuery } from '../../types/api.types.js';

export const jobRepository = {
  async create(data: {
    userId:   string;
    keywords: string[];
    sources:  SourceType[];
  }) {
    return prisma.crawlJob.create({
      data: {
        userId:   data.userId,
        keywords: data.keywords,
        sources:  data.sources as any,
      },
    });
  },

  async findById(id: string) {
    return prisma.crawlJob.findUnique({
      where: { id },
      include: {
        _count: { select: { posts: true } },
        tasks:  { select: { status: true } },
      },
    });
  },

  async findMany(query: ListJobsQuery) {
    const page  = query.page  ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip  = (page - 1) * limit;

    const where = {
      userId: query.userId,
      ...(query.status ? { status: query.status as any } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.crawlJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { posts: true, tasks: true } },
        },
      }),
      prisma.crawlJob.count({ where }),
    ]);

    return { jobs, total, page, limit };
  },

  async updateStatus(
    id:     string,
    status: JobStatus,
    extra?: { startedAt?: Date; completedAt?: Date; errorMessage?: string },
  ) {
    return prisma.crawlJob.update({
      where: { id },
      data:  { status: status as any, ...extra },
    });
  },
};
