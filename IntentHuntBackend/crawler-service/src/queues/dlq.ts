import { Worker } from 'bullmq';
import { bullmqRedis } from '../cache/redis.client.js';
import { QueueName, type DLQPayload } from '../types/job.types.js';
import { logger } from '../utils/logger.js';

/**
 * DLQ worker — logs dead tasks for ops visibility and alerting.
 * In production, this could emit a metric, send a Slack alert,
 * or store to a separate audit table for manual review.
 */
export function startDLQWorker(): Worker {
  const worker = new Worker<DLQPayload>(
    QueueName.DLQ,
    async (job) => {
      const { originalQueue, originalPayload, failedAt, finalError, totalAttempts } = job.data;

      logger.error(
        {
          crawlJobId:  originalPayload.crawlJobId,
          crawlTaskId: originalPayload.crawlTaskId,
          source:      originalPayload.source,
          keyword:     originalPayload.keyword,
          originalQueue,
          totalAttempts,
          finalError,
          failedAt,
        },
        'Task permanently failed — moved to DLQ',
      );

      // TODO: emit Prometheus counter intenthunt_dlq_total{source}
      // TODO: trigger Slack/PagerDuty alert if dlq_size > threshold
    },
    { connection: bullmqRedis, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'DLQ worker itself failed');
  });

  return worker;
}
