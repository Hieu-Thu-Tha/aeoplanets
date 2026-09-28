import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateActiveReservationHoldMicroUsd,
  evaluateAiJobAdmission,
  type AiJobQuotaPolicyContext,
} from "../../../../server/services/ai-jobs/reservation-policy";
import { AI_FEATURES } from "../../../../server/services/ai-usage/types";
import {
  aiJobMaxOvershootUsdSchema,
  aiJobReservationUsdSchema,
  DEFAULT_AI_JOB_MAX_OVERSHOOT_USD,
  DEFAULT_AI_JOB_RESERVATION_USD,
} from "../../../../server/config/system-config-defaults";

const policy: AiJobQuotaPolicyContext = {
  plan: "accelerate",
  warningThreshold: 0.75,
  policy: { refreshGbp: 1, monthlyGbp: 2 },
  cadence: "daily",
  usdGbpRate: 1,
};
const cycleEndsAt = new Date("2026-08-20T00:00:00.000Z");
const monthlyEndsAt = new Date("2026-09-01T00:00:00.000Z");

function evaluateForPolicy(
  input: Omit<Parameters<typeof evaluateAiJobAdmission>[0], "context">,
) {
  return evaluateAiJobAdmission({ context: policy, ...input });
}

test("first job may exactly reach cap plus its feature overshoot", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 900_000,
    monthlyCostMicroUsd: 1_600_000,
    activeReservedCostMicroUsd: 0,
    activeReservationCount: 0,
    requestedCostMicroUsd: 300_000,
    maxOvershootCostMicroUsd: 200_000,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "warning");
  assert.equal(status.refresh?.spendGbp, 1.2);
  assert.deepEqual(status.blockedBy, []);
});

test("first-job projection one micro-dollar above cap plus overshoot is blocked", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 900_000,
    monthlyCostMicroUsd: 900_000,
    activeReservedCostMicroUsd: 0,
    activeReservationCount: 0,
    requestedCostMicroUsd: 300_001,
    maxOvershootCostMicroUsd: 200_000,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["refresh"]);
});

test("first job is blocked when settled usage has already reached cap", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 1_000_000,
    monthlyCostMicroUsd: 1_000_000,
    activeReservedCostMicroUsd: 0,
    activeReservationCount: 0,
    requestedCostMicroUsd: 200_000,
    maxOvershootCostMicroUsd: 200_000,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["refresh"]);
});

test("concurrent job may reach but not exceed the cap", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 700_000,
    monthlyCostMicroUsd: 700_000,
    activeReservedCostMicroUsd: 200_000,
    activeReservationCount: 1,
    requestedCostMicroUsd: 100_000,
    maxOvershootCostMicroUsd: 100_000,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "warning");
  assert.deepEqual(status.blockedBy, []);
});

test("concurrent job is blocked when reservations would exceed cap", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 700_000,
    monthlyCostMicroUsd: 700_000,
    activeReservedCostMicroUsd: 200_000,
    activeReservationCount: 1,
    requestedCostMicroUsd: 100_001,
    maxOvershootCostMicroUsd: 100_001,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["refresh"]);
});

test("monthly cap applies the same first-job and concurrent rules", () => {
  const status = evaluateForPolicy({
    refreshCostMicroUsd: 100_000,
    monthlyCostMicroUsd: 1_900_000,
    activeReservedCostMicroUsd: 50_000,
    activeReservationCount: 1,
    requestedCostMicroUsd: 50_001,
    maxOvershootCostMicroUsd: 50_001,
    cycleEndsAt,
    monthlyEndsAt,
  });

  assert.equal(status.status, "blocked");
  assert.deepEqual(status.blockedBy, ["monthly"]);
});

test("cap-disabled accounts remain admitted", () => {
  const status = evaluateAiJobAdmission({
    context: {
      plan: "enterprise",
      warningThreshold: 0.75,
      policy: null,
    },
    refreshCostMicroUsd: 0,
    monthlyCostMicroUsd: 0,
    activeReservedCostMicroUsd: 0,
    activeReservationCount: 0,
    requestedCostMicroUsd: 200_000,
    maxOvershootCostMicroUsd: 200_000,
  });

  assert.equal(status.status, "disabled");
});

test("invalid monetary values are rejected", () => {
  assert.throws(() => evaluateForPolicy({
    refreshCostMicroUsd: -1,
    monthlyCostMicroUsd: 0,
    activeReservedCostMicroUsd: 0,
    activeReservationCount: 0,
    requestedCostMicroUsd: 100_000,
    maxOvershootCostMicroUsd: 100_000,
    cycleEndsAt,
    monthlyEndsAt,
  }), /non-negative safe integers/);
});

test("active reservations hold only cost not already present in settled usage", () => {
  assert.equal(calculateActiveReservationHoldMicroUsd([
    { reservedCostMicroUsd: 1_000_000, loggedCostMicroUsd: 300_000 },
    { reservedCostMicroUsd: 500_000, loggedCostMicroUsd: 700_000 },
  ]), 700_000);
});

test("every AI feature starts with a three-dollar overshoot", () => {
  const parsed = aiJobMaxOvershootUsdSchema.parse(DEFAULT_AI_JOB_MAX_OVERSHOOT_USD);
  assert.deepEqual(Object.keys(parsed).sort(), [...AI_FEATURES].sort());
  for (const feature of AI_FEATURES) assert.equal(parsed[feature], 3);
});

test("every AI feature starts with an independent $1.50 reservation fallback", () => {
  const parsed = aiJobReservationUsdSchema.parse(DEFAULT_AI_JOB_RESERVATION_USD);
  assert.deepEqual(Object.keys(parsed).sort(), [...AI_FEATURES].sort());
  for (const feature of AI_FEATURES) assert.equal(parsed[feature], 1.5);
});
