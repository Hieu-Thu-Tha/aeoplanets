<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Aeostarsinsight** (5503 symbols, 13590 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Aeostarsinsight/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Aeostarsinsight/clusters` | All functional areas |
| `gitnexus://repo/Aeostarsinsight/processes` | All execution flows |
| `gitnexus://repo/Aeostarsinsight/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Knowledge Persistence (all agent sessions)

Any agent session that discovers durable project knowledge — verified API behavior, integration quirks, conventions, decisions and their rationale — MUST append a dated one-line entry to the **Project Knowledge Log** section at the end of this file before ending the session, and write the full finding into a dedicated `docs/NN-*.md` file when it deserves more than one line. Entries are append-only: never delete or rewrite existing ones. Never record secrets, credentials, or customer-specific data.

## Project Knowledge Log

- 2026-09-22 Perplexity integration: official SDK `@perplexity-ai/perplexity_ai` 0.38.5 installed (manifests carry registry entry, integrity-verified). Probe findings in `docs/08-perplexity-agent-api-probe.md` — response schema, TokenUsage mapping, `reasoning_tokens ⊂ output_tokens` (never map it to `thinkingTokens`), tool-cost aggregates, `annotations` always empty (use `search_results` items for citations).
- 2026-09-22 npm on this machine ETIMEDOUTs on node egress (curl works) — install via tarball-offline when adding packages here.
- 2026-09-22 Formula reproduction verified: our `computeCostMicroUsdFromRate` + website rates matches Perplexity's `usage.cost.total_cost` to −2 µUSD, IF the sonar pricing entry sets `cacheWritePerMTok = 0.25` explicitly (omitting it triggers the 1.25× fallback → ~5% overbill). Cache-write rate = input rate; not published, derived. Estimation stays token × current-rate; provider-billed `usage.cost.total_cost` is for actuals only. See `docs/08`.
- 2026-09-22 Sonar pricing entry added to `DEFAULT_AI_MODEL_PRICING.perplexity` with explicit `cacheWritePerMTok: 0.25` (schema-validated; `npm run check` errors pre-existing, none from this change). Same trap applies to any future provider reporting cache writes but billing ≠ Anthropic's 1.25× (OpenAI GPT-5.6+ already reads `cache_write_tokens`).
- 2026-09-22 AI pricing changes need code default AND migration: system-config boot-seeds a one-time snapshot of `DEFAULT_AI_MODEL_PRICING` into `system_config`; `getModelPricing` consults only that DB snapshot per model (absent model → generic fallback, never code default). Also: `jsonb_set` with a nested path silently no-ops when an intermediate key is missing (only the final element is created) — add nested keys with `|| jsonb_build_object` subtree merge (validated live, see `docs/08` + `migrations/0011`).
- 2026-09-22 Perplexity runner implemented (commits d48351a..24aa36f): `runPerplexity` in `server/llm-runner.ts` — `preset: "low"` + `model: "perplexity/sonar"`, 120s client timeout, `instructions` param for system prompt, `citationPresent` from structured `search_results`/`fetch_url_results` items only, `thinkingTokens` never set. Wired unconditionally into `runPromptAcrossModels` (default map) — weekday rotation untouched. Runner-path smoke verified live: 4/4 providers through `runPromptAcrossModels`, perplexity result `rawResponse: "The capital of France is Paris."`. `npm run check` has 48 pre-existing errors (none from this work); unit suite 101/101.
- 2026-09-22 Perplexity surfaces expanded: perception analyzer now runs 3 engines (it was secretly 2 — `getPerceptionFromAnthropic` was dead code, left unwired); news generator swapped to grounded `perplexity/sonar` (gpt-4o-mini had zero web access). Free-form JSON from sonar is unparseable without `response_format: { type: "json_schema" }` structured output (verified live, docs/08). Text aggregation shared via `server/services/perplexity-output.ts`. Brand/competitor research deliberately NOT Perplexity-fied — already web-grounded via Gemini `googleSearch`; parked pending product clarification.
- 2026-09-23 Sonar `[web:N]` inline citation markers verified live (docs/08): 1-based index into the flattened cross-batch `search_results` sequence, 12/12 semantically correct, emitted spontaneously in analysis-style prompts (not in scan-style). Rendering them requires persisting citations — currently dropped at the runner boundary (CO-002 storage ticket, cross-provider jsonb recommended).
- 2026-09-25 Page guide popover video: hover close is controlled in `PageHeading`; native video uses play/pause/end events, while YouTube embeds require `enablejsapi=1` and the IFrame Player API to report play/pause/end so the popover stays open during playback.
- 2026-09-26 Generic Postgres: `server/db.ts` now uses `pg` Pool + `drizzle-orm/node-postgres` (no Neon websocket/ws shim); `pg` moved to dependencies; advisory lock in `stripe-routes.ts` keeps `pool.connect()` since `pg_advisory_lock` is session-scoped and must lock/unlock on one connection.
- 2026-09-28 DataForSEO live cost probe (3 paid tasks, ~$0.008): AI Mode live/advanced bills $0.004/task (matches config); organic live/advanced with depth 10 + `load_async_ai_overview` bills $0.002/task with or without an overview surface present (overview default corrected 5_000 → 2_000 micro-USD). Organic `depth` is now sent explicitly as 10 in `requireRequest`; the AI Mode request model has no depth parameter (vendor default applies). SDK serializes unset optional crawl fields as explicit nulls — payload assertions must include them.
- 2026-09-29 FAKE_AI stress mode (branch `feature/fake-ai-stress-mode`, docs/09): `FAKE_AI=1` swaps every AI provider call for `setTimeout` delay + deterministic schema-valid fixtures (`server/services/fake-ai.ts`, never imports SDKs). Visibility fakes run through the real `extractInfo`; tickets reuse rule-based fallback; reports keep real metrics; weakness refreshes still write `ai_cache`. Bypasses `executeAiCall` (no usage rows/quota burn). Knobs: `FAKE_AI_DELAY_MS` (default 120), `MIN/MAX_MS` range, `FAKE_AI_ERROR_RATE` chaos. Keyless-safe except OpenAI SDK constructor throws without key — volume route fakes before constructing. GoogleGenAI constructor tolerates missing key. `npx tsc` error set identical before/after; unit suite 189/189 incl. 16 new fake-ai tests. Fake rows identifiable via `FAKE_AI` marker + `*.example.com` domains.

## Project Docs Index

- `docs/01-architecture-overview.md` — system architecture
- `docs/02-data-flow-diagram.md` — data flow
- `docs/03-third-party-dependencies.md` — third-party dependencies
- `docs/04-known-limitations-and-risks.md` — known limitations and risks
- `docs/05-stripe-billing.md` — Stripe billing
- `docs/07-openai-search-model-migration.md` — OpenAI search model migration
- `docs/08-perplexity-agent-api-probe.md` — measured Perplexity Agent API record: endpoint, request/response schema, usage→TokenUsage mapping, tool-cost semantics, pricing implications
- `docs/09-fake-ai-stress-mode.md` — FAKE_AI zero-token harness: env knobs, per-feature coverage, what stays real, verification record
