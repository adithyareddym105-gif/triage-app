"use client";
import { useState } from "react";
import Link from "next/link";
import { postJson } from "@/lib/clientUtils";
import type { RunRecord } from "@/lib/runs";

type Row = {
  ticket_id: string; subject: string; outcome: string;
  predicted: { category: string; priority: string } | null;
  expected: { category?: string; priority?: string } | null;
  category_match: boolean | null; priority_match: boolean | null;
  latency_ms: number; tokens: { input: number; output: number; total: number };
  decided_by: string | null; error: string | null;
};

export default function SmokeTest() {
  const [dataset, setDataset] = useState("labelled100");
  const [sample, setSample] = useState(10);
  const [strategy, setStrategy] = useState("llm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ run: RunRecord; rows: Row[] } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      setOut(await postJson("/api/smoke", { dataset, sample: Number(sample), strategy }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const labelled = out?.run.dataset === "labelled100";

  return (
    <div className="card">
      <h2>Smoke test</h2>
      <div className="row">
        <div>
          <label>Dataset</label>
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            <option value="labelled100">Labelled 100 tickets</option>
            <option value="tickets500">500 tickets (no labels)</option>
          </select>
        </div>
        <div>
          <label>Random sample size</label>
          <input type="number" min={1} max={500} value={sample} onChange={(e) => setSample(Number(e.target.value))} />
        </div>
        <div>
          <label>Strategy</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="llm">llm</option>
            <option value="dm">dm</option>
            <option value="dm+llm">dm+llm</option>
          </select>
        </div>
        <div style={{ flex: 0, minWidth: 120 }}>
          <button className="primary" onClick={run} disabled={busy}>{busy ? "Running…" : "Run smoke test"}</button>
        </div>
      </div>
      {busy && <p className="muted">Running… the free Gemini tier is rate limited, so keep samples small (10–20) with the llm strategies.</p>}
      {error && <div className="err">{error}</div>}

      {out && (
        <div style={{ marginTop: 16 }}>
          <h2>Summary</h2>
          <div className="grid">
            <div className="stat">Tickets<b>{out.run.sample_size}</b></div>
            <div className="stat">OK / invalid / error<b>{out.run.outcomes.ok} / {out.run.outcomes.invalid_output} / {out.run.outcomes.error}</b></div>
            {labelled && out.run.mismatches && out.run.accuracy && (
              <>
                <div className="stat">Category mismatches<b className={out.run.mismatches.category ? "bad" : "good"}>{out.run.mismatches.category}</b></div>
                <div className="stat">Priority mismatches<b className={out.run.mismatches.priority ? "bad" : "good"}>{out.run.mismatches.priority}</b></div>
                <div className="stat">Accuracy (cat / prio / both)<b>{(out.run.accuracy.category * 100).toFixed(0)}% / {(out.run.accuracy.priority * 100).toFixed(0)}% / {(out.run.accuracy.both * 100).toFixed(0)}%</b></div>
              </>
            )}
            <div className="stat">Avg latency<b>{out.run.latency.avg_ms} ms</b></div>
            <div className="stat">Cost<b>${out.run.cost_usd.toFixed(5)}</b></div>
            <div className="stat">Tokens (total)<b>{out.run.tokens.total}</b></div>
            <div className="stat">Model<b style={{ fontSize: ".85rem" }}>{out.run.model}</b></div>
          </div>
          <p className="muted">Run logged. <Link href="/admin">See /admin</Link></p>

          <div className="wrap" style={{ maxHeight: 520, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th><th>Subject</th><th>Predicted cat.</th><th>Predicted prio.</th>
                  {labelled && (<><th>Labelled cat.</th><th>Labelled prio.</th></>)}
                  <th>Latency</th><th>Tokens (in/out)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {out.rows.map((r) => (
                  <tr key={r.ticket_id}>
                    <td>{r.ticket_id}</td>
                    <td>{r.subject}</td>
                    <td className={r.category_match === false ? "bad" : ""}>{r.predicted?.category ?? "—"}</td>
                    <td className={r.priority_match === false ? "bad" : ""}>{r.predicted?.priority ?? "—"}</td>
                    {labelled && (<><td>{r.expected?.category ?? "—"}</td><td>{r.expected?.priority ?? "—"}</td></>)}
                    <td>{r.latency_ms} ms</td>
                    <td>{r.tokens.input}/{r.tokens.output}</td>
                    <td>{<span className="bad">{r.outcome}: {r.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
