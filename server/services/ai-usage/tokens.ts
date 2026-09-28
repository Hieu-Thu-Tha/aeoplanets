import type { ModelRate } from "../../config/system-config-defaults";
import type { TokenUsage } from "@shared/ai-billing";

export function normalizeTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

// Meter quantities must be non-negative safe integers. Absence is legitimate
// (zero-quantity retention); a present-but-malformed count is a provider
// contract violation and throws instead of coercing to zero or truncating.
export function strictMeterCount(value: unknown, source: string): number {
  if (value == null) return 0;
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
    || value > Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError(`Malformed meter count from ${source}: ${String(value)}`);
  }
  return value;
}

export function optionalTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

export function normalizeTokenUsage(usage: TokenUsage): Required<TokenUsage> {
  const inputTokens = normalizeTokenCount(usage.inputTokens);
  const cacheReadTokens = Math.min(inputTokens, normalizeTokenCount(usage.cacheReadTokens));
  const cacheWriteTokens = Math.min(
    inputTokens - cacheReadTokens,
    normalizeTokenCount(usage.cacheWriteTokens),
  );

  return {
    inputTokens,
    outputTokens: normalizeTokenCount(usage.outputTokens),
    thinkingTokens: normalizeTokenCount(usage.thinkingTokens),
    cacheReadTokens,
    cacheWriteTokens,
    cacheWrite1hTokens: Math.min(
      cacheWriteTokens,
      normalizeTokenCount(usage.cacheWrite1hTokens),
    ),
  };
}


export function computeTokenCostMicroUsd(
  usage: TokenUsage,
  rate: ModelRate,
): number {
  const normalized = normalizeTokenUsage(usage);
  const cacheWrite5mTokens =
    normalized.cacheWriteTokens - normalized.cacheWrite1hTokens;
  const uncachedInputTokens =
    normalized.inputTokens
    - normalized.cacheReadTokens
    - normalized.cacheWriteTokens;

  const costMicroUsd =
    uncachedInputTokens * rate.inputPerMTok
    + normalized.cacheReadTokens * (rate.cacheReadPerMTok ?? rate.inputPerMTok)
    + cacheWrite5mTokens * (rate.cacheWritePerMTok ?? rate.inputPerMTok * 1.25)
    + normalized.cacheWrite1hTokens
      * (rate.cacheWrite1hPerMTok ?? rate.inputPerMTok * 2)
    + (normalized.outputTokens + normalized.thinkingTokens) * rate.outputPerMTok;

  return Math.round(costMicroUsd);
}
