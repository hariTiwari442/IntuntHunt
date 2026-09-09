/**
 * Worker process entry point.
 * Starts all three lead-engine pollers (see workers/poller.ts for why
 * they're plain DB polling loops rather than BullMQ workers). Scale by
 * running N replicas — each poller's claim step is safe under concurrent
 * instances (see the "claiming" comments in each worker file).
 *
 * Cloud Run note:
 *   Cloud Run requires the container to bind to $PORT for its startup
 *   probe. Pollers don't normally need an HTTP server, so we spin up a
 *   tiny one with just /health and /readiness. Set the Cloud Run service
 *   to `--no-cpu-throttling --min-instances 1` so the pollers can actually
 *   run continuously between HTTP requests.
 */

import '../config/env.js';   // validate env vars at startup

import { createServer } from 'node:http';
import { startOrchestratorWorker } from '../workers/orchestrator.worker.js';
import { startProcessLeadWorker }  from '../workers/process-lead.worker.js';
import { startReplyGenWorker }     from '../workers/reply-gen.worker.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../db/prisma.client.js';

const PORT = Number(process.env.PORT ?? 8080);

async function main() {
  logger.info('Starting lead-engine worker process');

  const workers = [
    startOrchestratorWorker(),
    startProcessLeadWorker(),
    startReplyGenWorker(),
  ];

  logger.info({ workerCount: workers.length }, 'All workers started');

  // ── Cloud Run startup probe / health endpoint ──────────────────────
  const healthServer = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/' || req.url === '/readiness') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        status:  'ok',
        service: 'crawler-worker',
        workers: workers.length,
        uptime:  process.uptime(),
      }));
      return;
    }
    res.writeHead(404).end();
  });

  healthServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Worker health endpoint listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workers...');
    healthServer.close();
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
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
