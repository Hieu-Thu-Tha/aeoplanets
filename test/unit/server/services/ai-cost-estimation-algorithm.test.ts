import assert from "node:assert/strict";
import test from "node:test";
import type { AiEstimatedCallUsage, AiJobModelCall } from "@shared/schema";
import {
  DEFAULT_AI_METER_PRICING,
  type ModelRate,
} from "../../../../server/config/system-config-defaults";
import {
  DATAFORSEO_AI_MODE_METER,
  anthropicWebSearchMeter,
  billableUsageSchema,
  type MeterSku,
} from "@shared/ai-billing";
import {
  estimateWeightedP95Usage,
  isAiCostEstimationCurrent,
  priceEstimatedAiJobUsage,
  type AiJobUsageSample,
} from "../../../../server/services/ai-cost-estimation/algorithm";
import { hashAiJobModelProfile } from "../../../../server/services/ai-jobs/profile";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const PROFILE: AiJobModelCall[] = [
  { provider: "gemini", model: "gemini-2.5-flash", meters: [] },
  { provider: "anthropic", model: "claude-haiku-4-5", meters: [] },
  { provider: "gemini", model: "gemini-2.5-flash", meters: [] },
];
const RATE: ModelRate = { inputPerMTok: 0.3, outputPerMTok: 2.5 };
const getRate = async () => RATE;
const getMeterRate = async (sku: MeterSku) => DEFAULT_AI_METER_PRICING[sku];

function call(
  profileIndex: number,
  inputTokens: number,
): AiEstimatedCallUsage {
  return {
    provider: PROFILE[profileIndex].provider,
    model: PROFILE[profileIndex].model,
    usage: {
      tokens: {
        inputTokens,
        outputTokens: Math.floor(inputTokens / 10),
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      },
      meters: [],
    },
  };
}

function sample(ageDays: number, inputs: [number, number, number]): AiJobUsageSample {
  return {
    finishedAt: new Date(NOW.getTime() - ageDays * 24 * 60 * 60 * 1000),
    calls: inputs.map((tokens, index) => call(index, tokens)),
  };
}

test("token-less DataForSEO profiles project purely on meter quantities", async () => {
  const dataforseoProfile: AiJobModelCall[] = [{
    provider: "dataforseo",
    model: "google_ai_mode",
    meters: [DATAFORSEO_AI_MODE_METER],
  }];
  const zeroTokens = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
  };
  const dataforseoSample = (taskCost: number): AiJobUsageSample => ({
    finishedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
    calls: [{
      provider: "dataforseo",
      model: "google_ai_mode",
      usage: billableUsageSchema.parse({
        tokens: zeroTokens,
        meters: [{
          ...DATAFORSEO_AI_MODE_METER,
          quantity: 1,
          source: "deterministic",
          providerCostMicroUsd: taskCost,
        }],
      }),
    }],
  });

  // Historical actuals: the vendor billed these per-task costs (parity path).
  const estimate = await estimateWeightedP95Usage(
    dataforseoProfile,
    [
      dataforseoSample(4_000),
      dataforseoSample(3_000),
      dataforseoSample(5_000),
    ],
    getRate,
    getMeterRate,
    NOW,
  );

  assert.ok(estimate);
  // Tokens contribute zero — the projection is quantity × NOW-config rate.
  assert.deepEqual(estimate.map((entry) => entry.usage.tokens), [zeroTokens]);
  assert.deepEqual(estimate[0].usage.meters, [{
    ...DATAFORSEO_AI_MODE_METER,
    quantity: 1,
    source: "estimated",
  }]);

  const projected = await priceEstimatedAiJobUsage(estimate, getRate, getMeterRate);
  // 1 task x the NOW-active config rate; token cost contributes nothing.
  assert.equal(projected, 4_000);
});

