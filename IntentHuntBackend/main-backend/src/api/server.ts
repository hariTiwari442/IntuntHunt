/**
 * Main backend entry point.
 * Auth (via Supabase), profiles, and API gateway to internal services.
 */

import '../config/env.js'; // validate env vars at startup

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { profileRoutes } from './routes/profile.routes.js';
import { gatewayRoutes } from './routes/gateway.routes.js';
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

  // ── Plugins ───────────────────────────────────────────
  await app.register(helmet);
  await app.register(cors, {
    origin:      env.NODE_ENV === 'production' ? false : true,
    credentials: true, // needed for httpOnly cookies
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max:         100,
    timeWindow:  '1 minute',
    keyGenerator: (req) => req.ip,
  });

  // ── Stricter rate limit on auth endpoints ─────────────
  // Applied inside route registration below

  // ── Global error handler ──────────────────────────────
  app.setErrorHandler(errorHandler);

  // ── Health check ──────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok', service: 'main-backend', timestamp: new Date().toISOString() });
  });

  // ── Routes ────────────────────────────────────────────
  await app.register(authRoutes,    { prefix: '/api/v1/auth' });
  await app.register(profileRoutes, { prefix: '/api/v1/profile' });
  await app.register(gatewayRoutes, { prefix: '/api/v1/gateway' });

  return app;
}

async function main() {
  const app = await buildServer();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Main backend started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down main backend...');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Main backend crashed');
  process.exit(1);
});
