import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { SmokeRequestSchema } from "@/lib/schemas";
import { loadDataset, sampleRandom, type Ticket } from "@/lib/dataset";
import { runTriage } from "@/lib/triage";
import { appendRun, type RunRecord } from "@/lib/runs";
import { PROMPT_VERSION } from "@/lib/prompt";
import { dmModelName } from "@/lib/dm";
import { llmModel } from "@/lib/llm";
import { InvalidOutputError } from "@/lib/errors";
import { errorResponse, handleServerError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Row = {
  ticket_id: string;
  subject: string;
  outcome: "ok" | "invalid_output" | "error";
  predicted: { category: string; priority: string } | null;
  expected: { category?: string; priority?: string } | null;
  category_match: boolean | null;
  priority_match: boolean | null;
  latency_ms: number;
  tokens: { input: number; output: number; total: number };
  cost_usd: number;
  decided_by: string | null;
  error: string | null;
};

// Gemini's free tier is rate limited (HTTP 429): LLM strategies go one ticket at a time with a pause.
// The decision model alone can run 3 at a time. Tune the pause with SMOKE_DELAY_MS in .env.local.
const delayMs = (strategy: string) => (strategy === "dm" ? 0 : Number(process.env.SMOKE_DELAY_MS ?? 6000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>, pause = 0): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        if (pause && next < items.length) await sleep(pause);
      }
    })
  );
  return out;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = SmokeRequestSchema.safeParse(body.body);
  if (!parsed.success) return validationError(parsed.error);
  const { dataset, sample, strategy } = parsed.data;

  // Fail fast with a clear message instead of logging a run made only of errors.
  if (strategy !== "dm" && !process.env.LLM_API_KEY) return errorResponse(500, "config_error", "LLM_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  if (strategy !== "llm" && !process.env.DM_API_KEY) return errorResponse(500, "config_error", "DM_API_KEY is not set. Get a free key at https://decision.vllm-sr.ai and put it in .env.local.");

  let tickets: Ticket[];
  try {
    tickets = loadDataset(dataset);
  } catch (e: any) {
    return errorResponse(400, "dataset_error", e.message);
  }
  const labelled = dataset === "labelled100";
  const picked = sampleRandom(tickets, sample);
  const started = new Date();
  const wall0 = performance.now();

  try {
    const rows = await pool(picked, strategy === "dm" ? 3 : 1, async (t): Promise<Row> => {
      const ticketText = `${t.subject}\n\n${t.body}`;
      const base = { ticket_id: t.ticket_id, subject: t.subject, expected: labelled ? { category: t.category, priority: t.priority } : null };
      const t0 = performance.now();
      try {
        const r = await runTriage(ticketText, strategy);
        return {
          ...base,
          outcome: "ok",
          predicted: { category: r.result.category, priority: r.result.priority },
          category_match: labelled ? r.result.category === t.category : null,
          priority_match: labelled ? r.result.priority === t.priority : null,
          latency_ms: r.latency_ms,
          tokens: { input: r.usage.input_tokens, output: r.usage.output_tokens, total: r.usage.total_tokens },
          cost_usd: r.cost_usd,
          decided_by: r.decided_by,
          error: null,
        };
      } catch (e: any) {
        const invalid = e instanceof InvalidOutputError;
        return {
          ...base,
          outcome: invalid ? "invalid_output" : "error",
          predicted: null,
          category_match: labelled ? false : null,
          priority_match: labelled ? false : null,
          latency_ms: Math.round(performance.now() - t0),
          tokens: invalid ? { input: e.usage.input_tokens, output: e.usage.output_tokens, total: e.usage.total_tokens } : { input: 0, output: 0, total: 0 },
          cost_usd: invalid ? e.cost : 0,
          decided_by: null,
          error: e?.message ?? "unknown error",
        };
      }
    }, delayMs(strategy));

    const wall = Math.round(performance.now() - wall0);
    const ok = rows.filter((r) => r.outcome === "ok");
    const lat = rows.map((r) => r.latency_ms).sort((a, b) => a - b);
    const total = rows.length;
    const catWrong = ok.filter((r) => r.category_match === false).length; // mismatches among predictions made
    const prioWrong = ok.filter((r) => r.priority_match === false).length;
    const catRight = rows.filter((r) => r.category_match === true).length; // failures count as wrong
    const prioRight = rows.filter((r) => r.priority_match === true).length;
    const bothRight = rows.filter((r) => r.category_match === true && r.priority_match === true).length;

    const model = strategy === "llm" ? llmModel() : strategy === "dm" ? dmModelName() : `${dmModelName()} + ${llmModel()}`;
    const run: RunRecord = {
      id: randomUUID(),
      started_at: started.toISOString(),
      dataset,
      sample_size: total,
      strategy,
      model,
      prompt_version: PROMPT_VERSION,
      accuracy: labelled ? { category: catRight / total, priority: prioRight / total, both: bothRight / total } : null,
      outcomes: {
        ok: ok.length,
        invalid_output: rows.filter((r) => r.outcome === "invalid_output").length,
        error: rows.filter((r) => r.outcome === "error").length,
      },
      mismatches: labelled ? { category: catWrong, priority: prioWrong } : null,
      latency: {
        avg_ms: Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, total)),
        p50_ms: pct(lat, 0.5),
        p95_ms: pct(lat, 0.95),
        wall_ms: wall,
      },
      cost_usd: rows.reduce((a, r) => a + r.cost_usd, 0),
      tokens: {
        input: rows.reduce((a, r) => a + r.tokens.input, 0),
        output: rows.reduce((a, r) => a + r.tokens.output, 0),
        total: rows.reduce((a, r) => a + r.tokens.total, 0),
      },
    };
    appendRun(run); // F4: every run is logged
    return NextResponse.json({ run, rows });
  } catch (e) {
    return handleServerError(e);
  }
}
