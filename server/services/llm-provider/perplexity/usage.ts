import type {
  ResponsesResponseOutput,
  ToolCallDetailsOutput,
} from "@perplexity-ai/perplexity_ai/generated/api";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  type BillableUsage,
  type ExpectedMeter,
  type MeterUsage,
} from "@shared/ai-billing";
import { normalizeTokenUsage, normalizeTokenCount, strictMeterCount } from "../../ai-usage/tokens";

// Probe-verified (docs/08-perplexity-agent-api-probe.md): the Agent API bills
// web_search at a fixed $0.0025 per invocation and reports both the execution
// count and the aggregate billed cost per tool.
function usdToMicroUsd(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1_000_000)
    : undefined;
}

// Two probe-verified response fields the SDK type does not declare yet: the
// per-tool billed cost and the legacy cached_tokens alias on the input
// breakdown. Both are widening-only, so no casts are needed.
type BilledToolCallDetails = ToolCallDetailsOutput & { cost_usd?: number };
type ProbeInputTokensDetails = {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_tokens?: number;
};

export function usageFromPerplexity(
  response: ResponsesResponseOutput,
  expectedMeters: readonly ExpectedMeter[] = [],
): BillableUsage {
  const usage = response?.usage;
  const details: ProbeInputTokensDetails | undefined = usage?.input_tokens_details;
  const searchCalls: BilledToolCallDetails | undefined =
    usage?.tool_calls_details?.search_web;

  return billableUsageSchema.parse({
    tokens: normalizeTokenUsage({
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens: details?.cached_tokens ?? 0,
      cacheWriteTokens: details?.cache_creation_input_tokens ?? 0,
      // reasoning_tokens is a subset of output_tokens (docs/08) — leaving
      // thinkingTokens unset keeps computeTokenCostMicroUsd from
      // double-billing reasoning at the output rate.
    }),
    meters: canonicalizeExpectedMeters(expectedMeters).map((meter): MeterUsage => {
      if (meter.sku !== "perplexity.search_web") {
        throw new TypeError(`Unsupported Perplexity meter: ${meter.sku}`);
      }
      // quantity (invocation count) feeds estimation; a malformed invocation
      // count is a provider contract violation and throws instead of
      // corrupting the estimation history with a coerced zero.
      const quantity = strictMeterCount(
        searchCalls?.invocation,
        "perplexity.search_web invocation",
      );
      const providerCostMicroUsd = usdToMicroUsd(searchCalls?.cost_usd);
      // Billed cost without executions contradicts the invocation count and
      // would silently diverge estimation quantities from billed actuals.
      if (quantity === 0 && providerCostMicroUsd !== undefined && providerCostMicroUsd > 0) {
        throw new TypeError(
          "Perplexity reported web_search cost without matching invocations",
        );
      }
      return {
        ...meter,
        quantity,
        source: "provider_reported",
        ...(providerCostMicroUsd === undefined ? {} : { providerCostMicroUsd }),
      };
    }),
  });
}
