import OpenAI from "openai";
import { ConfigError } from "./errors";

let client: OpenAI | null = null;

/** One OpenAI-SDK client built from the environment. Only the server reads the key. */
export function getLlm(): OpenAI {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new ConfigError("LLM_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
    client = new OpenAI({
      apiKey,
      baseURL: process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
      maxRetries: 5, // the SDK honours Retry-After on 429s (Gemini free tier is rate limited)
    });
  }
  return client;
}

export const llmModel = () => process.env.LLM_MODEL || "gemini-2.5-flash";