test("model profile hashing preserves repeated calls and exact order", () => {
  const same = PROFILE.map((entry) => ({ ...entry }));
  const reordered = [PROFILE[0], PROFILE[2], PROFILE[1]];
  const deduplicated = [PROFILE[0], PROFILE[1]];

  assert.equal(hashAiJobModelProfile(PROFILE), hashAiJobModelProfile(same));
  assert.notEqual(hashAiJobModelProfile(PROFILE), hashAiJobModelProfile(reordered));
  assert.notEqual(hashAiJobModelProfile(PROFILE), hashAiJobModelProfile(deduplicated));
  assert.notEqual(hashAiJobModelProfile([PROFILE[1]]), hashAiJobModelProfile([{
    ...PROFILE[1],
    meters: [anthropicWebSearchMeter(3)],
  }]));
  assert.match(hashAiJobModelProfile(PROFILE), /^[a-f0-9]{64}$/);
});

test("weighted P95 gives age buckets fixed influence without mixing jobs", async () => {
  const samples = [
    sample(1, [10_000, 7_000, 8_000]),
    sample(3, [12_000, 8_000, 9_000]),
    sample(6, [15_000, 10_000, 12_000]),
    sample(20, [9_000, 6_000, 7_000]),
    sample(27, [20_000, 12_000, 18_000]),
    sample(70, [8_000, 5_000, 6_000]),
  ];
  const estimate = await estimateWeightedP95Usage(
    PROFILE,
    samples,
    getRate,
    getMeterRate,
    NOW,
  );

  assert.ok(estimate);
  assert.deepEqual(
    estimate.map((entry) => entry.usage.tokens.inputTokens),
    [20_000, 12_000, 18_000],
  );
  assert.deepEqual(
    estimate.map(({ provider, model }) => ({ provider, model })),
    PROFILE.map(({ provider, model }) => ({ provider, model })),
  );
  assert.deepEqual(estimate, samples[4].calls);
});

test("empty age buckets are renormalized and mismatched profiles are excluded", async () => {
  const wrongOrder = sample(1, [99_000, 99_000, 99_000]);
  wrongOrder.calls = [wrongOrder.calls[1], wrongOrder.calls[0], wrongOrder.calls[2]];
  const tooOld = sample(91, [100_000, 100_000, 100_000]);
  const future = sample(-1, [100_000, 100_000, 100_000]);

  const estimate = await estimateWeightedP95Usage(PROFILE, [
    sample(2, [11_000, 7_000, 8_000]),
    sample(10, [13_000, 9_000, 10_000]),
    wrongOrder,
    tooOld,
    future,
  ], getRate, getMeterRate, NOW);

  assert.ok(estimate);
  assert.deepEqual(
    estimate.map((entry) => entry.usage.tokens.inputTokens),
    [13_000, 9_000, 10_000],
  );
  assert.equal(
    await estimateWeightedP95Usage(
      PROFILE,
      [wrongOrder, tooOld, future],
      getRate,
      getMeterRate,
      NOW,
    ),
    undefined,
  );
});

test("coherent job selection cannot exceed the most expensive observed job", async () => {
  const oneCallProfile = [PROFILE[0]];
  const complementarySamples: AiJobUsageSample[] = [
    {
      finishedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
      calls: [{
        ...call(0, 1_000_000),
        usage: {
          ...call(0, 1_000_000).usage,
          tokens: { ...call(0, 1_000_000).usage.tokens, outputTokens: 1_000 },
        },
      }],
    },
    {
      finishedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
      calls: [{
        ...call(0, 1_000),
        usage: {
          ...call(0, 1_000).usage,
          tokens: { ...call(0, 1_000).usage.tokens, outputTokens: 120_000 },
        },
      }],
    },
  ];
  const estimate = await estimateWeightedP95Usage(
    oneCallProfile,
    complementarySamples,
    getRate,
    getMeterRate,
    NOW,
  );
  assert.ok(estimate);

  const estimatedCost = await priceEstimatedAiJobUsage(estimate, getRate, getMeterRate);
  const observedCosts = await Promise.all(complementarySamples.map((entry) =>
    priceEstimatedAiJobUsage(entry.calls, getRate, getMeterRate)
  ));
  assert.ok(estimatedCost >= Math.min(...observedCosts));
  assert.ok(estimatedCost <= Math.max(...observedCosts));
  assert.equal(complementarySamples.some((entry) => {
    try {
      assert.deepEqual(estimate, entry.calls);
      return true;
    } catch {
      return false;
    }
  }), true);
});

