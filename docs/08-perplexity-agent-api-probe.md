# Perplexity Agent API Probe Record

Live-probe record backing the Perplexity runner implementation (`[BE] [CO-002]`
follow-up). Three production calls were made on 2026-09-22 with the real key
against `preset: "low"` + `model: "perplexity/sonar"` — the locked baseline
configuration — plus the explicit `tools` variant. Total measured spend:
$0.01305. Everything below is measured, not assumed from docs.

Official sources used for cross-checking:
https://docs.perplexity.ai/docs/agent-api/quickstart ·
https://docs.perplexity.ai/docs/agent-api/presets ·
https://docs.perplexity.ai/docs/getting-started/pricing ·
https://docs.perplexity.ai/api-reference/agent-post

## Endpoint and Request Shape

The official TypeScript SDK (`@perplexity-ai/perplexity_ai` 0.38.5) sends
`client.responses.create()` to `POST https://api.perplexity.ai/v1/responses`
(`dist/client.js:54` base URL, `dist/generated/api.js:141` path). `/v1/responses`
is the documented alias of `/v1/agent`; both are production-valid.

Accepted request (HTTP 200, `status: "completed"` on all three probes):

```json
{
  "preset": "low",
  "model": "perplexity/sonar",
  "tools": [{ "type": "web_search" }],
  "input": "user prompt"
}
```

- `preset` + explicit `model` override combine cleanly; the response echoes
  `model: "perplexity/sonar"`.
- Explicit `tools` merge with preset tools per-tool (documented preset
  behavior, verified live).
- System prompt belongs in the top-level `instructions` param (verified as an
  accepted top-level field), not a fabricated `role: "system"` input item.

## Response Schema (measured)

Top level is OpenAI-Responses-compatible: `id`, `object: "response"`,
`status` (`"completed"`), `error` (`null` or object), `incomplete_details`,
`model`, `output`, `instructions`, `usage`, `tools`, `tool_choice`, `reasoning`,
`text`, `metadata`, `store`, `previous_response_id`, `service_tier`, plus
sampling fields.

`output[]` item types observed:

| Item type | Shape | Notes |
|-----------|-------|-------|
| `search_results` | `{ queries: string[], results: [{ date, id, last_updated, snippet, source, title, url }] }` | One item **per search batch**; a 2-search run returned 2 items (15 results each). Absent entirely when the model answers without searching (verified: trivial query, zero search items). |
| `message` | `{ role: "assistant", status, content: [{ type: "output_text", text, annotations, logprobs }] }` | The answer text. |

Critical: **`annotations` were empty (`[]`) in every probe, including fully
cited search-grounded answers.** Text-content annotations are not the citation
carrier in this configuration. Citations come from `search_results` (and
`fetch_url_results`) output items. A completed, valid answer can have no search
items at all, so "any `search_results` item present" is the correct
`citationPresent` signal — never "exactly one".

## Usage → TokenUsage Transform

Measured `usage` (2-search probe):

```json
{
  "input_tokens": 11575,
  "input_tokens_details": { "cache_creation_input_tokens": 6296, "cache_read_input_tokens": 5270, "cached_tokens": 5270 },
  "output_tokens": 227,
  "output_tokens_details": { "reasoning_tokens": 28 },
  "tool_calls_details": { "search_web": { "cost_usd": 0.005, "invocation": 2 } },
  "total_tokens": 11802,
  "cost": {
    "cache_creation_cost": 0.00157, "cache_read_cost": 0.00033,
    "input_cost": 0, "output_cost": 0.00057,
    "tool_calls_cost": 0.005,
    "tool_calls_cost_details": { "search_web": 0.005 },
    "currency": "USD", "total_cost": 0.00747
  }
}
```

Mapping into the shared `TokenUsage` (`server/services/ai-usage-metrics.ts`):

| TokenUsage field | Source | Notes |
|------------------|--------|-------|
| `inputTokens` | `usage.input_tokens` | Verbatim. |
| `outputTokens` | `usage.output_tokens` | Verbatim, reasoning included (see warning). |
| `cacheReadTokens` | `usage.input_tokens_details.cached_tokens` | Absent → treat as 0 (probe 1 pattern). |
| `cacheWriteTokens` | `usage.input_tokens_details.cache_creation_input_tokens` | Absent → 0. |
| `thinkingTokens` | **do not set** | See warning below. |

### Warning: `reasoning_tokens` is inside `output_tokens`

`reasoning_tokens` is a subset breakdown, not additive. Proof: probe totals add
exactly — 1435 + 46 = 1481 and 5491 + 685 = 6176 (both equal the API's
`total_tokens`; if reasoning were separate they would not). Same convention as
OpenAI's `completion_tokens_details.reasoning_tokens`.

