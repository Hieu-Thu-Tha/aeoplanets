import assert from "node:assert/strict";
import test from "node:test";
import { computeTokenCostMicroUsd, normalizeTokenUsage } from "../../../../server/services/ai-usage/tokens";

test("cache-aware cost prices each disjoint token category once", () => {
  const cost = computeTokenCostMicroUsd({
    inputTokens: 13_000,
    outputTokens: 1_000,
    thinkingTokens: 200,
    cacheReadTokens: 10_000,
    cacheWriteTokens: 2_000,
    cacheWrite1hTokens: 500,
  }, {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 1.25,
    cacheWrite1hPerMTok: 2,
  });

  // 1,000 ordinary + 10,000 reads + 1,500 5m writes + 500 1h writes
  // + 1,200 output/thinking = 1,000 + 1,000 + 1,875 + 1,000 + 6,000.
  assert.equal(cost, 10_875);
});

test("missing cache rates use conservative read and write defaults", () => {
  assert.equal(computeTokenCostMicroUsd({
    inputTokens: 1_000,
    outputTokens: 0,
    cacheReadTokens: 800,
    cacheWriteTokens: 100,
  }, {
    inputPerMTok: 2,
    outputPerMTok: 12,
  }), 2_050);
});

test("normalization prevents malformed cache subsets from exceeding input", () => {
  assert.deepEqual(normalizeTokenUsage({
    inputTokens: 100,
    outputTokens: -1,
    cacheReadTokens: 90,
    cacheWriteTokens: 50,
    cacheWrite1hTokens: 20,
  }), {
    inputTokens: 100,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 90,
    cacheWriteTokens: 10,
    cacheWrite1hTokens: 10,
  });
});
