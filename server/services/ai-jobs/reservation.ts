import { and, eq, gt, gte, lt, lte, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { aiJobs, aiUsageLogs, type AiJob } from "@shared/schema";
import type { AiFeature } from "../ai-usage";
import { db } from "../../db";
import { getPlanConfig, PLAN_CONFIG, type PlanKey } from "../../plans";
import type { AiUsageCapsConfig } from "../../config/system-config-defaults";
import { storage } from "../../storage";
import { getConfigValue, getUsdToGbpRate } from "../system-config";
import { AiUsageCapExceededError } from "../ai-usage/cap";
import {
  calculateActiveReservationHoldMicroUsd,
  evaluateAiJobAdmission,
  type AiJobQuotaPolicyContext,
} from "./reservation-policy";
import type { AiUsageCapStatus } from "../ai-usage/cap-policy";
import { getUtcCycleWindow } from "../ai-usage/cycle";
import { hashAiJobModelProfile } from "./profile";
import { invalidateAiCostEstimation } from "../ai-cost-estimation";
import { aiJobAccountLockQuery } from "./account-lock";
import {
  canonicalizeExpectedMeters,
  expectedMeterFromUsage,
  pricedMetersSchema,
  providerForMeter,
  type ExpectedMeter,
} from "@shared/ai-billing";

const DEFAULT_PLAN = "starter_v2";
const RESERVATION_TTL_MS = 60 * 60 * 1000;

export interface ReserveAiJobInput {
  accountOwnerId: string;
  brandId?: number | null;
  feature: AiFeature;
  entryProvider?: string | null;
  entryModel?: string | null;
  entryMeters?: ExpectedMeter[];
  reservedCostMicroUsd: number;
  maxOvershootCostMicroUsd: number;
}

type AiJobReservationDatabase = PgDatabase<any, any, any>;

export type AiJobReservationDependencies = {
  database?: AiJobReservationDatabase;
  loadPolicy?: (accountOwnerId: string) => Promise<AiJobQuotaPolicyContext>;
  now?: () => Date;
};

async function loadQuotaPolicy(accountOwnerId: string): Promise<AiJobQuotaPolicyContext> {
  const [subscription, config] = await Promise.all([
    storage.getSubscriptionByUserId(accountOwnerId),
    getConfigValue<AiUsageCapsConfig>("ai_usage_caps"),
  ]);
  const plan = subscription?.plan ?? DEFAULT_PLAN;
  const policy = config.accountOverrides[accountOwnerId] ?? config.plans[plan];

  if (!policy) {
    return { plan, warningThreshold: config.warningThreshold, policy: null };
  }

  const cadence = policy.cadence ?? (plan in PLAN_CONFIG
    ? getPlanConfig(plan as PlanKey).limits.dataRefreshCadence
    : "daily");
  return {
    plan,
    warningThreshold: config.warningThreshold,
    policy,
    cadence,
    usdGbpRate: await getUsdToGbpRate(),
  };
}

export async function reserveAiJob(
  input: ReserveAiJobInput,
  dependencies: AiJobReservationDependencies = {},
): Promise<{
  job: AiJob;
  aiUsageStatus: ReturnType<typeof evaluateAiJobAdmission>;
}> {
  if (!input.accountOwnerId) throw new TypeError("accountOwnerId is required");
  if (!Number.isSafeInteger(input.reservedCostMicroUsd) || input.reservedCostMicroUsd <= 0) {
    throw new RangeError("reservedCostMicroUsd must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.maxOvershootCostMicroUsd) || input.maxOvershootCostMicroUsd <= 0) {
    throw new RangeError("maxOvershootCostMicroUsd must be a positive safe integer");
  }
  const entryMeters = canonicalizeExpectedMeters(input.entryMeters);
  if (!input.entryProvider && entryMeters.length > 0) {
    throw new TypeError("entryMeters require an entryProvider and entryModel");
  }
  if (input.entryProvider && entryMeters.some(
    (meter) => providerForMeter(meter) !== input.entryProvider,
  )) {
    throw new TypeError("entryMeters must belong to entryProvider");
  }

  const database = dependencies.database ?? db;
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must return a valid date");
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
  const quotaPolicyContext = await (dependencies.loadPolicy ?? loadQuotaPolicy)(input.accountOwnerId);

  const result = await database.transaction(async (transaction) => {
    // Serialize admission for this account so concurrent requests cannot both
    // observe the same remaining allowance.
    await transaction.execute(aiJobAccountLockQuery(input.accountOwnerId));

    const expired = await transaction.update(aiJobs)
      .set({ status: "expired", finishedAt: now, updatedAt: now })
      .where(and(
        eq(aiJobs.accountOwnerId, input.accountOwnerId),
        eq(aiJobs.status, "reserved"),
        lte(aiJobs.expiresAt, now),
      ))
      .returning({ id: aiJobs.id });

    let usage: AiUsageCapStatus;

    if (quotaPolicyContext.policy) {
      const cycle = getUtcCycleWindow(quotaPolicyContext.cadence, now);
      const monthlyWindow = getUtcCycleWindow("monthly", now);
      const earliestStart = cycle.start < monthlyWindow.start ? cycle.start : monthlyWindow.start;
      const latestEnd = cycle.end > monthlyWindow.end ? cycle.end : monthlyWindow.end;

      const [spend] = await transaction.select({
        refresh: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}) filter (where ${aiUsageLogs.createdAt} >= ${cycle.start} and ${aiUsageLogs.createdAt} < ${cycle.end}), 0)::float8`,
        monthly: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}) filter (where ${aiUsageLogs.createdAt} >= ${monthlyWindow.start} and ${aiUsageLogs.createdAt} < ${monthlyWindow.end}), 0)::float8`,
      })
        .from(aiUsageLogs)
        .where(and(
          eq(aiUsageLogs.userId, input.accountOwnerId),
          gte(aiUsageLogs.createdAt, earliestStart),
          lt(aiUsageLogs.createdAt, latestEnd),
        ));

      const activeReservations = await transaction.select({
        reservedCostMicroUsd: aiJobs.reservedCostMicroUsd,
        loggedCostMicroUsd: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}), 0)::float8`,
      })
        .from(aiJobs)
        .leftJoin(aiUsageLogs, eq(aiUsageLogs.jobId, aiJobs.id))
        .where(and(
          eq(aiJobs.accountOwnerId, input.accountOwnerId),
          eq(aiJobs.status, "reserved"),
          gt(aiJobs.expiresAt, now),
        ))
        .groupBy(aiJobs.id, aiJobs.reservedCostMicroUsd);
      const activeReservedCostMicroUsd = calculateActiveReservationHoldMicroUsd(
        activeReservations.map((reservation) => ({
          reservedCostMicroUsd: Number(reservation.reservedCostMicroUsd),
          loggedCostMicroUsd: Number(reservation.loggedCostMicroUsd),
        })),
      );

      usage = evaluateAiJobAdmission({
        context: quotaPolicyContext,
        refreshCostMicroUsd: Number(spend?.refresh ?? 0),
        monthlyCostMicroUsd: Number(spend?.monthly ?? 0),
        activeReservedCostMicroUsd,
        activeReservationCount: activeReservations.length,
        requestedCostMicroUsd: input.reservedCostMicroUsd,
        maxOvershootCostMicroUsd: input.maxOvershootCostMicroUsd,
        cycleEndsAt: cycle.end,
        monthlyEndsAt: monthlyWindow.end,
      });
      if (usage.status === "blocked") {
        console.warn("[ai-job-reservation] rejected", {
          accountOwnerId: input.accountOwnerId,
          feature: input.feature,
          reservedCostMicroUsd: input.reservedCostMicroUsd,
          blockedBy: usage.blockedBy,
        });
        throw new AiUsageCapExceededError(usage);
      }
    } else {
      usage = evaluateAiJobAdmission({
        context: quotaPolicyContext,
        refreshCostMicroUsd: 0,
        monthlyCostMicroUsd: 0,
        activeReservedCostMicroUsd: 0,
        activeReservationCount: 0,
        requestedCostMicroUsd: input.reservedCostMicroUsd,
        maxOvershootCostMicroUsd: input.maxOvershootCostMicroUsd,
      });
    }

    const [job] = await transaction.insert(aiJobs).values({
      accountOwnerId: input.accountOwnerId,
      brandId: input.brandId ?? null,
      feature: input.feature,
      entryProvider: input.entryProvider ?? null,
      entryModel: input.entryModel ?? null,
      entryMeters,
      reservedCostMicroUsd: input.reservedCostMicroUsd,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return { job, usage, expiredCount: expired.length };
  });

  if (result.expiredCount > 0) {
    console.log("[ai-job-reservation] expired stale reservations", {
      count: result.expiredCount,
      accountOwnerId: input.accountOwnerId,
      cutoff: now.toISOString(),
      source: "admission",
    });
  }
  console.log("[ai-job-reservation] reserved", {
    jobId: result.job.id,
    accountOwnerId: input.accountOwnerId,
    feature: input.feature,
    reservedCostMicroUsd: input.reservedCostMicroUsd,
    expiresAt: expiresAt.toISOString(),
  });

  return { job: result.job, aiUsageStatus: result.usage };
}

export async function finishAiJobReservation(
  jobId: string,
  accountOwnerId: string,
  status: "completed" | "failed",
  expectedCallCount?: number,
  dependencies: Pick<AiJobReservationDependencies, "database" | "now"> = {},
): Promise<AiJob> {
  if (!jobId || !accountOwnerId) throw new TypeError("jobId and accountOwnerId are required");
  if (expectedCallCount != null && (!Number.isSafeInteger(expectedCallCount) || expectedCallCount < 0)) {
    throw new RangeError("expectedCallCount must be a non-negative safe integer");
  }
  const database = dependencies.database ?? db;
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must return a valid date");
  const result = await database.transaction(async (transaction) => {
    await transaction.execute(aiJobAccountLockQuery(accountOwnerId));
    const calls = await transaction.select({
      provider: aiUsageLogs.provider,
      model: aiUsageLogs.model,
      meters: aiUsageLogs.meters,
    }).from(aiUsageLogs).where(eq(aiUsageLogs.jobId, jobId))
      .orderBy(aiUsageLogs.callIndex, aiUsageLogs.id);
    const completeProfile = expectedCallCount == null || calls.length === expectedCallCount;
    const modelProfile = completeProfile && calls.length > 0
      ? calls.map((call) => ({
        provider: call.provider,
        model: call.model,
        meters: canonicalizeExpectedMeters(
          pricedMetersSchema.parse(call.meters).map(expectedMeterFromUsage),
        ),
      }))
      : null;
    const modelsHash = modelProfile ? hashAiJobModelProfile(modelProfile) : null;

    const [updated] = await transaction.update(aiJobs)
      .set({ status, modelsHash, modelProfile, finishedAt: now, updatedAt: now })
      .where(and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.accountOwnerId, accountOwnerId),
        eq(aiJobs.status, "reserved"),
      ))
      .returning();
    if (updated) return { job: updated, changed: true };

    const [existing] = await transaction.select().from(aiJobs).where(and(
      eq(aiJobs.id, jobId),
      eq(aiJobs.accountOwnerId, accountOwnerId),
    ));
    if (!existing) throw new Error("AI job reservation not found");
    return { job: existing, changed: false };
  });

  if (result.changed) {
    invalidateAiCostEstimation(result.job.feature as AiFeature);
    console.log("[ai-job-reservation] finalized", {
      jobId,
      accountOwnerId,
      status,
      modelsHash: result.job.modelsHash,
      expectedCallCount,
    });
  }
  return result.job;
}

export async function expireStaleAiJobReservations(
  now: Date = new Date(),
  dependencies: Pick<AiJobReservationDependencies, "database"> = {},
): Promise<number> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date");
  const database = dependencies.database ?? db;
  const candidates = await database.selectDistinct({ accountOwnerId: aiJobs.accountOwnerId })
    .from(aiJobs)
    .where(and(
      eq(aiJobs.status, "reserved"),
      lte(aiJobs.expiresAt, now),
    ));
  const counts = await Promise.all(candidates.map(({ accountOwnerId }) =>
    database.transaction(async (transaction) => {
      await transaction.execute(aiJobAccountLockQuery(accountOwnerId));
      const expired = await transaction.update(aiJobs)
        .set({ status: "expired", finishedAt: now, updatedAt: now })
        .where(and(
          eq(aiJobs.accountOwnerId, accountOwnerId),
          eq(aiJobs.status, "reserved"),
          lte(aiJobs.expiresAt, now),
        ))
        .returning({ id: aiJobs.id });
      return expired.length;
    })
  ));
  return counts.reduce((total, count) => total + count, 0);
}
