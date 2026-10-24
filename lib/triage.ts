import type OpenAI from "openai";
import type { ZodType } from "zod";
import { getLlm, llmModel } from "./llm";
import { PROMPT_VERSION, buildMessages, buildSummaryMessages } from "./prompt";
import {
  LlmTriageOutputSchema,
  SummaryOutputSchema,
  TriageResponseSchema,
  type Strategy,
  type TriageResponse,
  type Usage,
} from "./schemas";
import { callDecisionModel, dmModelName, type DmDecision } from "./dm";
import { dmCost, llmCost } from "./pricing";
import { InvalidOutputError, UpstreamError } from "./errors";

const zero = (): Usage => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
const add = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  total_tokens: a.total_tokens + b.total_tokens,
});

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

/** Ask for JSON, validate it with Zod, retry once if it is invalid. */
async function callJson<T>(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: ZodType<T>
): Promise<{ data: T; usage: Usage }> {
  let usage = zero();
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let completion: OpenAI.Chat.ChatCompletion;
    const llm = getLlm(); // throws ConfigError if the key is missing (not wrapped as an upstream error)
    try {
      completion = await llm.chat.completions.create({
        model: llmModel(),
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
      });
    } catch (e: any) {
      throw new UpstreamError(`LLM call failed: ${e?.message ?? e}`, e?.status);
    }
    const u = completion.usage;
    const inT = u?.prompt_tokens ?? 0;
    const outT = u?.completion_tokens ?? 0;
    usage = add(usage, { input_tokens: inT, output_tokens: outT, total_tokens: u?.total_tokens ?? inT + outT });
    const text = completion.choices[0]?.message?.content ?? "";
    try {
      const parsed = schema.safeParse(parseJson(text));
      if (parsed.success) return { data: parsed.data, usage };
      lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "output"}: ${i.message}`).join("; ");
    } catch {
      lastError = "model output is not valid JSON";
    }
  }
  throw new InvalidOutputError(lastError, usage, llmCost(usage.input_tokens, usage.output_tokens));
}

export async function runTriage(ticket: string, strategy: Strategy): Promise<TriageResponse> {
  const t0 = performance.now();
  let usage = zero();
  let cost = 0;
  let model = "";
  let dm: DmDecision | null = null;
  let decided_by: TriageResponse["decided_by"] = "llm";
  let result: TriageResponse["result"];

  if (strategy === "llm") {
    model = llmModel();
    const r = await callJson(buildMessages(ticket), LlmTriageOutputSchema);
    usage = r.usage;
    cost = llmCost(usage.input_tokens, usage.output_tokens);
    result = r.data;
  } else if (strategy === "dm") {
    model = dmModelName();
    dm = await callDecisionModel(ticket);
    usage = dm.usage;
    cost = dmCost(usage.input_tokens);
    decided_by = "dm";
    // A decision model chooses, it does not write: no summary / action.
    result = { category: dm.category, priority: dm.priority, summary: null, suggested_action: null };
  } else {
    model = `${dmModelName()} + ${llmModel()}`;
    dm = await callDecisionModel(ticket);
    const dmCostValue = dmCost(dm.usage.input_tokens);
    const threshold = Number(process.env.DM_CONFIDENCE_THRESHOLD ?? 0.7);
    const confident = Math.min(dm.category_confidence, dm.priority_confidence) >= threshold;
    try {
      if (confident) {
        // DM decides category + priority, the LLM only writes the text.
        const r = await callJson(buildSummaryMessages(ticket, dm.category, dm.priority), SummaryOutputSchema);
        usage = add(dm.usage, r.usage);
        cost = dmCostValue + llmCost(r.usage.input_tokens, r.usage.output_tokens);
        decided_by = "dm+llm";
        result = { category: dm.category, priority: dm.priority, ...r.data };
      } else {
        // Not sure enough: the LLM takes over the whole triage.
        const r = await callJson(buildMessages(ticket), LlmTriageOutputSchema);
        usage = add(dm.usage, r.usage);
        cost = dmCostValue + llmCost(r.usage.input_tokens, r.usage.output_tokens);
        decided_by = "llm_fallback";
        result = r.data;
      }
    } catch (e) {
      if (e instanceof InvalidOutputError) {
        throw new InvalidOutputError(e.message, add(dm.usage, e.usage), e.cost + dmCostValue);
      }
      throw e;
    }
  }

  const response = {
    result,
    strategy,
    decided_by,
    model,
    prompt_version: PROMPT_VERSION,
    usage,
    latency_ms: Math.round(performance.now() - t0),
    cost_usd: cost,
    dm: dm
      ? {
          category_confidence: dm.category_confidence,
          priority_confidence: dm.priority_confidence,
          category_probabilities: dm.category_probabilities,
          priority_probabilities: dm.priority_probabilities,
        }
      : null,
  };
  // F1: the response is validated against its schema before it is forwarded.
  return TriageResponseSchema.parse(response);
}
