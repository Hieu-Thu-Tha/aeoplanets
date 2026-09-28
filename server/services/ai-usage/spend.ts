/**
 * Current-cycle AI spend, derived from the append-only usage log.
 *
 * Cost remains in millionths of a USD, matching ai_usage_logs. Currency
 * conversion belongs at the cap/presentation boundary so this aggregate is
 * never affected by later FX-rate changes.
 */
import { getPlanConfig, PLAN_CONFIG, type PlanKey } from "../../plans";
import { storage } from "../../storage";
import {
  aiUsageCycleSpendCache,
  aiUsageMonthlySpendCache,
  getUtcCycleWindow,
  sumAiUsageCostMicroUsd,
  type AiUsageRefreshCadence,
  type AiUsageCycleSpendCacheEntry,
} from "./cycle";

const DEFAULT_PLAN = "starter_v2";
export interface CurrentCycleSpendDetails extends AiUsageCycleSpendCacheEntry {
  plan: string;
  cadence: AiUsageRefreshCadence;
}

export async function getCurrentCycleSpendDetails(
  userId: string,
  cadenceOverride?: AiUsageRefreshCadence,
): Promise<CurrentCycleSpendDetails> {
  if (!userId) throw new TypeError("userId is required to calculate current-cycle AI spend");

  const cacheKey = cadenceOverride ? `${userId}\0${cadenceOverride}` : userId;
  const entry = await aiUsageCycleSpendCache.getOrLoad(cacheKey, async (now): Promise<CurrentCycleSpendDetails> => {
    const subscription = await storage.getSubscriptionByUserId(userId);
    const plan = subscription?.plan ?? DEFAULT_PLAN;
    // Unknown negotiated tiers (for example a future Agency key) default to a
    // daily checkpoint instead of inheriting getPlanConfig's Starter fallback.
    const cadence = cadenceOverride ?? (plan in PLAN_CONFIG
      ? getPlanConfig(plan as PlanKey).limits.dataRefreshCadence
      : "daily") as AiUsageRefreshCadence;
    const cycle = getUtcCycleWindow(cadence, now);
    const summary = await storage.getAiUsageSummaryByUser(userId, cycle.start, cycle.end);

    return {
      ...cycle,
      costMicroUsd: sumAiUsageCostMicroUsd(summary),
      plan,
      cadence,
    };
  });

  return entry as CurrentCycleSpendDetails;
}

export async function getSpendForCurrentCycle(userId: string): Promise<number> {
  return (await getCurrentCycleSpendDetails(userId)).costMicroUsd;
}

export async function getMonthlySpendDetails(
  userId: string,
): Promise<AiUsageCycleSpendCacheEntry> {
  if (!userId) throw new TypeError("userId is required to calculate monthly AI spend");

  return aiUsageMonthlySpendCache.getOrLoad(userId, async (now) => {
    const window = getUtcCycleWindow("monthly", now);
    const summary = await storage.getAiUsageSummaryByUser(userId, window.start, window.end);

    return {
      ...window,
      costMicroUsd: sumAiUsageCostMicroUsd(summary),
    };
  });
}

export async function getSpendForCurrentMonth(userId: string): Promise<number> {
  return (await getMonthlySpendDetails(userId)).costMicroUsd;
}
