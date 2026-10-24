"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunRecord } from "@/lib/runs";

export default function Admin() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs))
      .catch(() => setError("Could not load the runs."));
  }, []);

  return (
    <main>
      <h1>Admin — smoke test runs</h1>
      <nav><Link href="/">← Back to the app</Link></nav>
      {error && <div className="err">{error}</div>}
      {!runs && !error && <p className="muted">Loading…</p>}
      {runs && runs.length === 0 && <p className="muted">No run logged yet. Start a smoke test from the main page.</p>}
      {runs && runs.length > 0 && (
        <div className="card wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Dataset</th><th>N</th><th>Strategy</th><th>Model</th><th>Prompt</th>
                <th>Accuracy cat / prio / both</th><th>Outcomes ok / invalid / error</th><th>Mismatches cat / prio</th>
                <th>Latency avg / p95</th><th>Cost</th><th>Tokens in / out</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.dataset}</td>
                  <td>{r.sample_size}</td>
                  <td>{r.strategy}</td>
                  <td>{r.model}</td>
                  <td>{r.prompt_version}</td>
                  <td>{r.accuracy ? `${(r.accuracy.category * 100).toFixed(0)}% / ${(r.accuracy.priority * 100).toFixed(0)}% / ${(r.accuracy.both * 100).toFixed(0)}%` : "n/a (unlabelled)"}</td>
                  <td>{r.outcomes.ok} / {r.outcomes.invalid_output} / {r.outcomes.error}</td>
                  <td>{r.mismatches ? `${r.mismatches.category} / ${r.mismatches.priority}` : "n/a"}</td>
                  <td>{r.latency.avg_ms} / {r.latency.p95_ms} ms</td>
                  <td>${r.cost_usd.toFixed(5)}</td>
                  <td>{r.tokens.input} / {r.tokens.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
