"use client";
import { useState } from "react";
import { postJson } from "@/lib/clientUtils";

type Msg = { role: "user" | "assistant"; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    try {
      // The API is stateless: the whole history is sent every time.
      const data = await postJson("/api/chat", { messages: next });
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setInput("");
    } catch (e: any) {
      setError(e.message); // previous messages and the typed text are kept so the user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Chat (with memory)</h2>
      <div className="msgs">
        {messages.length === 0 && <span className="muted">Ask something. Try: “My name is X” then “What is my name?”</span>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.content}</div>
        ))}
      </div>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <div style={{ flex: 4 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" />
        </div>
        <div style={{ flex: 0, minWidth: 90 }}>
          <button className="primary" onClick={send} disabled={busy}>{busy ? "…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
