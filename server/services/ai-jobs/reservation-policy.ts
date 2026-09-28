import {
  evaluateAiUsageCap,
  type AiUsageCapPolicy,
  type AiUsageCapStatus,
} from "../ai-usage/cap-policy";
import type { AiUsageRefreshCadence } from "../ai-usage/cycle";

type DisabledQuotaPolicy = {
  plan: string;
  warningThreshold: number;
  policy: null;
};

type EnabledQuotaPolicy = {
  plan: string;
  warningThreshold: number;
  policy: AiUsageCapPolicy;
  cadence: AiUsageRefreshCadence;
  usdGbpRate: number;
};

export type AiJobQuotaPolicyContext = DisabledQuotaPolicy | EnabledQuotaPolicy;

export type AiJobAdmissionEvaluation = {
  context: AiJobQuotaPolicyContext;
  refreshCostMicroUsd: number;
  monthlyCostMicroUsd: number;
  activeReservedCostMicroUsd: number;
  activeReservationCount: number;
  requestedCostMicroUsd: number;
  maxOvershootCostMicroUsd: number;
  cycleEndsAt?: Date;
  monthlyEndsAt?: Date;
};

export function calculateActiveReservationHoldMicroUsd(
  reservations: ReadonlyArray<{
    reservedCostMicroUsd: number;
    loggedCostMicroUsd: number;
  }>,
): number {
  return reservations.reduce((total, reservation) => {
    for (const value of [reservation.reservedCostMicroUsd, reservation.loggedCostMicroUsd]) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("Active AI job costs must be non-negative safe integers");
      }
    }
    return total + Math.max(
      reservation.reservedCostMicroUsd - reservation.loggedCostMicroUsd,
      0,
    );
  }, 0);
}

export function evaluateAiJobAdmission(input: AiJobAdmissionEvaluation): AiUsageCapStatus {
  const { context } = input;
  for (const cost of [
    input.refreshCostMicroUsd,
    input.monthlyCostMicroUsd,
    input.activeReservedCostMicroUsd,
    input.requestedCostMicroUsd,
    input.maxOvershootCostMicroUsd,
  ]) {
    if (!Number.isSafeInteger(cost) || cost < 0) {
      throw new RangeError("AI job reservation costs must be non-negative safe integers");
    }
  }
  if (!Number.isSafeInteger(input.activeReservationCount) || input.activeReservationCount < 0) {
    throw new RangeError("activeReservationCount must be a non-negative safe integer");
  }

  if (!context.policy) {
    return {
      enabled: false,
      plan: context.plan,
      status: "disabled",
      warningThreshold: context.warningThreshold,
      blockedBy: [],
    };
  }
  if (!input.cycleEndsAt || !Number.isFinite(input.cycleEndsAt.getTime())) {
    throw new RangeError("cycleEndsAt is required for an enabled AI quota");
  }
  if (!input.monthlyEndsAt || !Number.isFinite(input.monthlyEndsAt.getTime())) {
    throw new RangeError("monthlyEndsAt is required for an enabled AI quota");
  }

  const projectedReservedCost = input.activeReservedCostMicroUsd + input.requestedCostMicroUsd;
  const projected = evaluateAiUsageCap({
    plan: context.plan,
    cadence: context.cadence,
    cycleEndsAt: input.cycleEndsAt,
    monthlyEndsAt: input.monthlyEndsAt,
    currentCostMicroUsd: input.refreshCostMicroUsd + projectedReservedCost,
    monthlyCostMicroUsd: input.monthlyCostMicroUsd + projectedReservedCost,
    usdGbpRate: context.usdGbpRate,
    warningThreshold: context.warningThreshold,
    policy: context.policy,
  });

  const settledRefreshGbp = (input.refreshCostMicroUsd / 1_000_000) * context.usdGbpRate;
  const settledMonthlyGbp = (input.monthlyCostMicroUsd / 1_000_000) * context.usdGbpRate;
  const projectedRefreshGbp = (
    (input.refreshCostMicroUsd + projectedReservedCost) / 1_000_000
  ) * context.usdGbpRate;
  const projectedMonthlyGbp = (
    (input.monthlyCostMicroUsd + projectedReservedCost) / 1_000_000
  ) * context.usdGbpRate;
  const overshootGbp = (input.maxOvershootCostMicroUsd / 1_000_000) * context.usdGbpRate;
  const firstInFlightJob = input.activeReservationCount === 0;
  const blockedBy: AiUsageCapStatus["blockedBy"] = [];

  // Settled spend at cap always blocks. Only the first in-flight job may use
  // its feature overshoot as grace above cap; concurrent jobs get no grace.
  if (
    settledRefreshGbp >= context.policy.refreshGbp
    || projectedRefreshGbp > context.policy.refreshGbp + (firstInFlightJob ? overshootGbp : 0)
  ) {
    blockedBy.push("refresh");
  }
  if (
    settledMonthlyGbp >= context.policy.monthlyGbp
    || projectedMonthlyGbp > context.policy.monthlyGbp + (firstInFlightJob ? overshootGbp : 0)
  ) {
    blockedBy.push("monthly");
  }

  return {
    ...projected,
    status: blockedBy.length > 0 ? "blocked" : projected.status === "ok" ? "ok" : "warning",
    blockedBy,
  };
}
