"use client";
import { useState } from "react";
import { postJson } from "@/lib/clientUtils";
import type { TriageResponse } from "@/lib/schemas";

export default function Triage() {
  const [ticket, setTicket] = useState("");
  const [strategy, setStrategy] = useState("llm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<TriageResponse | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      setRes(await postJson("/api/triage", { ticket, strategy }));
    } catch (e: any) {
      setError(e.message); // F1: clear error, never silent
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Triage a ticket</h2>
      <label>Ticket (subject + body)</label>
      <textarea value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Paste the customer ticket here…" />
      <div className="row" style={{ marginTop: 10 }}>
        <div>
          <label>Strategy</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="llm">llm — LLM only</option>
            <option value="dm">dm — decision model only</option>
            <option value="dm+llm">dm+llm — DM decides, LLM writes</option>
          </select>
        </div>
        <div style={{ flex: 0, minWidth: 110 }}>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Triaging…" : "Triage"}</button>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      {res && (
        <div style={{ marginTop: 14 }}>
          <div className="badges">
            <span className="badge">category: <b>{res.result.category}</b></span>
            <span className="badge">priority: <b>{res.result.priority}</b></span>
            <span className="badge">decided by: {res.decided_by}</span>
          </div>
          <p><b>Summary:</b> {res.result.summary ?? <span className="muted">— (a decision model does not write text)</span>}</p>
          <p><b>Suggested action:</b> {res.result.suggested_action ?? <span className="muted">—</span>}</p>
          <div className="grid">
            <div className="stat">Input tokens<b>{res.usage.input_tokens}</b></div>
            <div className="stat">Output tokens<b>{res.usage.output_tokens}</b></div>
            <div className="stat">Total tokens<b>{res.usage.total_tokens}</b></div>
            <div className="stat">Latency<b>{res.latency_ms} ms</b></div>
            <div className="stat">Cost<b>${res.cost_usd.toFixed(6)}</b></div>
          </div>
          {res.dm && (
            <p className="muted">
              DM confidence — category {res.dm.category_confidence.toFixed(2)}, priority {res.dm.priority_confidence.toFixed(2)}
            </p>
          )}
          <p className="muted">model: {res.model} · prompt: {res.prompt_version}</p>
        </div>
      )}
    </div>
  );
}
