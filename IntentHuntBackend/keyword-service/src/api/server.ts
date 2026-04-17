/**
 * Keyword Service — API entry point.
 * Transforms product descriptions into platform-specific search queries using OpenAI.
 * Stateless; scale horizontally behind a load balancer.
 */

import '../config/env.js'; // validate env vars at startup

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { keywordsRoutes } from './routes/keywords.routes.js';

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
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['x-user-id'] as string | undefined) ?? req.ip,
  });

  // ---- Global error handler ----
  app.setErrorHandler(errorHandler);

  // ---- Health check ----
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---- Routes ----
  await app.register(keywordsRoutes, { prefix: '/api/v1/keywords' });

  return app;
}

async function main() {
  const app = await buildServer();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Keyword service started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down keyword service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Keyword service crashed');
  process.exit(1);
});
