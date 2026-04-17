import { z } from 'zod';
import { config } from 'dotenv';
config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_BASE_URL: z.string().url().optional(),
  REPLY_INTENT_THRESHOLD: z.coerce.number().min(0).max(100).default(85),
  APIFY_API_KEY: z.string().min(1, 'APIFY_API_KEY is required'),
  APIFY_BASE_URL: z.string().url().optional(),
  SCRAPECREATORS_API_KEY: z.string().min(1, 'SCRAPECREATORS_API_KEY is required'),
  SCRAPECREATORS_BASE_URL: z.string().url().optional(),
  HN_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Throws at startup if any required variable is missing or malformed
const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = result.data;
