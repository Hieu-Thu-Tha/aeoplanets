import { and, eq, sql } from "drizzle-orm";
import type { AiFeature } from "../ai-usage";
import type { AiProvider } from "@shared/ai-billing";
import {
  aiCostEstimations,
  type AiCostEstimation,
  type AiJobModelCall,
} from "@shared/schema";
import { canonicalizeExpectedMeters, type ExpectedMeter } from "@shared/ai-billing";
import { db } from "../../db";
import {
  getAiJobReservationMicroUsd,
  getMeterPricing,
  getModelPricing,
} from "../system-config";
import {
  AI_COST_ESTIMATION_ALGORITHM_VERSION,
  isAiCostEstimationCurrent,
  priceEstimatedAiJobUsage,
} from "./algorithm";
import {
  calculateEstimation,
  findLatestProfile,
  readEstimation,
  type AiCostEstimationDatabase,
} from "./store";

const ESTIMATION_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_RETRY_MS = 5 * 60 * 1000;
const LOCK_ATTEMPTS = 3;

export type AiCostEstimationDependencies = {
  database?: AiCostEstimationDatabase;
  now?: () => Date;
  getFallbackCost?: typeof getAiJobReservationMicroUsd;
  getPricing?: typeof getModelPricing;
  getMeterPricing?: typeof getMeterPricing;
};

type ResolvedAiCostEstimationDependencies = Required<AiCostEstimationDependencies>;

function resolveDependencies(
  dependencies: AiCostEstimationDependencies,
): ResolvedAiCostEstimationDependencies {
  return {
    database: dependencies.database ?? db,
    now: dependencies.now ?? (() => new Date()),
    getFallbackCost: dependencies.getFallbackCost ?? getAiJobReservationMicroUsd,
    getPricing: dependencies.getPricing ?? getModelPricing,
    getMeterPricing: dependencies.getMeterPricing ?? getMeterPricing,
  };
}

function readNow(dependencies: ResolvedAiCostEstimationDependencies): Date {
  const now = dependencies.now();
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must return a valid date");
  return now;
}

type CachedProfile = {
  estimation?: AiCostEstimation;
  modelsHash?: string;
  latestMatchingFinishedAt?: Date;
  expiresAt: number;
};

const cache = new Map<string, Promise<CachedProfile | undefined>>();
const refreshes = new Map<string, Promise<AiCostEstimation | undefined>>();
const cacheGenerations = new Map<AiFeature, number>();
const dependencyIds = new WeakMap<object, number>();
let nextDependencyId = 1;

function dependencyId(dependency: object): number {
  let id = dependencyIds.get(dependency);
  if (id == null) {
    id = nextDependencyId;
    nextDependencyId += 1;
    dependencyIds.set(dependency, id);
  }
  return id;
}

function dependencyScope(dependencies: ResolvedAiCostEstimationDependencies): string {
  return `${dependencyId(dependencies.database)}:${dependencyId(dependencies.getPricing)}`
    + `:${dependencyId(dependencies.getMeterPricing)}`;
}

function requestKey(
  feature: AiFeature,
  provider: AiProvider,
  model: string,
  entryMeters: readonly ExpectedMeter[],
  dependencies: ResolvedAiCostEstimationDependencies,
): string {
  return `${dependencyScope(dependencies)}\0${feature}\0${provider}\0${model}`
    + `\0${JSON.stringify(entryMeters)}`;
}

function estimationKey(
  feature: string,
  modelsHash: string,
  latestMatchingFinishedAt: Date,
  dependencies: ResolvedAiCostEstimationDependencies,
): string {
  return `${dependencyScope(dependencies)}\0${feature}\0${modelsHash}`
    + `\0${latestMatchingFinishedAt.getTime()}`;
}

function isFresh(
  estimation: AiCostEstimation,
  latestMatchingFinishedAt: Date,
  now: Date,
): boolean {
  return estimation.estimatedUsage != null
    && estimation.algorithmVersion === AI_COST_ESTIMATION_ALGORITHM_VERSION
    && isAiCostEstimationCurrent({
      lastUpdatedAt: estimation.lastUpdatedAt,
      sourceMaxFinishedAt: estimation.sourceMaxFinishedAt,
      latestMatchingFinishedAt,
      now,
      ttlMs: ESTIMATION_TTL_MS,
    });
}

function isLockTimeout(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return candidate?.code === "55P03" || /lock timeout/i.test(candidate?.message ?? "");
}

