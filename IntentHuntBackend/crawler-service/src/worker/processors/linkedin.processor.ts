import { Worker } from 'bullmq';
import { bullmqRedis } from '../../cache/redis.client.js';
import { taskRepository } from '../../db/repositories/task.repository.js';
import { postRepository } from '../../db/repositories/post.repository.js';
import { jobRepository } from '../../db/repositories/job.repository.js';
import { dlqQueue } from '../../queues/queue.registry.js';
import { LinkedInCrawler } from '../../crawlers/linkedin.crawler.js';
import { QUEUE_CONFIG, computeBackoffDelay } from '../../queues/queue.config.js';
import {
  QueueName,
  type CrawlTaskPayload,
  type DLQPayload,
} from '../../types/job.types.js';
import { isRetryable } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { scorePostIntents } from '../../ai/intent-scorer.js';

const crawler = new LinkedInCrawler();

export function startLinkedInWorker(): Worker {
  const config = QUEUE_CONFIG[QueueName.LINKEDIN];

  const worker = new Worker<CrawlTaskPayload>(
    QueueName.LINKEDIN,
    async (job) => {
      const { crawlJobId, crawlTaskId, keyword } = job.data;
      const log = logger.child({ crawlJobId, crawlTaskId, keyword, source: 'linkedin' });

      await taskRepository.markRunning(crawlTaskId, job.id ?? '');
      log.info('Starting LinkedIn crawl');

      const rawPosts = await crawler.fetch(keyword);
      const posts    = await scorePostIntents(rawPosts, keyword);

      const { count } = await postRepository.bulkUpsert(crawlJobId, crawlTaskId, posts);
      await taskRepository.markCompleted(crawlTaskId, count);

      log.info({ postCount: count }, 'LinkedIn crawl completed');

      await checkJobCompletion(crawlJobId);
    },
    {
      connection:  bullmqRedis,
      concurrency: config.concurrency,
      limiter:     config.limiter ?? undefined,
    },
  );

  worker.on('failed', async (job, error) => {
    if (!job) return;
    const { crawlJobId, crawlTaskId, keyword } = job.data;
    const log = logger.child({ crawlJobId, crawlTaskId, keyword });

    const maxed = job.attemptsMade >= (job.opts.attempts ?? 3);

    if (!isRetryable(error) || maxed) {
      log.error({ error: error.message, attempts: job.attemptsMade }, 'LinkedIn task permanently failed');

      await taskRepository.markDead(crawlTaskId, error.message);
      await dlqQueue.add('dead', {
        originalQueue:   QueueName.LINKEDIN,
        originalPayload: job.data,
        failedAt:        new Date().toISOString(),
        finalError:      error.message,
        totalAttempts:   job.attemptsMade,
      } satisfies DLQPayload);

      await checkJobCompletion(crawlJobId);
    } else {
      const nextAttemptAt = new Date(Date.now() + computeBackoffDelay(job.attemptsMade));
      await taskRepository.markFailed(crawlTaskId, error.message, nextAttemptAt);
      log.warn({ error: error.message, nextAttemptAt }, 'LinkedIn task failed — will retry');
    }
  });

  return worker;
}

async function checkJobCompletion(crawlJobId: string): Promise<void> {
  const allDone = await taskRepository.allTasksTerminal(crawlJobId);
  if (!allDone) return;

  const hasFailures = await taskRepository.anyTaskInState(crawlJobId, ['failed', 'dead']);
  const finalStatus = hasFailures ? 'failed' : 'completed';

  await jobRepository.updateStatus(crawlJobId, finalStatus, { completedAt: new Date() });
  logger.info({ crawlJobId, finalStatus }, 'Crawl job finished');
}
