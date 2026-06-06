import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Upstash idle-kills connections; keepalive every 30s prevents ECONNRESET.
    // ioredis ignores keepAlive=0 (default), so set it explicitly.
    keepAlive: 30_000,
  });

  client.on('connect', () => logger.info({ name }, 'Redis connected'));
  client.on('error', (err) => logger.error({ err, name }, 'Redis error'));

  return client;
}

export const redisClient = createRedisClient('default');

// BullMQ v5+ prefers a ConnectionOptions config object over a shared ioredis
// instance to avoid AbstractConnector type conflicts between ioredis and
// bullmq's bundled types.
//
// CRITICAL: when REDIS_URL is `rediss://` (TLS, e.g. Upstash), we MUST pass
// `tls: {}` to ioredis. Without it, ioredis opens a plain TCP socket to
// Upstash's TLS port, the handshake fails, Upstash drops the conn → ECONNRESET.
export const bullmqRedis: ConnectionOptions = (() => {
  const parsed = parseRedisUrl(env.REDIS_URL);
  return {
    ...parsed,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
    keepAlive:            30_000,
    ...(parsed.tls ? { tls: {} } : {}),
  };
})();

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?:       number;
  tls?:      boolean;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.username && { username: parsed.username }),
    ...(parsed.password && { password: parsed.password }),
    ...(parsed.pathname.length > 1 && { db: Number(parsed.pathname.slice(1)) }),
    // `rediss:` → TLS required. Upstash always uses rediss://.
    ...(parsed.protocol === 'rediss:' && { tls: true }),
  };
}
