import type {
  AiEstimatedCallUsage,
  AiJobModelCall,
} from "@shared/schema";
import type { MeterRate, ModelRate } from "../../config/system-config-defaults";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  expectedMeterFromUsage,
  type MeterSku,
} from "@shared/ai-billing";
import { computeTokenCostMicroUsd } from "../ai-usage/tokens";

export const AI_COST_ESTIMATION_ALGORITHM_VERSION = 3;

export function isAiCostEstimationCurrent(input: {
  lastUpdatedAt: Date;
  sourceMaxFinishedAt: Date | null;
  latestMatchingFinishedAt: Date;
  now: Date;
  ttlMs: number;
}): boolean {
  return Number.isFinite(input.lastUpdatedAt.getTime())
    && Number.isFinite(input.latestMatchingFinishedAt.getTime())
    && Number.isFinite(input.now.getTime())
    && input.sourceMaxFinishedAt != null
    && input.sourceMaxFinishedAt >= input.latestMatchingFinishedAt
    && input.now.getTime() - input.lastUpdatedAt.getTime() <= input.ttlMs;
}

const TOKEN_FIELDS = [
  "inputTokens",
  "outputTokens",
  "thinkingTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "cacheWrite1hTokens",
] as const;

type TokenField = (typeof TOKEN_FIELDS)[number];

export type AiJobUsageSample = {
  finishedAt: Date;
  calls: AiEstimatedCallUsage[];
};

type WeightedSample = {
  sample: AiJobUsageSample;
  costMicroUsd: number;
  weight: number;
};

function weightedP95Sample(samples: WeightedSample[]): AiJobUsageSample | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort(
    (left, right) => left.costMicroUsd - right.costMicroUsd,
  );
  const totalWeight = sorted.reduce((total, item) => total + item.weight, 0);
  const threshold = totalWeight * 0.95;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= threshold) return item.sample;
  }
  return sorted[sorted.length - 1].sample;
}

function ageBucket(ageMs: number): 0 | 1 | 2 | undefined {
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < 0) return undefined;
  if (ageMs <= 7 * day) return 0;
  if (ageMs <= 30 * day) return 1;
  if (ageMs <= 90 * day) return 2;
  return undefined;
}

function callMatchesProfile(
  call: AiEstimatedCallUsage,
  profile: AiJobModelCall,
): boolean {
  if (call.provider !== profile.provider || call.model !== profile.model) return false;
  const usageMeters = canonicalizeExpectedMeters(
    call.usage.meters.map(expectedMeterFromUsage),
  );
  return JSON.stringify(usageMeters) === JSON.stringify(
    canonicalizeExpectedMeters(profile.meters),
  );
}

export async function estimateWeightedP95Usage(
  profile: readonly AiJobModelCall[],
  samples: readonly AiJobUsageSample[],
  getModelRate: (provider: string, model: string) => Promise<ModelRate>,
  getMeterRate: (sku: MeterSku) => Promise<MeterRate>,
  now: Date = new Date(),
): Promise<AiEstimatedCallUsage[] | undefined> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date");
  if (profile.length === 0) return undefined;

  const buckets: AiJobUsageSample[][] = [[], [], []];
  for (const sample of samples) {
    if (!Number.isFinite(sample.finishedAt.getTime()) || sample.calls.length !== profile.length) continue;
    const matches = sample.calls.every((call, index) => callMatchesProfile(call, profile[index]));
    if (!matches) continue;
    const bucket = ageBucket(now.getTime() - sample.finishedAt.getTime());
    if (bucket != null) buckets[bucket].push(sample);
  }

  const bucketMasses = [0.6, 0.3, 0.1];
  const availableMass = buckets.reduce(
    (total, bucket, index) => total + (bucket.length > 0 ? bucketMasses[index] : 0),
    0,
  );
  if (availableMass === 0) return undefined;

  const weightedSamples = buckets.flatMap((bucket, index) => {
    if (bucket.length === 0) return [];
    const sampleWeight = bucketMasses[index] / availableMass / bucket.length;
    return bucket.map((sample) => ({ sample, weight: sampleWeight }));
  });
  const pricedSamples = await Promise.all(weightedSamples.map(async ({ sample, weight }) => ({
    sample,
    weight,
    costMicroUsd: await priceEstimatedAiJobUsage(sample.calls, getModelRate, getMeterRate),
  })));
  const selected = weightedP95Sample(pricedSamples);
  if (!selected) return undefined;

  return selected.calls.map((call) => {
    const tokens = Object.fromEntries(TOKEN_FIELDS.map((field) => [
      field,
      Math.max(0, Math.floor(Number(call.usage.tokens[field]) || 0)),
    ])) as Record<TokenField, number>;
    return {
      provider: call.provider,
      model: call.model,
      usage: billableUsageSchema.parse({
        tokens,
        meters: call.usage.meters.map((meter) => ({
          ...expectedMeterFromUsage(meter),
          quantity: Math.max(0, Math.floor(Number(meter.quantity) || 0)),
          source: "estimated" as const,
        })),
      }),
    };
  });
}

export async function priceEstimatedAiJobUsage(
  estimatedUsage: readonly AiEstimatedCallUsage[],
  getModelRate: (provider: string, model: string) => Promise<ModelRate>,
  getMeterRate: (sku: MeterSku) => Promise<MeterRate>,
): Promise<number> {
  const costs = await Promise.all(estimatedUsage.map(async (call) => {
    const tokenCost = computeTokenCostMicroUsd(
      call.usage.tokens,
      await getModelRate(call.provider, call.model),
    );
    const meterCosts = await Promise.all(call.usage.meters.map(async (meter) => {
      const rate = await getMeterRate(meter.sku);
      if (rate.unit !== meter.unit) {
        throw new TypeError(`Configured unit for ${meter.sku} must be ${meter.unit}`);
      }
      const cost = meter.quantity * rate.rateMicroUsd;
      if (!Number.isSafeInteger(cost)) {
        throw new RangeError(`Estimated meter cost exceeds safe integer range: ${meter.sku}`);
      }
      return cost;
    }));
    return meterCosts.reduce((total, cost) => total + cost, tokenCost);
  }));
  return costs.reduce((total, cost) => total + cost, 0);
}
