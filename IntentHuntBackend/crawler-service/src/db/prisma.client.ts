import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

prisma.$connect().then(() => {
  logger.info('PostgreSQL connected');
}).catch((err: unknown) => {
  logger.error({ err }, 'PostgreSQL connection failed');
  process.exit(1);
});

export { prisma };
