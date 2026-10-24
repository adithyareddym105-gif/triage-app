import fs from "node:fs";
import path from "node:path";
import type { DatasetName } from "./schemas";

export type Ticket = {
  ticket_id: string;
  subject: string;
  body: string;
  category?: string;
  priority?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const CAT_KEYS = ["category", "expected_category", "label_category", "gold_category", "true_category", "ground_truth_category", "label"];
const PRIO_KEYS = ["priority", "expected_priority", "label_priority", "gold_priority", "true_priority", "ground_truth_priority"];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

function readRecords(file: string): any[] {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".csv")) return parseCsv(text);
  const raw = JSON.parse(text);
  if (Array.isArray(raw)) return raw;
  return raw.tickets ?? raw.data ?? raw.items ?? [];
}

function pick(o: any, keys: string[]): any {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== "") return o[k];
  for (const nest of ["labels", "label", "expected", "gold", "ground_truth"]) {
    if (o?.[nest] && typeof o[nest] === "object") for (const k of keys) if (o[nest][k]) return o[nest][k];
  }
  return undefined;
}

const norm = (v: any) => (v === undefined ? undefined : String(v).trim().toLowerCase().replace(/[\s-]+/g, "_"));

function findFile(kind: DatasetName): string {
  if (!fs.existsSync(DATA_DIR)) throw new Error("The data/ folder is missing.");
  const files = fs.readdirSync(DATA_DIR).filter((f) => /\.(json|csv)$/i.test(f) && f !== "runs.json");
  const wanted =
    kind === "labelled100"
      ? files.filter((f) => /label/i.test(f))
      : files.filter((f) => /500/.test(f) && !/label/i.test(f));
  const chosen = wanted.sort((a, b) => Number(b.endsWith(".json")) - Number(a.endsWith(".json")))[0];
  if (!chosen) {
    throw new Error(
      kind === "labelled100"
        ? "Labelled 100-ticket file not found. Put it in data/ with 'label' in its name (e.g. data/support_tickets_labelled_100.json)."
        : "500-ticket file not found. Put it in data/ (e.g. data/support_tickets_500.json)."
    );
  }
  return path.join(DATA_DIR, chosen);
}

export function loadDataset(kind: DatasetName): Ticket[] {
  const records = readRecords(findFile(kind));
  const tickets = records.map((r, i) => ({
    ticket_id: String(r.ticket_id ?? r.id ?? `row-${i + 1}`),
    subject: String(r.subject ?? r.title ?? ""),
    body: String(r.body ?? r.text ?? r.description ?? ""),
    category: norm(pick(r, CAT_KEYS)),
    priority: norm(pick(r, PRIO_KEYS)),
  }));
  if (kind === "labelled100" && !tickets.some((t) => t.category && t.priority)) {
    throw new Error("The labelled file has no category/priority columns I can recognise (expected 'category' and 'priority').");
  }
  return tickets;
}

export function sampleRandom<T>(items: T[], n: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}
