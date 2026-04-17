import { z } from 'zod';
import { config } from 'dotenv';
config();

const EnvSchema = z.object({
  NODE_ENV:     z.enum(['development', 'test', 'production']).default('development'),
  PORT:         z.coerce.number().default(3000),
  LOG_LEVEL:    z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Supabase
  DATABASE_URL:             z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL:             z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY:        z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  JWT_SECRET:               z.string().min(1, 'JWT_SECRET is required'),

  // Internal service URLs
  KEYWORD_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  CRAWLER_SERVICE_URL: z.string().url().default('http://localhost:3001'),
});

export type Env = z.infer<typeof EnvSchema>;

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = result.data;