The project's cost formula (`computeCostMicroUsdFromRate`, line 116) charges
`(outputTokens + thinkingTokens) × outputPerMTok`. Mapping
`reasoning_tokens → thinkingTokens` while also keeping the full
`output_tokens` would **double-bill reasoning**. The only provider that
legitimately sets `thinkingTokens` separately is Gemini, because Gemini reports
`thoughtsTokenCount` outside `candidatesTokenCount`. For Perplexity — as with
Anthropic — keep `thinkingTokens` unset and use `output_tokens` verbatim.

## Tool Cost Semantics (measured)

- `tool_calls_details.{tool}.invocation` = execution count (2 in the forcing probe).
- `tool_calls_details.{tool}.cost_usd` and `tool_calls_cost_details.{tool}` are
  **aggregates for that tool**: 2 invocations × $0.0025 = $0.005. Verified
  against the documented fixed web_search unit price.
- `usage.cost.tool_calls_cost` is the cross-tool sum; `usage.cost.total_cost`
  is the exact whole-request cost.

Consequence: token-only `computeCostMicroUsd` undercounts every searched
request by ~$0.0025 because `TokenUsage` has no tool-cost field. Exact metering
via `usage.cost.total_cost` remains available for the cost-cap ticket.

## Pricing Entry Implications

`DEFAULT_AI_MODEL_PRICING.perplexity["perplexity/sonar"]` must carry input,
output, cache-read **and cache-write** rates: the sonar run billed
`cache_creation_cost` (6296 write tokens) and reached `input_cost: 0` purely
from cache reads + writes. Do not derive rates from single probes (rounding);
transcribe from the official pricing page.

The preset ships a `prompt_cache_key`, so cache hits are real: probe 2 and 3
both got thousands of `cached_tokens`. Expect a ~1.4k-token fixed prompt
overhead per request even for trivial inputs.

## Affected References

- `server/llm-runner.ts` — `runPerplexity()` consumes everything above
- `shared/ai-usage.ts` — `AI_PROVIDERS` union + `"perplexity"`
- `server/services/ai-usage-metrics.ts` — `usageFromPerplexity()` mapping table
- `server/config/system-config-defaults.ts` — sonar pricing entry incl. cache write
- `migrations/0011_add_perplexity_sonar_pricing.sql` — seeds the sonar subtree into provisioned DB snapshots
- `.env.example`, `server/test-llm-apis.ts` — key presence + smoke test

## Formula Reproduction vs Provider Bill (2026-09-22, SDK call)

Live SDK call (`responses.create`, preset low + sonar + explicit `web_search`,
2 searches, `status: "completed"`) replayed through our own
`normalizeTokenUsage` + `computeCostMicroUsdFromRate` with the website rates
(input $0.25/M, output $2.50/M, cache-read $0.0625/M, cache-write = input rate
$0.25/M — not published, derived and verified):

| Component | Ours | Theirs |
|---|---|---|
| uncached input (9 tok × $0.25/M) | $0.00000225 | `input_cost: 0` (rounds) |
| cache read (5182 × $0.0625/M) | $0.00032387 | `cache_read_cost: 0.00032` |
| cache write (6149 × $0.25/M) | $0.00153725 | `cache_creation_cost: 0.00154` |
| output (190 × $2.50/M) | $0.00047500 | `output_cost: 0.00048` |
| tool calls | n/a (unmodeled) | `tool_calls_cost: 0.005` |
| **Total** | **7338 µUSD + 5000 tool** | **7340 µUSD** |

Delta: **−2 micro-USD (0.0002 cents) — rounding-level match.** Our formula
reproduces their bill exactly when the sonar `ModelRate` sets
`cacheWritePerMTok` explicitly to the input rate ($0.25/M). With it omitted,
the calculator's `1.25× input` fallback overbills cache writes by +383 µUSD
(~5.2%) on this shape — the pricing entry must set it explicitly.
Resolved 2026-09-22: `DEFAULT_AI_MODEL_PRICING.perplexity["perplexity/sonar"]`
now carries the explicit `cacheWritePerMTok: 0.25` (schema-validated).

`reasoning_tokens` (12 of 190 output) is again inside `output_tokens`; their
`output_cost` bills the full 190 at output rate, confirming `thinkingTokens`
stays unset.

Decision consequence: token-based cost with correct rates reproduces the
provider bill for token components, so `computeCostMicroUsd` remains a valid
shadow bill; provider `usage.cost.total_cost` should be persisted as billed
truth for actuals (tool costs included), while estimation stays token ×
current-rate (see Knowledge Log).

## Deriving an Unpublished Rate: Component Elimination

