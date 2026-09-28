import OpenAI from "openai";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  type BillableUsage,
  type ExpectedMeter,
  type MeterUsage,
} from "@shared/ai-billing";
import { normalizeTokenUsage, normalizeTokenCount } from "../../ai-usage/tokens";

export function usageFromOpenAI(
  response: OpenAI.Chat.ChatCompletion,
  expectedMeters: readonly ExpectedMeter[] = [],
): BillableUsage {
  const usage = response?.usage;
  // GPT-5.6+ reports explicit prompt-cache writes on prompt_tokens_details;
  // the SDK type does not declare the field yet (widening-only).
  type PromptTokensDetailsRead = OpenAI.CompletionUsage["prompt_tokens_details"] & {
    cache_write_tokens?: number;
  };
  const details: PromptTokensDetailsRead | undefined = usage?.prompt_tokens_details;

  return billableUsageSchema.parse({
    tokens: normalizeTokenUsage({
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cacheReadTokens: details?.cached_tokens ?? 0,
      cacheWriteTokens: details?.cache_write_tokens ?? 0,
    }),
    meters: canonicalizeExpectedMeters(expectedMeters).map((meter): MeterUsage => {
      if (meter.sku !== "openai.web_search") {
        throw new TypeError(`Unsupported OpenAI meter: ${meter.sku}`);
      }
      return { ...meter, quantity: 1, source: "deterministic" };
    }),
  });
}

