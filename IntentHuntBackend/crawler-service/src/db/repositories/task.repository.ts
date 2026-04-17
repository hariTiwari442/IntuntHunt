import { prisma } from '../prisma.client.js';
import type { SourceType, TaskStatus } from '../../types/job.types.js';

export const taskRepository = {
  async createMany(
    tasks: Array<{ jobId: string; source: SourceType; keyword: string }>,
  ) {
    // createMany doesn't support returning rows in all Prisma versions,
    // so we use a transaction to insert + fetch.
    await prisma.crawlTask.createMany({
      data: tasks.map((t) => ({
        jobId:   t.jobId,
        source:  t.source as any,
        keyword: t.keyword,
      })),
      skipDuplicates: true,
    });

    const jobId = tasks[0]?.jobId;
    if (!jobId) return [];
    return prisma.crawlTask.findMany({
      where: { jobId },
    });
  },

  async markRunning(id: string, bullmqJobId: string) {
    return prisma.crawlTask.update({
      where: { id },
      data: {
        status:        'running',
        bullmqJobId,
        lastAttemptAt: new Date(),
        attempts:      { increment: 1 },
      },
    });
  },

  async markCompleted(id: string, resultCount: number) {
    return prisma.crawlTask.update({
      where: { id },
      data: {
        status:      'completed',
        resultCount,
        completedAt: new Date(),
      },
    });
  },

  async markFailed(id: string, errorMessage: string, nextAttemptAt?: Date) {
    return prisma.crawlTask.update({
      where: { id },
      data: {
        status: 'pending',   // reset to pending so BullMQ can retry
        errorMessage,
        nextAttemptAt: nextAttemptAt ?? null,
      },
    });
  },

  async markDead(id: string, errorMessage: string) {
    return prisma.crawlTask.update({
      where: { id },
      data: {
        status:       'dead',
        errorMessage,
        completedAt:  new Date(),
      },
    });
  },

  /** True when all tasks for a job are in a terminal state (completed/failed/dead) */
  async allTasksTerminal(jobId: string): Promise<boolean> {
    const count = await prisma.crawlTask.count({
      where: { jobId, status: { in: ['pending', 'running'] } },
    });
    return count === 0;
  },

  async anyTaskInState(jobId: string, statuses: TaskStatus[]): Promise<boolean> {
    const count = await prisma.crawlTask.count({
      where: { jobId, status: { in: statuses as any } },
    });
    return count > 0;
  },

  async getProgress(jobId: string) {
    const tasks = await prisma.crawlTask.groupBy({
      by: ['status'],
      where: { jobId },
      _count: true,
    });

    const progress = { total: 0, pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
    for (const row of tasks) {
      const status = row.status as TaskStatus;
      const count  = row._count;
      progress.total += count;
      if (status in progress) {
        (progress as any)[status] = count;
      }
    }
    return progress;
  },
};