Method used to obtain the sonar cache-write rate, general enough to reuse for
any provider that itemizes billed cost components (Perplexity `usage.cost.*`,
future OpenAI GPT-5.6+ `cache_write_tokens`) without publishing the rate:

1. **Eliminate knowns from the itemized bill.** When the provider itemizes
   each component, the residual after removing all components whose rates are
   published is the unknown component:
   `0.00747 total − 0 input − 0.00033 cache-read − 0.00057 output − 0.005 tool
   = 0.00157 residual` — exactly the `cache_creation_cost` item.
2. **Divide by the component's token count.**
   `0.00157 ÷ 6296 cache-creation tokens × 1e6 = $0.2494/M`.
   (When the component is itemized directly, this division alone suffices —
   the residual step is the general form that works even when the component
   is only reachable by subtraction from the total.)
3. **Snap to the round-number hypothesis.** $0.2494 ≈ $0.25 = exactly the
   published input rate → hypothesis: *cache creation bills at the plain
   input rate; cache reads at input/4.*
4. **Forward-verify on an independent bill.** Reproduce the NEXT request's
   billed total with the derived rate — the SDK-call reproduction above
   matched to −2 µUSD. A derived rate that has not reproduced a second,
   independent bill is a guess, not a rate. Ship only verified rates, and
   mark them "derived, verified" in comments since they are not published.

## Pricing Seed Mechanics (why migration 0011 exists)

`DEFAULT_AI_MODEL_PRICING` alone is not enough for provisioned databases:
system-config boot seeding snapshots code defaults into `system_config` once
(system-config.ts:98), and `getModelPricing` (system-config.ts:216) consults
only that DB snapshot per model — a model absent from the snapshot gets the
generic conservative `ai_pricing_fallback`, never the code default. Fresh
databases inherit the new defaults; every DB seeded before the change needs a
migration. 0011 merges the sonar subtree with `|| jsonb_build_object`
preserving any admin overrides via COALESCE.

Validated live against Neon (read-only SELECT): the `jsonb_set(value,
'{perplexity,"perplexity/sonar"}', ...)` form **silently no-ops** when the
intermediate `perplexity` key is missing — Postgres only creates the final
missing path element (that is why 0010 worked: its `openai` parent already
existed). The `||` subtree-merge form is the correct pattern for adding a
nested key to a snapshot.

## Structured Output (2026-09-22, news-generator probe)

Free-form JSON generation through sonar is **not reliably parseable**: the
first news-article probe produced malformed JSON (invalid token deep inside a
~19k-char body — fence-stripping was already applied). The fix is the Agent
API's structured output, verified live:

```json
"response_format": {
  "type": "json_schema",
  "json_schema": { "name": "generated_article", "schema": { ... } }
}
```

(`ResponsesRequestInput.response_format` in the SDK; non-strict schemas — only
must-have fields in `required` — pass fine. Array-length constraints such as
`minItems`/`maxItems` are honored as guidance.) With it, full grounded
articles parse cleanly — measured 50–113s end to end. The news generator's
client timeout is 180s to leave operating margin; the admin route was
verified live end-to-end (201, draft persisted).

Grounded news content carries **no inline source URLs** (0 in body) —
grounding happens at the search level; `search_results` output items are
separate from the article text.

## Inline Citation Markers: `[web:N]` (measured 2026-09-23)

Sonar spontaneously embeds `[web:N]` markers in its prose (observed in
perception-style analysis; 41 markers in one probe, not prompted, not
documented anywhere in the official docs — treat as convention, not contract).
Verified live against a grounded brand analysis:

- **`[web:N]` = 1-based index into the flattened sequence of all
  `search_results` items across batches** (a multi-search response carries one
  `search_results` output item per search invocation — 15+15+15+1+1 here — and
  markers count across the concatenation, batch 0 first).
- Marker numbers may exceed the highest result (43 seen vs 47 flattened —
  keep in range) and are reused (one source cited many times).
- Semantic spot-check of 12 markers: 12/12 mapped to the exact source
  supporting the sentence (model blog post, legal/SLA page, pricing docs,
  G2 review pages, AWS Marketplace listing).
- Visibility-scan answers in the same configuration did NOT emit markers —
  behavior is prompt-style dependent.

Rendering consequence: markers can be converted to citation chips by
flattening `search_results` and linking `N → flat[N-1]` — requires citations
to be persisted alongside the text (currently dropped at the runner boundary;
see CO-002 parse/store ticket).

- `source .env` on the dev machine chokes on a malformed line 17 (unquoted
  value; shell executed it as a command). Fix quoting; node `--env-file` may
  tolerate it but shell sourcing does not.
- npm install of the SDK on this machine times out (node egress ETIMEDOUT
  while curl works); tarball-offline install was used. Manifests carry the
  standard registry entry with verified integrity, so other machines are
  unaffected.
