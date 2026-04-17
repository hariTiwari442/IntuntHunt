/**
 * Worker process entry point.
 * Starts all BullMQ workers. Scale by running multiple instances of this process.
 * Stateless — safe to run N replicas concurrently.
 */

import '../config/env.js';   // validate env vars at startup

import { startOrchestratorWorker } from './orchestrator.js';
import { startRedditWorker } from './processors/reddit.processor.js';
import { startHNWorker } from './processors/hn.processor.js';
import { startLinkedInWorker } from './processors/linkedin.processor.js';
import { startDLQWorker } from '../queues/dlq.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../db/prisma.client.js';
import { redisClient } from '../cache/redis.client.js';

async function main() {
  logger.info('Starting crawler worker process');

  // Start all workers
  const workers = [
    startOrchestratorWorker(),
    startRedditWorker(),
    startHNWorker(),
    startLinkedInWorker(),
    startDLQWorker(),
  ];

  logger.info({ workerCount: workers.length }, 'All workers started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workers...');
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
    await redisClient.quit();
    logger.info('Worker process stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker process crashed');
  process.exit(1);
});
