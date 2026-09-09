/**
 * API process entry point.
 * Fastify HTTP server — handles job creation and result querying.
 * Stateless; scale horizontally behind a load balancer.
 */

import '../config/env.js';  // validate env vars at startup

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { leadEngineRoutes } from './routes/find-leads.routes.js';
import { prisma } from '../db/prisma.client.js';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    requestIdLogLabel: 'requestId',
    trustProxy: true,
  });

  // ---- Plugins ----
  await app.register(helmet);
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
  });
  // In-memory store — was Redis-backed, but that meant every single
  // request hit Redis on top of whatever the pollers were already using,
  // and this service only ever runs as one Cloud Run instance at this
  // scale, so there's no cross-instance state to share anyway.
  await app.register(rateLimit, {
    max:   100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers['x-user-id'] as string ?? req.ip,
  });

  // ---- Global error handler ----
  app.setErrorHandler(errorHandler);

  // ---- Health check ----
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---- Routes ----
  await app.register(leadEngineRoutes, { prefix: '/api/v1' });

  return app;
}

async function main() {
  const app = await buildServer();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'API server started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down API server...');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'API server crashed');
  process.exit(1);
});
