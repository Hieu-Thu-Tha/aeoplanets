# FAKE_AI stress-test mode

Zero-token harness for load/stress testing. When `FAKE_AI=1`, every AI call
site sleeps an artificial delay (`setTimeout`, standing in for network +
inference latency) and returns synthetic data that already satisfies the
caller's expected response schema. No provider SDK is touched, no tokens are
spent, no `ai_usage_logs` rows are written, and no API keys are required.

## Enablement

```bash
FAKE_AI=1 FAKE_AI_DELAY_MS=50 npm run dev
```

| Variable | Default | Meaning |
|---|---|---|
| `FAKE_AI` | off | Master switch. Accepts `1`, `true`, `yes`, `on` (case-insensitive). |
| `FAKE_AI_DELAY_MS` | `120` | Fixed artificial latency (ms) per faked AI call. `0` for max throughput. |
| `FAKE_AI_DELAY_MIN_MS` / `FAKE_AI_DELAY_MAX_MS` | unset | When both are set, sleep a uniform random duration in `[min, max]` instead — simulates realistic latency spread under load. |
| `FAKE_AI_ERROR_RATE` | `0` | `0..1` fraction of fake calls that throw a transient-style `Error`, exercising caller retry/fallback paths (ticket consolidation degrades to rule-based grouping exactly like a real AI failure). |

Central module: `server/services/fake-ai.ts`. It must never import a
provider SDK (type-only imports only), so fake mode loads keyless.

## Coverage (all fake branches check `isFakeAiEnabled()` first)

- Visibility scans: `runOpenAI`, `runAnthropic`, `runGemini`, `runPerplexity`.
  Fake prose is parsed by the **real** `extractInfo`, so
  appeared/position/sentiment/competitors/citation vary deterministically per
  prompt (one variant deliberately omits the brand to exercise `appeared=false`).
- Perception (3 engines), coverage gaps, readability batch + single checks,
  news articles (exactly 3 questions / 5 takeaways, passing the generator's
  own validation), ticket consolidation (reuses the rule-based fallback),
  report narratives (metrics stay computed from real DB rows), volume
  estimates, discovered competitors, weakness refreshes (still write
  `ai_cache`), brand/competitor research, benchmark summaries, confusion
  explanations, fix suggestions, question generation.

## What stays real in fake mode

- Postgres reads/writes (visibility runs, profiles, tickets, caches) — a
  fake full scan still exercises storage, batching (`BATCH_SIZE`), and the
  analysis fan-out end to end.
- Job admission/reservation lifecycle (zero-call admissions finalize normally).
- Readability HTTP fetches (robots.txt / ai.txt / llms.txt, PageSpeed API,
  homepage fetch) — no token cost, but still network I/O with timeouts.
- DataForSEO has no server call sites yet, so there is nothing to fake there.

## What fake mode does NOT exercise

- Billing: no usage rows, no cost computation, no quota/cap consumption.
  Quota-gated paths (`AiUsageCapExceededError`) will not trigger.
- Provider SDK parsing edge cases (real API shapes, retries, grounding).

## Verifying

- `npm run test:unit` includes `test/unit/server/services/fake-ai.test.ts`
  (16 tests: flag parsing, delay, schema validity of every fixture, and a
  keyless 4-provider runner check with API keys deleted).
- `npx tsc` error set is identical before/after (all pre-existing).
- Live smoke (no keys): `FAKE_AI=1 FAKE_AI_DELAY_MS=10` + dummy
  `DATABASE_URL`, then `runPromptAcrossModels(...)` returns 4/4 providers in
  tens of ms with mixed appeared/sentiment results.

## Example: stress a full brand scan without spending

```bash
FAKE_AI=1 FAKE_AI_DELAY_MS=20 FAKE_AI_DELAY_MAX_MS=... npm run dev
# then trigger scans via the UI/API; watch scanStatus, visibility_runs and
# ai_cache fill with synthetic rows. Re-run with FAKE_AI unset for real data.
```

## Stress driver (`npm run stress:fake` / `scripts/fake-ai-stress.ts`)

Concurrent load driver for the fake paths. Refuses to run unless `FAKE_AI=1`
(exit 1 otherwise), so it can never burn real tokens by accident.

```bash
FAKE_AI=1 FAKE_AI_DELAY_MS=20 npm run stress:fake -- --iterations 50 --concurrency 8
FAKE_AI=1 npm run stress:fake -- --ops scan,news --iterations 100 --concurrency 16
# DB-backed end-to-end scans (needs DATABASE_URL + existing brands):
FAKE_AI=1 DATABASE_URL=... npm run stress:fake -- --ops fullscan --brand-ids 1,2 --iterations 4 --concurrency 2
```

Ops: `scan` (4-provider fan-out with per-result schema validation),
`daily` (rotation), `news` (article validation), `reports` (all three report
types against fabricated metrics), `fixtures` (raw builders), `fullscan`
(real `assessmentEngine.runFullScan`, storage writes included).

Output is a per-op table (count / failures / chaos / mean / p50 / p95 / max)
plus overall ops/s. Failures carrying the `FAKE_AI simulated` chaos marker
are counted separately and do not fail the run; any other failure exits 1.
`parseArgs`/`computeStats` are unit-tested in
`test/unit/server/services/fake-ai-stress.test.ts`.

Fake rows are identifiable: fixture text contains `FAKE_AI`, fake domains
use `*.example.com`, and weakness/review scores cite `FakeReviewSite`.
