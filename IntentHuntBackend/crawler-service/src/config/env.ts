import { z } from 'zod';
import { config } from 'dotenv';
// quiet: true → suppresses dotenv's tip-message to stdout that pollutes JSON output
config({ quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Shared secret main-backend sends as `X-Internal-Key`. This service is
  // publicly reachable on Cloud Run and otherwise trusts X-User-Id blindly —
  // without this check anyone could forge that header and act as any user.
  INTERNAL_SERVICE_KEY: z.string().min(1, 'INTERNAL_SERVICE_KEY is required'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_BASE_URL: z.string().url().optional(),
  REPLY_INTENT_THRESHOLD: z.coerce.number().min(0).max(100).default(85),
  APIFY_API_KEY: z.string().min(1, 'APIFY_API_KEY is required'),
  APIFY_BASE_URL: z.string().url().optional(),
  // At least one of SCRAPECREATORS_API_KEY or SCRAPECREATORS_API_KEYS must be set.
  // _KEYS (plural, comma-separated) takes precedence when both are present.
  SCRAPECREATORS_API_KEY: z.string().optional(),
  SCRAPECREATORS_API_KEYS: z.string().optional(),
  SCRAPECREATORS_BASE_URL: z.string().url().optional(),
  HN_BASE_URL: z.string().url().optional(),
  // Serper.dev (Google search) — required for Step 2.
  // Optional in env validation so the service still starts during dev transition;
  // step2 throws a clear error if it's missing when called.
  SERPER_API_KEY: z.string().optional(),
  SERPER_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Throws at startup if any required variable is missing or malformed
const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

// Cross-field check — must have at least one ScrapeCreators key source
if (!result.data.SCRAPECREATORS_API_KEY && !result.data.SCRAPECREATORS_API_KEYS) {
  console.error('❌ Either SCRAPECREATORS_API_KEY or SCRAPECREATORS_API_KEYS must be set');
  process.exit(1);
}

export const env: Env = result.data;
