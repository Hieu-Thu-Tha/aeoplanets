import type { GenerateContentResponse } from "@google/genai";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  type BillableUsage,
  type ExpectedMeter,
  type MeterUsage,
} from "@shared/ai-billing";
import { normalizeTokenUsage, normalizeTokenCount } from "../../ai-usage/tokens";

function geminiGroundingMetadata(response: GenerateContentResponse) {
  return Array.isArray(response?.candidates)
    ? response.candidates.map((candidate) => candidate?.groundingMetadata).filter(Boolean)
    : [];
}

function geminiSearchQueryCount(response: GenerateContentResponse): number {
  return geminiGroundingMetadata(response).reduce(
    (total, metadata) => total + (
      Array.isArray(metadata?.webSearchQueries) ? metadata.webSearchQueries.length : 0
    ),
    0,
  );
}

function geminiHasSearchGrounding(response: GenerateContentResponse): boolean {
  return geminiGroundingMetadata(response).some((metadata) =>
    (Array.isArray(metadata?.webSearchQueries) && metadata.webSearchQueries.length > 0)
    || (Array.isArray(metadata?.groundingChunks) && metadata.groundingChunks.some(
      (chunk) => chunk?.web?.uri,
    ))
    || metadata?.searchEntryPoint?.renderedContent
  );
}

export function usageFromGemini(
  response: GenerateContentResponse,
  expectedMeters: readonly ExpectedMeter[] = [],
): BillableUsage {
  const usage = response?.usageMetadata;
  const meters = canonicalizeExpectedMeters(expectedMeters);
  const usesGoogleSearch = meters.some((meter) => meter.sku.startsWith("gemini.google_search_"));

  return billableUsageSchema.parse({
    tokens: normalizeTokenUsage({
      // Google Search grounding content is not billed as Gemini input tokens.
      inputTokens: normalizeTokenCount(usage?.promptTokenCount)
        + (usesGoogleSearch ? 0 : normalizeTokenCount(usage?.toolUsePromptTokenCount)),
      outputTokens: usage?.candidatesTokenCount ?? 0,
      thinkingTokens: usage?.thoughtsTokenCount ?? 0,
      cacheReadTokens: usage?.cachedContentTokenCount ?? 0,
    }),
    meters: meters.map((meter): MeterUsage => {
      if (meter.sku === "gemini.google_search_grounded_prompt") {
        return {
          ...meter,
          quantity: geminiHasSearchGrounding(response) ? 1 : 0,
          source: "provider_reported",
        };
      }
      if (meter.sku === "gemini.google_search_query") {
        return {
          ...meter,
          quantity: geminiSearchQueryCount(response),
          source: "provider_reported",
        };
      }
      throw new TypeError(`Unsupported Gemini meter: ${meter.sku}`);
    }),
  });
}

