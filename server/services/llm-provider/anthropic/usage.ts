import type Anthropic from "@anthropic-ai/sdk";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  type BillableUsage,
  type ExpectedMeter,
  type MeterUsage,
} from "@shared/ai-billing";
import { normalizeTokenUsage, optionalTokenCount, normalizeTokenCount, strictMeterCount } from "../../ai-usage/tokens";

export function usageFromAnthropic(
  response: Anthropic.Message,
  expectedMeters: readonly ExpectedMeter[] = [],
): BillableUsage {
  const usage = response?.usage;
  const uncachedInputTokens = normalizeTokenCount(usage?.input_tokens);
  const cacheReadTokens = normalizeTokenCount(usage?.cache_read_input_tokens);
  const cacheWrite5mTokens = normalizeTokenCount(
    usage?.cache_creation?.ephemeral_5m_input_tokens,
  );
  const cacheWrite1hTokens = normalizeTokenCount(
    usage?.cache_creation?.ephemeral_1h_input_tokens,
  );
  const cacheWriteTokens = Math.max(
    optionalTokenCount(usage?.cache_creation_input_tokens) ?? 0,
    cacheWrite5mTokens + cacheWrite1hTokens,
  );

  return billableUsageSchema.parse({
    tokens: normalizeTokenUsage({
      // Anthropic reports these as three disjoint input categories.
      inputTokens: uncachedInputTokens + cacheReadTokens + cacheWriteTokens,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens,
      cacheWriteTokens,
      cacheWrite1hTokens,
    }),
    meters: canonicalizeExpectedMeters(expectedMeters).map((meter): MeterUsage => {
      if (meter.sku !== "anthropic.web_search") {
        throw new TypeError(`Unsupported Anthropic meter: ${meter.sku}`);
      }
      return {
        ...meter,
        quantity: strictMeterCount(
          usage?.server_tool_use?.web_search_requests,
          "anthropic.web_search",
        ),
        source: "provider_reported",
      };
    }),
  });
}

