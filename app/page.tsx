"use client";
import { useState } from "react";
import Link from "next/link";
import Chat from "@/components/Chat";
import Triage from "@/components/Triage";
import SmokeTest from "@/components/SmokeTest";

const TABS = ["Triage", "Smoke test", "Chat"] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Triage");
  return (
    <main>
      <h1>Support Triage — Kestrel Analytics</h1>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
        <Link href="/admin">Admin</Link>
      </nav>
      {tab === "Triage" && <Triage />}
      {tab === "Smoke test" && <SmokeTest />}
      {tab === "Chat" && <Chat />}
    </main>
  );
}
