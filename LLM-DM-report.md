# LLM vs Decision Model — Report

## 1. Decision model research

Goal: a **free** hosted decision model (limited usage accepted). Options found (course slides, "Who offers which endpoint?", plus the providers' own pages, checked 23 Oct 2026):

| Provider | Model | Endpoint | Access | Free hosted API? |
|---|---|---|---|---|
| vLLM Semantic Router | Decision 3.0 (`vllm-sr/d3-turbo`, `d3-flash`, `d3-mini`, `d3-nano`, `d3-lite`, `d3-edge`) | `POST /v1/systemone` (`/v1/decisions` is the same endpoint) on `decision.vllm-sr.ai` | Key in one click, no account | **Yes (free)** |
| OpenAI | Decisions API (GPT-6 Luna) | `POST /v1/decisions` | Public beta since 6 Oct | No evidence of a free tier (paid API) |
| TypeSafe AI | Jev (System One) | `POST /v1/systemone` | Early access since 15 Sep; signups paused 22 Sep | No |
| OpenRouter | Jev (`typesafe/jev-1.13`) | `/api/alpha/decisions`, `/api/v1/systemone` | Input tokens charged | No (paid) |
| Cloudflare | Clef, Clef-flash | not confirmed | Open weights (Apache 2.0) | Not confirmed (would have to be self-hosted) |
| Perplexity | pplx-decider-v1-27b | not confirmed | Decisions API, open weights | Not confirmed |
| AWS | Strands Decider | n/a | Open source | No hosted API (self-host) |
| Liquid AI | d1 | not confirmed | Hosted API only | Not confirmed |
| Anthropic | none found | — | — | — |

**Selected: vLLM Semantic Router Decision 3.0, model `vllm-sr/d3-turbo`.** Why:

- It is the only option I found that is **both hosted and free**, with a key obtained instantly and no account or paid plan.
- Its request format is the System One format from the course (`state` + typed `questions`, `choice` / `noul` / `score`), so it fits the "intelligent switch statement" idea: triage category and priority are closed sets known in advance.
- It returns a probability per option and a `confidence`, which allows acting on confidence (threshold → fallback to the LLM).
- Billing and speed fit the use case: input tokens only, `output_tokens` is always 0, and several questions are answered in one call.
- Caveats: the free service has rate limits and a daily quota; **every request may be logged and used for training** (no sensitive data — our tickets are synthetic); model names changed within days (`d3` is now an alias of `d3-turbo`), so the model id is configurable (`DM_MODEL`).

## 2. Integration strategy

The front end lets the user choose the strategy for single triage and for the smoke test:

1. **`llm`** — Gemini does everything (category, priority, summary, action) and returns JSON validated with Zod (one retry if invalid).
2. **`dm`** — the decision model answers two `choice` questions (category, priority) in a single call. It cannot write, so summary and suggested action are `null`.
3. **`dm+llm`** — the DM decides category and priority; if its confidence is at least `DM_CONFIDENCE_THRESHOLD` (default 0.7) for both, the LLM only writes the summary and suggested action (the DM labels are passed as already decided). If the DM is not confident, the LLM takes over the entire triage (`decided_by = llm_fallback`).

Why this split: *language models write, decision models choose.* Category and priority are a closed-set decision; the summary and action need text generation. In `dm+llm` the LLM output is also smaller (two fields instead of four), so fewer output tokens.

Safety: the ticket is untrusted text. For the LLM, the `<ticket>` tags are stripped from the input (the TCK-10087 injection closes its own tag) and the system prompt states the trust boundary. For the DM, the answer can only be one of the allowed options, and it is validated by Zod anyway.

Logging: every smoke test run stores strategy, model name (for `dm+llm`: both models), prompt version, accuracy, outcome counts, latency, tokens and cost; `/admin` lists them.

Cost: LLM cost uses `LLM_PRICE_IN_PER_M` / `LLM_PRICE_OUT_PER_M` (defaults are the Gemini 2.5 Flash list prices; the free tier actually bills $0). The free DM is priced at `DM_PRICE_IN_PER_M` (default 0).

## 3. Results

**Data caveat:** the official labelled 100 and 500-ticket datasets were not available to me, so the smoke tests use *synthetic* tickets generated from templates (`data/generate_synthetic.py`). Their labels follow the same rules as the prompt, so accuracy is probably higher than on real tickets. Treat the numbers as a demonstration of the pipeline, not as official results.

Setup: labelled set, **10 random tickets per run** (a different random sample each time), prompt `triage-v2`, 24 Oct 2026. Numbers are copied from `/admin`.

| Strategy | Model | N | Category acc. | Priority acc. | Both | ok / invalid / error | Avg latency | p95 latency | Cost (10 tickets) | Tokens in / out |
|---|---|---|---|---|---|---|---|---|---|---|
| `dm` | vllm-sr/d3-turbo | 10 | 100 % | 80 % | 80 % | 10 / 0 / 0 | 1,098 ms | 1,935 ms | $0.00000 | 2,830 / 0 |
| `llm` | gemini-3.5-flash-lite | 10 | 100 % | 90 % | 90 % | 10 / 0 / 0 | 3,816 ms | 5,619 ms | $0.00301 | 4,346 / 683 |
| `dm+llm` | vllm-sr/d3-turbo + gemini-3.5-flash-lite | 10 | 100 % | 100 % | 100 % | 10 / 0 / 0 | 3,262 ms | 6,088 ms | $0.00242 | 5,456 / 654 |

Three earlier `llm` runs with `gemini-3.5-flash` are also in `/admin` (40–60 % accuracy, 4–6 errors out of 10). They are **excluded from the comparison**: every error was an HTTP 429 (free-tier rate limit), not a wrong answer, and the tickets that did go through had 0 category mismatches. I fixed it by switching to the lite model and by sending one ticket at a time with a pause (`SMOKE_DELAY_MS`).

Cost is an estimate: the LLM price per million tokens comes from `LLM_PRICE_IN_PER_M` / `LLM_PRICE_OUT_PER_M` (defaults are Gemini 2.5 Flash list prices, not the lite model's), and the Gemini free tier is actually billed $0. The DM is billed $0 on the free API.

## 4. Analysis

**Accuracy.** All three strategies got every *category* right on these 10 tickets. The differences are on *priority*: `dm` 80 %, `llm` 90 %, `dm+llm` 100 %. With N = 10 and a different random sample in each run, a difference of one or two tickets is **not statistically meaningful**; I cannot claim that `dm+llm` is better than `llm`. What the runs do show: in the `dm` run, the two priority mismatches were low-impact French requests (a password reset and a billing-address change) rated `medium` instead of `low`. This fits the course warning that a typed answer constrains the shape, not the judgment: priority is a judgment about business impact and the DM is less reliable on it than on category. The one `llm` priority error was a feature request rated `low` instead of `medium` ("Scheduled email reports"), an arbitrary boundary case.

**Latency.** The decision model alone is about 3 times faster than the LLM (about 1.1 s vs 3.8 s on average, p95 1.9 s vs 5.6 s). This is the same order of magnitude as the vendor-reported figures in the slides (about 0.2 s vs 1–2 s), but slower in absolute terms: the free service is shared, and my measurements include network time from my laptop. `dm+llm` is not slower than `llm` here (3.3 s vs 3.8 s) because the LLM answer is shorter (2 fields instead of 4); the p95 is a little higher (6.1 s) because two sequential calls are made.

**Cost and tokens.** `dm` costs nothing and generates 0 output tokens. `dm+llm` cost about 20 % less than `llm` in my estimate ($0.00242 vs $0.00301 for 10 tickets) even though it sends more input tokens, because the LLM writes less output and output tokens are the expensive ones. At 1,000 tickets that is about $0.24 vs $0.30 with these assumed prices: small in absolute terms, but the direction matches the slides.

**Reliability.** Once the rate limit was handled, no strategy produced an invalid or failed result (10 ok in each run). The `gemini-3.5-flash` free tier was the weak point of the project: its 429 errors cost three runs. The DM free API had no failure in my runs, but it also has per-minute budgets, a daily quota, and logs requests for model training, so it is fine for synthetic tickets and not for confidential ones.

**Calibration.** I did not measure it. The DM returns a probability and a confidence (for example 1.00 for the category and 0.81 for the priority on a billing ticket), which `dm+llm` uses with a 0.7 threshold to fall back to the LLM. To evaluate calibration, I would need many more tickets and compare confidence on right vs wrong answers, as the slides suggest (87 % confidence vs 75 % accuracy in an independent test).

**Which strategy would I choose?**
- `dm`: routing and filtering at high volume or with latency constraints, where nobody needs a written summary and a human reviews low-confidence cases.
- `dm+llm`: my choice for this triage app, because the agent needs a summary and a suggested action, the closed-set decisions (category, priority) go to the cheaper and faster model, and the LLM still covers uncertain tickets through the confidence fallback.
- `llm`: when labels change often, when reasoning on unusual tickets matters, or when only one provider can be integrated.

**Limits of this evaluation.** Only 10 tickets per run and one run per strategy; random samples differ between runs; tickets are synthetic and labelled by the same rules as the prompt; LLM output varies from run to run; costs are estimates from assumed prices; vendor speed and price claims were not independently verified. A fair next step is to run all three strategies on the *same* 50–100 tickets of the official labelled set.
