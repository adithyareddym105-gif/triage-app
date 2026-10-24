# Support Triage App

Next.js + TypeScript app: chat with memory, support-ticket triage (LLM / decision model / both),
smoke test runner, and an `/admin` page.

## Run it

```bash
npm install
cp .env.example .env.local     # then fill in LLM_API_KEY (Gemini) and DM_API_KEY
# copy the dataset files into data/ (see data/README.md)
npm run dev                    # http://localhost:3000
```

Requires Node.js 20.9+. Keys are only read on the server and never sent to the browser.

## What is where

| Feature | Where |
|---|---|
| Chat with history (client resends the whole history; `system` role rejected with 400) | `app/api/chat/route.ts`, `components/Chat.tsx` |
| Triage v1/v2 (prompt versioned, JSON output checked with Zod, 1 retry) | `lib/prompt.ts`, `lib/triage.ts`, `app/api/triage/route.ts` |
| F1 JSON schema + Zod (request and response) | `lib/schemas.ts` (JSON Schemas served at `/api/schema`) |
| F2 token usage on each result | `components/Triage.tsx` |
| F3 smoke test runner | `app/api/smoke/route.ts`, `components/SmokeTest.tsx` |
| F4 run log + `/admin` | `lib/runs.ts` (`data/runs.json`), `app/admin/page.tsx` |
| DM assignment (strategy `llm` / `dm` / `dm+llm`) | `lib/dm.ts`, `lib/triage.ts` |
| Report | `LLM-DM-report.md` |
| Experiments log | `EXPERIMENTS.md` |

F5 (optional) is not implemented.
