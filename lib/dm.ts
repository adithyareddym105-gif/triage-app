import { z } from "zod";
import { CATEGORIES, PRIORITIES, type Category, type Priority, type Usage } from "./schemas";
import { ConfigError, UpstreamError } from "./errors";

export const dmModelName = () => process.env.DM_MODEL || "vllm-sr/d3-turbo";

const ChoiceAnswer = z.object({
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().optional(),
});

const DmResponseSchema = z.object({
  answers: z.object({ category: ChoiceAnswer, priority: ChoiceAnswer }),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number().optional() }),
});

export type DmDecision = {
  category: Category;
  priority: Priority;
  category_confidence: number;
  priority_confidence: number;
  category_probabilities: Record<string, number>;
  priority_probabilities: Record<string, number>;
  usage: Usage;
};

// The closed sets and what each option means ("criteria" = decision guidance, as data).
const QUESTIONS = {
  category: {
    type: "choice",
    instructions: "Which category does this customer support ticket belong to?",
    criteria: {
      billing: "Invoices, payments, refunds, plans, pricing, charges, PO numbers",
      technical_bug: "Something is broken, wrong, slow or failing; also how-to questions",
      account: "Login, access, roles, permissions, SSO, user management",
      feature_request: "Asks for a new capability or an improvement",
    },
  },
  priority: {
    type: "choice",
    instructions: "What is the business-impact priority of this ticket? Tone and shouting do not matter.",
    criteria: {
      low: "Cosmetic issue, question, how-to, or nice-to-have",
      medium: "Feature degraded or task blocked, but a workaround exists",
      high: "Outage, data loss, security issue, or business-critical work completely blocked",
    },
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callDecisionModel(ticket: string): Promise<DmDecision> {
  const key = process.env.DM_API_KEY;
  if (!key) throw new ConfigError("DM_API_KEY is not set. Get a free key at https://decision.vllm-sr.ai and put it in .env.local.");
  const base = (process.env.DM_BASE_URL || "https://decision.vllm-sr.ai").replace(/\/$/, "");
  // The state is untrusted text, the answer is validated below.
  const body = JSON.stringify({ model: dmModelName(), state: ticket.slice(0, 20000), questions: QUESTIONS });

  let lastMessage = "decision model call failed";
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(35000),
      });
    } catch (e: any) {
      lastMessage = `decision model unreachable: ${e?.message ?? e}`;
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status === 502 || res.status === 503) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 2 ** attempt, 15);
      lastMessage = `decision model busy (HTTP ${res.status})`;
      lastStatus = res.status;
      await sleep(wait * 1000);
      continue;
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      throw new UpstreamError(`decision model error: ${json?.error?.message ?? `HTTP ${res.status}`}`, res.status);
    }
    const parsed = DmResponseSchema.safeParse(json);
    if (!parsed.success) throw new UpstreamError("decision model returned an unexpected response shape");
    const { category, priority } = parsed.data.answers;
    if (!(CATEGORIES as readonly string[]).includes(category.choice) || !(PRIORITIES as readonly string[]).includes(priority.choice)) {
      throw new UpstreamError("decision model chose an option outside the allowed set");
    }
    const conf = (a: z.infer<typeof ChoiceAnswer>) => a.confidence ?? Math.max(...Object.values(a.probabilities));
    const inTok = parsed.data.usage.input_tokens;
    const outTok = parsed.data.usage.output_tokens ?? 0;
    return {
      category: category.choice as Category,
      priority: priority.choice as Priority,
      category_confidence: conf(category),
      priority_confidence: conf(priority),
      category_probabilities: category.probabilities,
      priority_probabilities: priority.probabilities,
      usage: { input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok },
    };
  }
  throw new UpstreamError(lastMessage, lastStatus);
}
