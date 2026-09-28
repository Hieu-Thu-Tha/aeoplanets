import type { Response } from "express";
import { getConfigValue, getUsdToGbpRate } from "../system-config";
import type { AiUsageCapsConfig } from "../../config/system-config-defaults";
import {
  getCurrentCycleSpendDetails,
  getMonthlySpendDetails,
} from "./spend";
import { evaluateAiUsageCap, type AiUsageCapStatus } from "./cap-policy";

export class AiUsageCapExceededError extends Error {
  constructor(public readonly capStatus: AiUsageCapStatus) {
    super("AI usage allowance reached");
    this.name = "AiUsageCapExceededError";
  }
}

export function isAiUsageCapExceededError(
  error: unknown,
): error is AiUsageCapExceededError {
  return error instanceof AiUsageCapExceededError;
}

export async function getAiUsageCapStatus(userId: string): Promise<AiUsageCapStatus> {
  let current = await getCurrentCycleSpendDetails(userId);
  const config = await getConfigValue<AiUsageCapsConfig>("ai_usage_caps");
  const policy = config.accountOverrides[userId] ?? config.plans[current.plan];

  // Null policies are Custom/Agency accounts awaiting a negotiated account
  // override. System work is exempted explicitly by its usage source, rather
  // than implicitly exempting every account that lacks a subscription row.
  if (!policy) {
    return {
      enabled: false,
      plan: current.plan,
      status: "disabled",
      warningThreshold: config.warningThreshold,
      blockedBy: [],
    };
  }

  if (policy.cadence && policy.cadence !== current.cadence) {
    current = await getCurrentCycleSpendDetails(userId, policy.cadence);
  }

  const monthly = await getMonthlySpendDetails(userId);
  const usdGbpRate = await getUsdToGbpRate();
  return evaluateAiUsageCap({
    plan: current.plan,
    cadence: current.cadence,
    cycleEndsAt: current.end,
    monthlyEndsAt: monthly.end,
    currentCostMicroUsd: current.costMicroUsd,
    monthlyCostMicroUsd: monthly.costMicroUsd,
    usdGbpRate,
    warningThreshold: config.warningThreshold,
    policy,
  });
}

export function aiUsageCapResponse(status: AiUsageCapStatus) {
  const monthlyBlocked = status.blockedBy.includes("monthly");
  return {
    code: "AI_USAGE_CAP_REACHED",
    message: monthlyBlocked
      ? "Your monthly AI allowance has been reached. AI actions and scheduled refreshes are paused until next month. Upgrade your plan for more capacity."
      : "Your AI allowance for this refresh period has been reached. AI actions and scheduled refreshes are paused until it refreshes.",
    usage: status,
  };
}

export function sendAiUsageCapError(res: Response, error: unknown): boolean {
  if (!isAiUsageCapExceededError(error)) return false;
  res.setHeader("X-AI-Usage-Status", "blocked");
  res.status(429).json(aiUsageCapResponse(error.capStatus));
  return true;
}
