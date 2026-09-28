import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { AiFeature } from "../ai-usage";
import type { AiProvider } from "@shared/ai-billing";
import {
  aiCostEstimations,
  aiJobs,
  aiUsageLogs,
  type AiCostEstimation,
  type AiEstimatedCallUsage,
  type AiEstimatedCallTokens,
  type AiJobModelCall,
} from "@shared/schema";
import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  pricedMetersSchema,
  type ExpectedMeter,
} from "@shared/ai-billing";
import type { getMeterPricing, getModelPricing } from "../system-config";
import {
  estimateWeightedP95Usage,
  type AiJobUsageSample,
} from "./algorithm";

export type AiCostEstimationDatabase = PgDatabase<any, any, any>;

const HISTORY_DAYS = 90;

export async function readEstimation(
  feature: string,
  modelsHash: string,
  database: AiCostEstimationDatabase,
): Promise<AiCostEstimation | undefined> {
  const [row] = await database.select().from(aiCostEstimations).where(and(
    eq(aiCostEstimations.feature, feature),
    eq(aiCostEstimations.modelsHash, modelsHash),
  ));
  return row;
}

export async function findLatestProfile(
  feature: AiFeature,
  provider: AiProvider,
  model: string,
  entryMeters: readonly ExpectedMeter[],
  database: AiCostEstimationDatabase,
): Promise<{
  modelsHash: string;
  modelProfile: AiJobModelCall[];
  finishedAt: Date;
} | undefined> {
  const [job] = await database.select({
    modelsHash: aiJobs.modelsHash,
    modelProfile: aiJobs.modelProfile,
    finishedAt: aiJobs.finishedAt,
  }).from(aiJobs).where(and(
    eq(aiJobs.feature, feature),
    inArray(aiJobs.status, ["completed", "failed"]),
    eq(aiJobs.entryProvider, provider),
    eq(aiJobs.entryModel, model),
    sql`${aiJobs.entryMeters} = ${JSON.stringify(entryMeters)}::jsonb`,
    isNotNull(aiJobs.modelsHash),
    isNotNull(aiJobs.modelProfile),
  )).orderBy(desc(aiJobs.finishedAt), desc(aiJobs.id)).limit(1);

  if (
    !job?.modelsHash
    || !job.finishedAt
    || !Array.isArray(job.modelProfile)
    || job.modelProfile.length === 0
    || job.modelProfile.some((call) => !Array.isArray(call.meters))
  ) {
    return undefined;
  }
  return {
    modelsHash: job.modelsHash,
    modelProfile: job.modelProfile.map((call) => ({
      provider: call.provider,
      model: call.model,
      meters: canonicalizeExpectedMeters(call.meters),
    })),
    finishedAt: job.finishedAt,
  };
}

export async function calculateEstimation(
  transaction: Parameters<Parameters<AiCostEstimationDatabase["transaction"]>[0]>[0],
  feature: AiFeature,
  modelsHash: string,
  modelProfile: AiJobModelCall[],
  now: Date,
  getPricing: typeof getModelPricing,
  getMeterRate: typeof getMeterPricing,
): Promise<{
  estimatedTokens: AiEstimatedCallTokens[];
  estimatedUsage: AiEstimatedCallUsage[];
  sampleCount: number;
  sourceMaxFinishedAt: Date;
} | undefined> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const rows = await transaction.select({
    jobId: aiJobs.id,
    finishedAt: aiJobs.finishedAt,
    provider: aiUsageLogs.provider,
    model: aiUsageLogs.model,
    inputTokens: aiUsageLogs.inputTokens,
    outputTokens: aiUsageLogs.outputTokens,
    thinkingTokens: aiUsageLogs.thinkingTokens,
    cacheReadTokens: aiUsageLogs.cacheReadTokens,
    cacheWriteTokens: aiUsageLogs.cacheWriteTokens,
    cacheWrite1hTokens: aiUsageLogs.cacheWrite1hTokens,
    meters: aiUsageLogs.meters,
  }).from(aiJobs).innerJoin(aiUsageLogs, eq(aiUsageLogs.jobId, aiJobs.id)).where(and(
    eq(aiJobs.feature, feature),
    eq(aiJobs.modelsHash, modelsHash),
    inArray(aiJobs.status, ["completed", "failed"]),
    isNotNull(aiJobs.finishedAt),
    gte(aiJobs.finishedAt, since),
  )).orderBy(aiJobs.finishedAt, aiJobs.id, aiUsageLogs.callIndex);

  const grouped = new Map<string, AiJobUsageSample>();
  for (const row of rows) {
    if (!row.finishedAt) continue;
    let sample = grouped.get(row.jobId);
    if (!sample) {
      sample = { finishedAt: row.finishedAt, calls: [] };
      grouped.set(row.jobId, sample);
    }
    sample.calls.push({
      provider: row.provider,
      model: row.model,
      usage: billableUsageSchema.parse({
        tokens: {
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          thinkingTokens: row.thinkingTokens,
          cacheReadTokens: row.cacheReadTokens,
          cacheWriteTokens: row.cacheWriteTokens,
          cacheWrite1hTokens: row.cacheWrite1hTokens,
        },
        meters: pricedMetersSchema.parse(row.meters).map((meter) => {
          const {
            rateMicroUsd: _rate,
            costMicroUsd: _cost,
            providerCostMicroUsd: _providerCost,
            ...usage
          } = meter;
          return usage;
        }),
      }),
    });
  }

  const samples = Array.from(grouped.values()).filter((sample) =>
    sample.finishedAt <= now
    && sample.calls.length === modelProfile.length
    && sample.calls.every((call, index) => {
      const profile = modelProfile[index];
      return call.provider === profile.provider
        && call.model === profile.model
        && JSON.stringify(canonicalizeExpectedMeters(
          call.usage.meters.map((meter) => {
            const { quantity: _quantity, source: _source, ...expected } = meter;
            return expected;
          }),
        )) === JSON.stringify(profile.meters);
    })
  );
  const estimatedUsage = await estimateWeightedP95Usage(
    modelProfile,
    samples,
    getPricing,
    getMeterRate,
    now,
  );
  if (!estimatedUsage || samples.length === 0) return undefined;
  const estimatedTokens = estimatedUsage.map((call) => ({
    provider: call.provider,
    model: call.model,
    ...call.usage.tokens,
  }));
  const sourceMaxFinishedAt = samples.reduce(
    (latest, sample) => sample.finishedAt > latest ? sample.finishedAt : latest,
    samples[0].finishedAt,
  );
  return { estimatedTokens, estimatedUsage, sampleCount: samples.length, sourceMaxFinishedAt };
}
