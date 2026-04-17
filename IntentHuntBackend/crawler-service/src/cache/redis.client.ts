import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  client.on('connect', () => logger.info({ name }, 'Redis connected'));
  client.on('error', (err) => logger.error({ err, name }, 'Redis error'));

  return client;
}

export const redisClient = createRedisClient('default');

// BullMQ v5+ prefers a ConnectionOptions config object over a shared ioredis instance
// to avoid AbstractConnector type conflicts between ioredis and bullmq's bundled types.
export const bullmqRedis: ConnectionOptions = {
  ...parseRedisUrl(env.REDIS_URL),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

function parseRedisUrl(url: string): { host: string; port: number; username?: string; password?: string; db?: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.username && { username: parsed.username }),
    ...(parsed.password && { password: parsed.password }),
    ...(parsed.pathname.length > 1 && { db: Number(parsed.pathname.slice(1)) }),
  };
}