async function refreshEstimation(
  feature: AiFeature,
  modelsHash: string,
  modelProfile: AiJobModelCall[],
  latestMatchingFinishedAt: Date,
  dependencies: ResolvedAiCostEstimationDependencies,
): Promise<AiCostEstimation | undefined> {
  const key = estimationKey(
    feature,
    modelsHash,
    latestMatchingFinishedAt,
    dependencies,
  );
  const existingRefresh = refreshes.get(key);
  if (existingRefresh) return existingRefresh;

  const task = (async () => {
    for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt += 1) {
      const beforeLock = await readEstimation(feature, modelsHash, dependencies.database);
      const now = readNow(dependencies);
      if (beforeLock && isFresh(beforeLock, latestMatchingFinishedAt, now)) return beforeLock;
      const expectedVersion = beforeLock?.version ?? 0;

      try {
        return await dependencies.database.transaction(async (transaction) => {
          await transaction.execute(sql`SET LOCAL lock_timeout = '30s'`);
          await transaction.execute(sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`ai-cost-estimation:${feature}:${modelsHash}`}, 0)
            )
          `);

          const [current] = await transaction.select().from(aiCostEstimations).where(and(
            eq(aiCostEstimations.feature, feature),
            eq(aiCostEstimations.modelsHash, modelsHash),
          ));
          if (
            (current?.version ?? 0) !== expectedVersion
            && current
            && isFresh(current, latestMatchingFinishedAt, readNow(dependencies))
          ) {
            return current;
          }

          const calculated = await calculateEstimation(
            transaction,
            feature,
            modelsHash,
            modelProfile,
            now,
            dependencies.getPricing,
            dependencies.getMeterPricing,
          );
          if (!calculated) {
            if (current) {
              await transaction.delete(aiCostEstimations).where(and(
                eq(aiCostEstimations.feature, feature),
                eq(aiCostEstimations.modelsHash, modelsHash),
              ));
            }
            return undefined;
          }

          const nextVersion = (current?.version ?? 0) + 1;
          const [updated] = await transaction.insert(aiCostEstimations).values({
            feature,
            modelsHash,
            modelProfile,
            ...calculated,
            algorithmVersion: AI_COST_ESTIMATION_ALGORITHM_VERSION,
            version: nextVersion,
            lastUpdatedAt: now,
          }).onConflictDoUpdate({
            target: [aiCostEstimations.feature, aiCostEstimations.modelsHash],
            set: {
              modelProfile,
              ...calculated,
              algorithmVersion: AI_COST_ESTIMATION_ALGORITHM_VERSION,
              version: nextVersion,
              lastUpdatedAt: now,
            },
          }).returning();
          return updated;
        });
      } catch (error) {
        if (!isLockTimeout(error) || attempt === LOCK_ATTEMPTS) throw error;
        const afterTimeout = await readEstimation(
          feature,
          modelsHash,
          dependencies.database,
        );
        if (
          afterTimeout
          && afterTimeout.version !== expectedVersion
          && isFresh(afterTimeout, latestMatchingFinishedAt, readNow(dependencies))
        ) {
          return afterTimeout;
        }
      }
    }
    return undefined;
  })().finally(() => refreshes.delete(key));

  refreshes.set(key, task);
  return task;
}

async function loadProfileEstimate(
  feature: AiFeature,
  provider: AiProvider,
  model: string,
  entryMeters: readonly ExpectedMeter[],
  dependencies: ResolvedAiCostEstimationDependencies,
): Promise<CachedProfile | undefined> {
  const profile = await findLatestProfile(
    feature,
    provider,
    model,
    entryMeters,
    dependencies.database,
  );
  if (!profile) return { expiresAt: readNow(dependencies).getTime() + STALE_RETRY_MS };

  const now = readNow(dependencies);
  const generation = cacheGenerations.get(feature) ?? 0;
  let estimation = await readEstimation(feature, profile.modelsHash, dependencies.database);
  if (
    !estimation
    || estimation.algorithmVersion !== AI_COST_ESTIMATION_ALGORITHM_VERSION
    || !estimation.estimatedUsage
  ) {
    estimation = await refreshEstimation(
      feature,
      profile.modelsHash,
      profile.modelProfile,
      profile.finishedAt,
      dependencies,
    );
  } else if (!isFresh(estimation, profile.finishedAt, now)) {
    const key = requestKey(feature, provider, model, entryMeters, dependencies);
    void refreshEstimation(
      feature,
      profile.modelsHash,
      profile.modelProfile,
      profile.finishedAt,
      dependencies,
    ).then((updated) => {
      if ((cacheGenerations.get(feature) ?? 0) !== generation) return;
      const fresh = updated && isFresh(
        updated,
        profile.finishedAt,
        readNow(dependencies),
      );
      cache.set(key, Promise.resolve(fresh ? {
        estimation: updated,
        modelsHash: profile.modelsHash,
        latestMatchingFinishedAt: profile.finishedAt,
        expiresAt: readNow(dependencies).getTime() + ESTIMATION_TTL_MS,
      } : {
        expiresAt: readNow(dependencies).getTime() + STALE_RETRY_MS,
      }));
    }).catch((error) => {
      console.error("[ai-cost-estimation] FAILED to refresh stale estimate", {
        feature,
        modelsHash: profile.modelsHash,
        error,
      });
    });
  }
  if (!estimation) return { expiresAt: now.getTime() + STALE_RETRY_MS };
  return {
    estimation,
    modelsHash: profile.modelsHash,
    latestMatchingFinishedAt: profile.finishedAt,
    expiresAt: isFresh(estimation, profile.finishedAt, now)
      ? estimation.lastUpdatedAt.getTime() + ESTIMATION_TTL_MS
      : now.getTime() + STALE_RETRY_MS,
  };
}

export async function getEstimatedAiJobCostMicroUsd(
  feature: AiFeature,
  provider?: AiProvider,
  model?: string,
  entryMeterProfile: readonly ExpectedMeter[] = [],
  dependencyOverrides: AiCostEstimationDependencies = {},
): Promise<number> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const entryMeters = canonicalizeExpectedMeters(entryMeterProfile);
  if ((!provider || !model) && entryMeters.length > 0) {
    throw new TypeError("Entry meter profile requires provider and model");
  }
  const fallback = await dependencies.getFallbackCost(feature);
  if (!provider || !model) return fallback;

  const key = requestKey(feature, provider, model, entryMeters, dependencies);
  let pending = cache.get(key);
  if (pending) {
    let cached: CachedProfile | undefined;
    let latestProfile: Awaited<ReturnType<typeof findLatestProfile>>;
    try {
      [cached, latestProfile] = await Promise.all([
        pending,
        findLatestProfile(feature, provider, model, entryMeters, dependencies.database),
      ]);
    } catch (error) {
      cache.delete(key);
      console.error("[ai-cost-estimation] FAILED to verify cached estimate; using fallback", {
        feature,
        provider,
        model,
        error,
      });
      return fallback;
    }
    const sourceChanged = cached?.modelsHash !== latestProfile?.modelsHash
      || cached?.latestMatchingFinishedAt?.getTime() !== latestProfile?.finishedAt.getTime();
    if (sourceChanged) {
      cache.delete(key);
      pending = undefined;
    }
  }
  if (!pending) {
    pending = loadProfileEstimate(feature, provider, model, entryMeters, dependencies);
    cache.set(key, pending);
  }

  let cached: CachedProfile | undefined;
  try {
    cached = await pending;
  } catch (error) {
    cache.delete(key);
    console.error("[ai-cost-estimation] FAILED to load estimate; using fallback", {
      feature,
      provider,
      model,
      error,
    });
    return fallback;
  }

  if (cache.get(key) !== pending) {
    return getEstimatedAiJobCostMicroUsd(
      feature,
      provider,
      model,
      entryMeters,
      dependencyOverrides,
    );
  }

  if (!cached) {
    cache.delete(key);
    return fallback;
  }
  if (cached.expiresAt <= readNow(dependencies).getTime()) {
    cache.delete(key);
    return getEstimatedAiJobCostMicroUsd(
      feature,
      provider,
      model,
      entryMeters,
      dependencyOverrides,
    );
  }
  if (!cached.estimation) return fallback;

  let estimatedCost: number;
  try {
    if (!cached.estimation.estimatedUsage) throw new TypeError("Estimation has no billable usage");
    estimatedCost = await priceEstimatedAiJobUsage(
      cached.estimation.estimatedUsage,
      dependencies.getPricing,
      dependencies.getMeterPricing
    );
  } catch (error) {
    console.error("[ai-cost-estimation] FAILED to price estimate; using fallback", {
      feature,
      provider,
      model,
      modelsHash: cached.estimation.modelsHash,
      error,
    });
    return fallback;
  }
  if (!Number.isSafeInteger(estimatedCost) || estimatedCost <= 0) return fallback;
  return estimatedCost;
}

export function invalidateAiCostEstimation(feature: AiFeature): void {
  cacheGenerations.set(feature, (cacheGenerations.get(feature) ?? 0) + 1);
  const marker = `\0${feature}\0`;
  for (const key of Array.from(cache.keys())) {
    if (key.includes(marker)) cache.delete(key);
  }
}
