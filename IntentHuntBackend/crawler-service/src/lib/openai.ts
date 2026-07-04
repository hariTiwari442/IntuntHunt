import OpenAI from "openai";
import { env } from "../config/env.js";

/**
 * Shared OpenAI client. Uses gpt-4o for high-value calls (keyword engine,
 * reply generator) and gpt-4o-mini for high-volume calls (pre-score, deep
 * score). Pick the model at call site.
 */
export const openai = new OpenAI({
  apiKey:  env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});

export const MODELS = {
  KEYWORD_ENGINE: "gpt-4o",
  PRE_SCORE:      "gpt-4o-mini",
  DEEP_SCORE:     "gpt-4o-mini",
  REPLY_GEN:      "gpt-4o",
} as const;
