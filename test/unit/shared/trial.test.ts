import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrialEnd,
  DEFAULT_TRIAL_PLAN,
  isPersistedTrialPlan,
  isTrialPlan,
  isValidTrialDurationDays,
  trialDayAdjective,
  trialDaysPhrase,
  trialPlanLabel,
} from "../../../shared/trial";

test("calculates an explicit per-account trial end", () => {
  const start = new Date("2026-08-10T12:00:00.000Z");
  assert.equal(calculateTrialEnd(start, 60).toISOString(), "2026-10-09T12:00:00.000Z");
});

test("validates whole-day trial durations of at least one", () => {
  assert.equal(isValidTrialDurationDays(1), true);
  assert.equal(isValidTrialDurationDays(2), true);
  assert.equal(isValidTrialDurationDays(10_000), true);
  assert.equal(isValidTrialDurationDays(0), false);
  assert.equal(isValidTrialDurationDays(30.5), false);
});

test("formats account-specific trial copy", () => {
  assert.equal(trialDayAdjective(60), "60-day");
  assert.equal(trialDaysPhrase(60), "60 days");
  assert.equal(trialDaysPhrase(1), "1 day");
});

test("accepts only current self-serve plans for new trials", () => {
  assert.equal(isTrialPlan("starter_v2"), true);
  assert.equal(isTrialPlan("growth_v2"), true);
  assert.equal(isTrialPlan("accelerate"), true);
  assert.equal(isTrialPlan("starter"), false);
  assert.equal(isTrialPlan("growth"), false);
  assert.equal(isTrialPlan("enterprise"), false);
});

test("preserves legacy Starter only as historical trial data", () => {
  assert.equal(DEFAULT_TRIAL_PLAN, "starter_v2");
  assert.equal(isPersistedTrialPlan("starter"), true);
  assert.equal(isPersistedTrialPlan("growth"), false);
  assert.equal(trialPlanLabel("starter"), "Starter (legacy)");
  assert.equal(trialPlanLabel("growth_v2"), "Growth");
});
