import { z } from "zod";

export const CATEGORIES = ["billing", "technical_bug", "account", "feature_request"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const STRATEGIES = ["llm", "dm", "dm+llm"] as const;
export const DATASETS = ["labelled100", "tickets500"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Strategy = (typeof STRATEGIES)[number];
export type DatasetName = (typeof DATASETS)[number];

/* ---------- Chat ---------- */
export const ChatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"], { error: "role must be 'user' or 'assistant'" }),
          content: z.string().trim().min(1, "message content is empty").max(8000, "message too long"),
        })
      )
      .min(1, "messages must not be empty")
      .max(60, "conversation too long"),
  })
  .refine((v) => v.messages[v.messages.length - 1].role === "user", {
    message: "the last message must come from the user",
    path: ["messages"],
  });

/* ---------- Triage: request ---------- */
export const TriageRequestSchema = z.object({
  ticket: z
    .string({ error: "ticket must be a string" })
    .trim()
    .min(1, "ticket must not be empty")
    .max(10000, "ticket is too long (max 10000 characters)"),
  strategy: z.enum(STRATEGIES, { error: "strategy must be 'llm', 'dm' or 'dm+llm'" }).default("llm"),
});

/* ---------- Triage: what the LLM must return ---------- */
export const LlmTriageOutputSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().trim().min(1).max(600),
  suggested_action: z.string().trim().min(1).max(600),
});

export const SummaryOutputSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  suggested_action: z.string().trim().min(1).max(600),
});

/* ---------- Triage: response ---------- */
export const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const TriageResponseSchema = z.object({
  result: z.object({
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    summary: z.string().nullable(), // null when the decision model alone was used
    suggested_action: z.string().nullable(),
  }),
  strategy: z.enum(STRATEGIES),
  decided_by: z.enum(["llm", "dm", "dm+llm", "llm_fallback"]),
  model: z.string(),
  prompt_version: z.string(),
  usage: UsageSchema,
  latency_ms: z.number().nonnegative(),
  cost_usd: z.number().nonnegative(),
  dm: z
    .object({
      category_confidence: z.number(),
      priority_confidence: z.number(),
      category_probabilities: z.record(z.string(), z.number()),
      priority_probabilities: z.record(z.string(), z.number()),
    })
    .nullable(),
});
export type TriageResponse = z.infer<typeof TriageResponseSchema>;

/* ---------- Smoke test ---------- */
export const SmokeRequestSchema = z.object({
  dataset: z.enum(DATASETS, { error: "dataset must be 'labelled100' or 'tickets500'" }),
  sample: z
    .number({ error: "sample must be a number" })
    .int("sample must be a whole number")
    .min(1, "sample must be at least 1")
    .max(500, "sample must be at most 500"),
  strategy: z.enum(STRATEGIES, { error: "strategy must be 'llm', 'dm' or 'dm+llm'" }).default("llm"),
});

/* ---------- JSON Schemas (generated from the Zod schemas) ---------- */
export const jsonSchemas = {
  triageRequest: z.toJSONSchema(TriageRequestSchema),
  triageResponse: z.toJSONSchema(TriageResponseSchema),
};
