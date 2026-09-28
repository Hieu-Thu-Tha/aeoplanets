import assert from "node:assert/strict";
import test from "node:test";
import { getTrialCompetitorLimit } from "../../../../server/services/trial-plan-policy";

test("grandfathers the competitor allowance for active legacy Starter trials", () => {
  assert.equal(getTrialCompetitorLimit({ plan: "starter", isInTrial: true, baseLimit: 3, extraCompetitors: 0 }), 15);
});

test("uses exact current-plan limits for new trials", () => {
  assert.equal(getTrialCompetitorLimit({ plan: "starter_v2", isInTrial: true, baseLimit: 5, extraCompetitors: 0 }), 5);
  assert.equal(getTrialCompetitorLimit({ plan: "growth_v2", isInTrial: true, baseLimit: 10, extraCompetitors: 0 }), 10);
  assert.equal(getTrialCompetitorLimit({ plan: "accelerate", isInTrial: true, baseLimit: 10, extraCompetitors: 0 }), 10);
});

test("retains add-ons outside a trial and unlimited base limits", () => {
  assert.equal(getTrialCompetitorLimit({ plan: "growth_v2", isInTrial: false, baseLimit: 10, extraCompetitors: 5 }), 15);
  assert.equal(getTrialCompetitorLimit({ plan: "enterprise", isInTrial: false, baseLimit: null, extraCompetitors: 5 }), null);
});
