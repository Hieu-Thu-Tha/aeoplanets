# AI Metered Usage

Each `ai_usage_logs` row stores one completed provider call. Token counters and
the `meters` JSONB array are written together, and `cost_micro_usd` is their
aggregate list-price cost at call time.

## Meter SKUs

| SKU | Unit | Quantity source |
| --- | --- | --- |
| `openai.web_search` | `call` | One deterministic unit per successful search request |
| `anthropic.web_search` | `search` | `usage.server_tool_use.web_search_requests` |
| `gemini.google_search_grounded_prompt` | `grounded_prompt` | One when a Gemini 2.5 response contains search grounding evidence |
| `gemini.google_search_query` | `query` | Entries in Gemini 3.x `groundingMetadata.webSearchQueries` |
| `perplexity.search_web` | `search_request` | `usage.tool_calls_details.search_web.invocation` |
| `dataforseo.google_ai_mode` | `task` | One deterministic unit per API task (the endpoint has no depth parameter) |
| `dataforseo.google_ai_overview` | `task` | 1 per API task, 2 when a fresh asynchronous overview was generated (see below) |

`ai_meter_pricing` in system config contains one strictly validated rate for
each SKU and unit. Persisted entries snapshot `rateMicroUsd` and
`costMicroUsd`; changing configuration affects future calls and estimation,
not historical audit records.

```json
[
  {
    "sku": "anthropic.web_search",
    "category": "tool",
    "unit": "search",
    "maxQuantity": 3,
    "quantity": 2,
    "source": "provider_reported",
    "rateMicroUsd": 10000,
    "costMicroUsd": 20000
  }
]
```

Search-enabled calls persist zero-quantity meters when the provider performs no
search. This preserves the call profile so token-only and search-enabled jobs
cannot share historical estimates.

Gemini Search grounding content is excluded from billable input tokens.

DataForSEO exposes no token usage: its calls persist zero tokens and the
vendor's reported task cost (`task.cost` in USD, converted to
`providerCostMicroUsd` at the extraction boundary). The AI Overview meter
quantity is 1 or 2 — never a magic middle — because the vendor bills per
10-result SERP unit ($0.002): 1 unit for the base task (cached or absent
overview), plus 1 unit when a fresh asynchronous overview was generated
(the $0.002 async fee, refunded otherwise). The extractor derives this from
the response's `asynchronous_ai_overview` flag (`true` → 2, anything else →
1), so the fixed per-unit rate prices both cases and the P95 estimator
learns the cached/fresh mix from history instead of a compromised average.
AI Mode has no depth parameter and always bills a single flat task.

## Provider-reported cost parity path

Meters may optionally carry `providerCostMicroUsd` — the cost the provider
itself billed for that meter in the response (Perplexity reports it as
`usage.tool_calls_details.search_web.cost_usd`, a fixed $0.0025 per invocation
at the time of the probe). Both pricing flows produce identical downstream
artifacts:

- **Calculated (default)**: `costMicroUsd = quantity × rateMicroUsd` from the
  current `ai_meter_pricing` config.
- **Provider-reported**: when `providerCostMicroUsd` is present, the priced
  meter records it as `costMicroUsd` and snapshots the configured rate
  alongside for audit; the schema invariant switches to
  `costMicroUsd === providerCostMicroUsd`.

Estimation deliberately ignores provider cost: historical derivation strips
`rateMicroUsd`, `costMicroUsd`, and `providerCostMicroUsd`, leaving pure
quantities that are repriced against the NOW-active config at reservation
time. Provider cost is billed actuals truth; config-derived pricing is the
projection substrate.
OpenAI and Anthropic search-result tokens remain represented by their provider
token counters and must not be added again.

## Estimation

Preflight matching uses provider, model, call order, meter SKU, unit, and any
configured maximum quantity. The weighted-P95 algorithm ranks coherent
historical jobs by current token-plus-meter rates, then uses the selected job's
token counts and meter quantities. Stored estimates contain quantities, not
price snapshots, so live pricing changes reprice them without rewriting usage.

Free allowances, credits, negotiated discounts, and invoice adjustments are
not request-level usage. Admission uses provider list prices; invoice
reconciliation remains separate.

## Querying

The GIN index on `ai_usage_logs.meters` supports JSONB containment queries:

```sql
SELECT *
FROM ai_usage_logs
WHERE meters @> '[{"sku":"anthropic.web_search"}]'::jsonb;
```

Provider references:

- https://developers.openai.com/api/docs/pricing#tools
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool#pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/google-search
