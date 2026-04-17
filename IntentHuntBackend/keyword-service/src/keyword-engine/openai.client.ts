import OpenAI from "openai";
import { env } from "../config/env.js";

export const openaiClient = new OpenAI({
  apiKey:  env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});