test("distributed spikes cannot synthesize a cost below every observed job", async () => {
  const repeatedProfile = Array.from({ length: 10 }, () => PROFILE[0]);
  const samples = Array.from({ length: 20 }, (_, sampleIndex): AiJobUsageSample => ({
    finishedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    calls: repeatedProfile.map((profile, callIndex) => ({
      provider: profile.provider,
      model: profile.model,
      usage: {
        tokens: {
          inputTokens: callIndex * 2 === sampleIndex ? 1_001_000 : 1_000,
          outputTokens: callIndex * 2 + 1 === sampleIndex ? 1_001_000 : 1_000,
          thinkingTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
        },
        meters: [],
      },
    })),
  }));
  const estimate = await estimateWeightedP95Usage(
    repeatedProfile,
    samples,
    getRate,
    getMeterRate,
    NOW,
  );
  assert.ok(estimate);

  const estimatedCost = await priceEstimatedAiJobUsage(estimate, getRate, getMeterRate);
  const observedCosts = await Promise.all(samples.map((entry) =>
    priceEstimatedAiJobUsage(entry.calls, getRate, getMeterRate)
  ));
  assert.ok(estimatedCost >= Math.min(...observedCosts));
  assert.ok(estimatedCost <= Math.max(...observedCosts));
});

test("persisted usage estimates are repriced with current live rates", async () => {
  const estimatedUsage = [call(0, 1_000_000)];
  const cheap = await priceEstimatedAiJobUsage(estimatedUsage, async () => ({
    inputPerMTok: 1,
    outputPerMTok: 1,
  }), getMeterRate);
  const expensive = await priceEstimatedAiJobUsage(estimatedUsage, async () => ({
    inputPerMTok: 4,
    outputPerMTok: 8,
  }), getMeterRate);

  assert.equal(cheap, 1_100_000);
  assert.equal(expensive, 4_800_000);
});

test("weighted P95 carries the selected historical meter quantity", async () => {
  const meter = anthropicWebSearchMeter(3);
  const profile: AiJobModelCall[] = [{
    provider: "anthropic",
    model: "claude-haiku-4-5",
    meters: [meter],
  }];
  const meteredCall = (quantity: number): AiEstimatedCallUsage => ({
    provider: "anthropic",
    model: "claude-haiku-4-5",
    usage: {
      tokens: {
        inputTokens: 1_000,
        outputTokens: 100,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      },
      meters: [{ ...meter, quantity, source: "provider_reported" }],
    },
  });
  const samples: AiJobUsageSample[] = [1, 3].map((quantity, index) => ({
    finishedAt: new Date(NOW.getTime() - (index + 1) * 24 * 60 * 60 * 1000),
    calls: [meteredCall(quantity)],
  }));

  const estimate = await estimateWeightedP95Usage(
    profile,
    samples,
    getRate,
    async () => ({ unit: "search", rateMicroUsd: 10_000 }),
    NOW,
  );

  assert.ok(estimate);
  assert.equal(estimate[0].usage.meters[0].quantity, 3);
  assert.equal(estimate[0].usage.meters[0].source, "estimated");
  assert.equal(
    await priceEstimatedAiJobUsage(
      estimate,
      getRate,
      async () => ({ unit: "search", rateMicroUsd: 20_000 }),
    ),
    60_550,
  );
});

test("an estimate becomes stale when a newer matching job finishes", () => {
  const lastUpdatedAt = new Date("2026-08-19T10:00:00.000Z");
  const sourceMaxFinishedAt = new Date("2026-08-19T09:00:00.000Z");
  const now = new Date("2026-08-19T12:00:00.000Z");
  const ttlMs = 6 * 60 * 60 * 1000;

  assert.equal(isAiCostEstimationCurrent({
    lastUpdatedAt,
    sourceMaxFinishedAt,
    latestMatchingFinishedAt: sourceMaxFinishedAt,
    now,
    ttlMs,
  }), true);
  assert.equal(isAiCostEstimationCurrent({
    lastUpdatedAt,
    sourceMaxFinishedAt,
    latestMatchingFinishedAt: new Date("2026-08-19T11:00:00.000Z"),
    now,
    ttlMs,
  }), false);
});
