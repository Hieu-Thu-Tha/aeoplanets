import assert from "node:assert/strict";
import test from "node:test";
import type { AiJob } from "@shared/schema";
import {
  aiJobAdmissionStorage,
  ensureAiJobReservation,
  runScheduledAiJob,
} from "../../../../server/services/ai-jobs/admission";
import { executeAiCall } from "../../../../server/services/ai-usage";
import type { AiUsageCapStatus } from "../../../../server/services/ai-usage/cap-policy";
import { AiUsageCapExceededError } from "../../../../server/services/ai-usage/cap";

const allowedStatus: AiUsageCapStatus = {
  enabled: true,
  plan: "accelerate",
  status: "ok",
  warningThreshold: 0.75,
  blockedBy: [],
};

const blockedStatus: AiUsageCapStatus = {
  ...allowedStatus,
  status: "blocked",
  blockedBy: ["monthly"],
  monthly: {
    spendGbp: 100,
    capGbp: 100,
    ratio: 1,
    resetsAt: "2026-09-01T00:00:00.000Z",
  },
};

const testCosts = {
  getReservationCost: async () => 1_000_000,
  getMaxOvershootCost: async () => 3_000_000,
};

const ZERO_USAGE = {
  tokens: {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
  },
  meters: [],
};

function reservedJob(): AiJob {
  const now = new Date("2026-08-19T12:00:00.000Z");
  return {
    id: "job-1",
    accountOwnerId: "owner-1",
    brandId: 10,
    feature: "visibility_scan",
    entryProvider: null,
    entryModel: null,
    entryMeters: [],
    status: "reserved",
    reservedCostMicroUsd: 1_000_000,
    modelsHash: null,
    modelProfile: null,
    expiresAt: new Date("2026-08-19T13:00:00.000Z"),
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

test("scheduled job creates and finalizes one normal reservation", async () => {
  let reserveCalls = 0;
  let finishCalls = 0;
  let finishedStatus: string | undefined;

  await runScheduledAiJob({
    userId: "owner-1",
    brandId: 10,
    feature: "visibility_scan",
  }, async () => {
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
  }, {
    admission: {
      ...testCosts,
      reserve: async () => {
        reserveCalls += 1;
        return { job: reservedJob(), aiUsageStatus: allowedStatus };
      },
      finish: async (_jobId, _ownerId, status, callCount) => {
        finishCalls += 1;
        finishedStatus = status;
        assert.equal(callCount, 0);
        return { ...reservedJob(), status, finishedAt: new Date() };
      },
    },
  });

  assert.equal(reserveCalls, 1);
  assert.equal(finishCalls, 1);
  assert.equal(finishedStatus, "completed");
});

test("executeAiCall assigns invocation order before each provider attempt", async () => {
  const indexesSeenByProviders: number[] = [];
  let reserveCalls = 0;
  let expectedCallCount: number | undefined;

  await runScheduledAiJob({
    userId: "owner-1",
    brandId: 10,
    feature: "visibility_scan",
  }, async () => {
    for (const model of ["model-1", "model-2", "model-3"]) {
      await assert.rejects(
        executeAiCall(
          { userId: "owner-1", brandId: 10, feature: "visibility_scan", source: "scheduled" },
          "gemini",
          model,
          async () => {
            indexesSeenByProviders.push(
              aiJobAdmissionStorage.getStore()!.state.nextCallIndex,
            );
            throw new Error("provider failed");
          },
          () => ZERO_USAGE,
        ),
        /provider failed/,
      );
    }
  }, {
    admission: {
      ...testCosts,
      reserve: async () => {
        reserveCalls += 1;
        return { job: reservedJob(), aiUsageStatus: allowedStatus };
      },
      finish: async (_jobId, _ownerId, status, callCount) => {
        expectedCallCount = callCount;
        return { ...reservedJob(), status, finishedAt: new Date() };
      },
    },
  });

  assert.deepEqual(indexesSeenByProviders, [1, 2, 3]);
  assert.equal(reserveCalls, 1);
  assert.equal(expectedCallCount, 0);
});

test("quota rejection starts the logical job but not its provider call", async () => {
  let operationCalls = 0;
  let providerCalls = 0;
  let finishCalls = 0;
  let notificationCalls = 0;

  await assert.rejects(
    runScheduledAiJob({
      userId: "owner-1",
      brandId: 10,
      feature: "coverage",
    }, async () => {
      operationCalls += 1;
      await executeAiCall(
        { userId: "owner-1", brandId: 10, feature: "coverage", source: "scheduled" },
        "openai",
        "gpt-4o-mini",
        async () => {
          providerCalls += 1;
          return {};
        },
        () => ZERO_USAGE,
      );
    }, {
      admission: {
        ...testCosts,
        reserve: async () => {
          throw new AiUsageCapExceededError(blockedStatus);
        },
        finish: async () => {
          finishCalls += 1;
          return reservedJob();
        },
      },
      notifyBlocked: async (accountOwnerId, status) => {
        notificationCalls += 1;
        assert.equal(accountOwnerId, "owner-1");
        assert.equal(status, blockedStatus);
      },
    }),
    AiUsageCapExceededError,
  );

  assert.equal(operationCalls, 1);
  assert.equal(providerCalls, 0);
  assert.equal(finishCalls, 0);
  assert.equal(notificationCalls, 1);
});

test("notification failure cannot unblock a scheduled provider call", async () => {
  let operationCalls = 0;
  let providerCalls = 0;

  await assert.rejects(
    runScheduledAiJob({
      userId: "owner-1",
      feature: "perception",
    }, async () => {
      operationCalls += 1;
      await executeAiCall(
        { userId: "owner-1", feature: "perception", source: "scheduled" },
        "gemini",
        "gemini-2.5-flash",
        async () => {
          providerCalls += 1;
          return {};
        },
        () => ZERO_USAGE,
      );
    }, {
      admission: {
        ...testCosts,
        reserve: async () => {
          throw new AiUsageCapExceededError(blockedStatus);
        },
      },
      notifyBlocked: async () => {
        throw new Error("email unavailable");
      },
    }),
    AiUsageCapExceededError,
  );

  assert.equal(operationCalls, 1);
  assert.equal(providerCalls, 0);
});

test("scheduled calls fail closed outside a trusted admission", async () => {
  await assert.rejects(
    executeAiCall(
      { userId: "owner-1", brandId: 10, feature: "visibility_scan", source: "scheduled" },
      "gemini",
      "gemini-2.5-flash",
      async () => ({}),
      () => ZERO_USAGE,
    ),
    /requires an active admission/,
  );
});

test("scheduled operation failure finalizes its reservation as failed", async () => {
  let finishedStatus: string | undefined;

  await assert.rejects(
    runScheduledAiJob({
      userId: "owner-1",
      brandId: 10,
      feature: "perception",
    }, async () => {
      await ensureAiJobReservation({
        userId: "owner-1",
        brandId: 10,
        feature: "perception",
      });
      throw new Error("analysis failed");
    }, {
      admission: {
        ...testCosts,
        reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
        finish: async (_jobId, _ownerId, status) => {
          finishedStatus = status;
          return { ...reservedJob(), status, finishedAt: new Date() };
        },
      },
    }),
    /analysis failed/,
  );

  assert.equal(finishedStatus, "failed");
});
