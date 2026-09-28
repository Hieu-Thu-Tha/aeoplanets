export type AiUsageWindowStatus = {
  spendGbp: number;
  capGbp: number;
  ratio: number;
  resetsAt?: string;
};

export type AiUsageCapStatus = {
  enabled: boolean;
  plan: string;
  status: "disabled" | "ok" | "warning" | "blocked";
  warningThreshold: number;
  blockedBy: Array<"refresh" | "monthly">;
  refresh?: AiUsageWindowStatus & { cadence: "daily" | "weekly" | "monthly" };
  monthly?: AiUsageWindowStatus;
};

export type AiUsageCapPolicy = {
  refreshGbp: number;
  monthlyGbp: number;
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateAiUsageCap(input: {
  plan: string;
  cadence: "daily" | "weekly" | "monthly";
  cycleEndsAt: Date;
  monthlyEndsAt: Date;
  currentCostMicroUsd: number;
  monthlyCostMicroUsd: number;
  usdGbpRate: number;
  warningThreshold: number;
  policy: AiUsageCapPolicy;
}): AiUsageCapStatus {
  const refreshSpendGbp = (input.currentCostMicroUsd / 1_000_000) * input.usdGbpRate;
  const monthlySpendGbp = (input.monthlyCostMicroUsd / 1_000_000) * input.usdGbpRate;
  const refreshRatio = refreshSpendGbp / input.policy.refreshGbp;
  const monthlyRatio = monthlySpendGbp / input.policy.monthlyGbp;
  const blockedBy: AiUsageCapStatus["blockedBy"] = [];
  if (refreshRatio >= 1) blockedBy.push("refresh");
  if (monthlyRatio >= 1) blockedBy.push("monthly");
  const warning =
    refreshRatio >= input.warningThreshold || monthlyRatio >= input.warningThreshold;

  return {
    enabled: true,
    plan: input.plan,
    status: blockedBy.length > 0 ? "blocked" : warning ? "warning" : "ok",
    warningThreshold: input.warningThreshold,
    blockedBy,
    refresh: {
      spendGbp: roundCurrency(refreshSpendGbp),
      capGbp: input.policy.refreshGbp,
      ratio: refreshRatio,
      resetsAt: input.cycleEndsAt.toISOString(),
      cadence: input.cadence,
    },
    monthly: {
      spendGbp: roundCurrency(monthlySpendGbp),
      capGbp: input.policy.monthlyGbp,
      ratio: monthlyRatio,
      resetsAt: input.monthlyEndsAt.toISOString(),
    },
  };
}
