import assert from "node:assert/strict";
import test from "node:test";
import { aiUsageCapsSchema, SYSTEM_CONFIG_REGISTRY } from "../../../../server/config/system-config-defaults";
import { evaluateAiUsageCap } from "../../../../server/services/ai-usage/cap-policy";

const baseInput = {
  plan: "starter_v2",
  cadence: "weekly" as const,
  cycleEndsAt: new Date("2026-08-10T00:00:00.000Z"),
  monthlyEndsAt: new Date("2026-09-01T00:00:00.000Z"),
  usdGbpRate: 0.8,
  warningThreshold: 0.75,
  policy: { refreshGbp: 20, monthlyGbp: 48.75 },
};

test("default cap configuration matches the agreed current-plan ceilings", () => {
  const defaults = SYSTEM_CONFIG_REGISTRY.ai_usage_caps.default as any;

  assert.deepEqual(defaults.plans.starter_v2, { refreshGbp: 20, monthlyGbp: 48.75 });
  assert.deepEqual(defaults.plans.growth_v2, { refreshGbp: 20, monthlyGbp: 100 });
  assert.deepEqual(defaults.plans.accelerate, { refreshGbp: 20, monthlyGbp: 195 });
  assert.equal(defaults.plans.enterprise, null);
  assert.equal(defaults.plans.agency, null);
  assert.equal(aiUsageCapsSchema.safeParse(defaults).success, true);
});

test("warning thresholds must be strictly between zero and one", () => {
  const defaults = SYSTEM_CONFIG_REGISTRY.ai_usage_caps.default as any;
  assert.equal(aiUsageCapsSchema.safeParse({ ...defaults, warningThreshold: 0 }).success, false);
  assert.equal(aiUsageCapsSchema.safeParse({ ...defaults, warningThreshold: 1 }).success, false);
});

test("contract account overrides accept a negotiated refresh cadence", () => {
  const defaults = SYSTEM_CONFIG_REGISTRY.ai_usage_caps.default as any;
  const parsed = aiUsageCapsSchema.parse({
    ...defaults,
    accountOverrides: {
      "agency-parent": {
        refreshGbp: 125,
        monthlyGbp: 500,
        cadence: "weekly",
      },
    },
  });

  assert.equal(parsed.accountOverrides["agency-parent"].cadence, "weekly");
});

test("usage remains normal below both warning thresholds", () => {
  const status = evaluateAiUsageCap({
    ...baseInput,
    currentCostMicroUsd: 10_000_000,
    monthlyCostMicroUsd: 20_000_000,
  });

  assert.equal(status.status, "ok");
  assert.deepEqual(status.blockedBy, []);
});

test("75 percent of either window produces a warning without blocking", () => {
  const status = evaluateAiUsageCap({
    ...baseInput,
    // $18.75 at 0.8 USD/GBP = £15, exactly 75% of the £20 refresh cap.
    currentCostMicroUsd: 18_750_000,
    monthlyCostMicroUsd: 18_750_000,
  });

  assert.equal(status.status, "warning");
  assert.deepEqual(status.blockedBy, []);
  assert.equal(status.refresh?.spendGbp, 15);
});

test("either cap blocks and reports every exceeded window", () => {
  const status = evaluateAiUsageCap({
    ...baseInput,
    currentCostMicroUsd: 25_000_000,
    monthlyCostMicroUsd: 62_500_000,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["refresh", "monthly"]);
  assert.equal(status.refresh?.resetsAt, "2026-08-10T00:00:00.000Z");
  assert.equal(status.monthly?.resetsAt, "2026-09-01T00:00:00.000Z");
});

test("the UTC calendar-month ceiling blocks independently of the refresh window", () => {
  const status = evaluateAiUsageCap({
    ...baseInput,
    currentCostMicroUsd: 10_000_000,
    monthlyCostMicroUsd: 62_500_000,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["monthly"]);
});
