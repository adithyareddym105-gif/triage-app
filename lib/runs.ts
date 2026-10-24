import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "runs.json");

export type RunRecord = {
  id: string;
  started_at: string;
  dataset: string;
  sample_size: number;
  strategy: string;
  model: string;
  prompt_version: string;
  accuracy: { category: number; priority: number; both: number } | null;
  outcomes: { ok: number; invalid_output: number; error: number };
  mismatches: { category: number; priority: number } | null;
  latency: { avg_ms: number; p50_ms: number; p95_ms: number; wall_ms: number };
  cost_usd: number;
  tokens: { input: number; output: number; total: number };
};

export function readRuns(): RunRecord[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

export function appendRun(run: RunRecord) {
  const runs = readRuns();
  runs.push(run);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(runs, null, 2));
}
