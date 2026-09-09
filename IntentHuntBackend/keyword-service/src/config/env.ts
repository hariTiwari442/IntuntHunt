import { z } from "zod";
import { config } from "dotenv";
config();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3002),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z.string().url().optional(),
  // Shared secret main-backend would send as `X-Internal-Key`. This service
  // is publicly reachable on Cloud Run and otherwise trusts X-User-Id
  // blindly — without this, anyone could hit /generate and burn OpenAI
  // credits with no auth at all.
  INTERNAL_SERVICE_KEY: z.string().min(1, "INTERNAL_SERVICE_KEY is required"),
});

export type Env = z.infer<typeof EnvSchema>;

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Invalid environment variables:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = result.data;
