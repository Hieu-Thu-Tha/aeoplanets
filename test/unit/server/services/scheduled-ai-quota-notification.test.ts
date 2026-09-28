import assert from "node:assert/strict";
import test from "node:test";
import {
  getScheduledAiQuotaResetAt,
} from "../../../../server/services/scheduled-ai-quota-notification";
import type { AiUsageCapStatus } from "../../../../server/services/ai-usage/cap-policy";

function blockedStatus(blockedBy: AiUsageCapStatus["blockedBy"]): AiUsageCapStatus {
  return {
    enabled: true,
    plan: "accelerate",
    status: "blocked",
    warningThreshold: 0.75,
    blockedBy,
    refresh: {
      spendGbp: 10,
      capGbp: 10,
      ratio: 1,
      resetsAt: "2026-08-21T00:00:00.000Z",
      cadence: "daily",
    },
    monthly: {
      spendGbp: 100,
      capGbp: 100,
      ratio: 1,
      resetsAt: "2026-09-01T00:00:00.000Z",
    },
  };
}

test("notification window uses the later reset while both quotas block", () => {
  assert.equal(
    getScheduledAiQuotaResetAt(blockedStatus(["refresh", "monthly"]))?.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
});

test("notification window resets with the active blocking quota", () => {
  assert.equal(
    getScheduledAiQuotaResetAt(blockedStatus(["refresh"]))?.toISOString(),
    "2026-08-21T00:00:00.000Z",
  );
  assert.equal(
    getScheduledAiQuotaResetAt(blockedStatus(["monthly"]))?.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
});

test("notification window ignores missing or malformed reset timestamps", () => {
  const status = blockedStatus(["refresh"]);
  status.refresh!.resetsAt = "not-a-date";
  assert.equal(getScheduledAiQuotaResetAt(status), undefined);
});
