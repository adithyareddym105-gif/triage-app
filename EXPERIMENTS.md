# Prompt experiments

| Date | Prompt version | Provider / model | Ticket id | Observed output | Problem noticed | Change made |
|---|---|---|---|---|---|---|
| 2026-10-23 | triage-v1 | gemini-2.5-flash | TCK-10087 | (fill in: run the injection ticket) | Ticket closes its own `</ticket>` tag and tries to give orders | v2: strip `<ticket>` tags from the input + explicit trust-boundary rule in the system prompt |
| | triage-v2 | | | | | |
