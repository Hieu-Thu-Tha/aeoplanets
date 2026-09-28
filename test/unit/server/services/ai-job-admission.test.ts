import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { AiJob } from "@shared/schema";
import {
  attachAiJobAdmissionToResponse,
  ensureAiJobReservation,
  hasValidAiJobAdmission,
  registerAiJobBackgroundWork,
  runWithAiJobAdmission,
} from "../../../../server/services/ai-jobs/admission";
import { executeAiCall } from "../../../../server/services/ai-usage";
import type { AiUsageCapStatus } from "../../../../server/services/ai-usage/cap-policy";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";

const allowedStatus: AiUsageCapStatus = {
  enabled: true,
  plan: "accelerate",
  status: "ok",
  warningThreshold: 0.75,
  blockedBy: [],
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

function responseMock(): Response & EventEmitter {
  const response = new EventEmitter() as Response & EventEmitter;
  response.statusCode = 200;
  response.headersSent = false;
  response.setHeader = (() => response) as Response["setHeader"];
  return response;
}

test("admission is valid only for its billing account and async descendants", async () => {
  assert.equal(hasValidAiJobAdmission("owner-1"), false);

  await runWithAiJobAdmission("owner-1", async () => {
    assert.equal(hasValidAiJobAdmission("owner-1"), true);
    assert.equal(hasValidAiJobAdmission("owner-2"), false);
    await Promise.resolve();
    assert.equal(hasValidAiJobAdmission("owner-1"), true);
  });

  assert.equal(hasValidAiJobAdmission("owner-1"), false);
});

test("concurrent admissions remain isolated by account", async () => {
  let releaseOwnerOne!: () => void;
  const ownerOneBlocked = new Promise<void>((resolve) => {
    releaseOwnerOne = resolve;
  });

  const ownerOne = runWithAiJobAdmission("owner-1", async () => {
    await ownerOneBlocked;
    assert.equal(hasValidAiJobAdmission("owner-1"), true);
    assert.equal(hasValidAiJobAdmission("owner-2"), false);
  });

  const ownerTwo = runWithAiJobAdmission("owner-2", async () => {
    assert.equal(hasValidAiJobAdmission("owner-2"), true);
    assert.equal(hasValidAiJobAdmission("owner-1"), false);
    releaseOwnerOne();
  });

  await Promise.all([ownerOne, ownerTwo]);
});

test("nested admissions restore the outer job context", async () => {
  await runWithAiJobAdmission("owner-1", async () => {
    assert.equal(hasValidAiJobAdmission("owner-1"), true);

    await runWithAiJobAdmission("owner-2", async () => {
      assert.equal(hasValidAiJobAdmission("owner-2"), true);
      assert.equal(hasValidAiJobAdmission("owner-1"), false);
    });

    assert.equal(hasValidAiJobAdmission("owner-1"), true);
    assert.equal(hasValidAiJobAdmission("owner-2"), false);
  });
});

test("detached async work created by an admitted job inherits admission", async () => {
  let detached!: Promise<boolean>;

  runWithAiJobAdmission("owner-1", () => {
    detached = new Promise((resolve) => {
      setTimeout(() => resolve(hasValidAiJobAdmission("owner-1")), 0);
    });
  });

  assert.equal(await detached, true);
  assert.equal(hasValidAiJobAdmission("owner-1"), false);
});

test("blank account IDs cannot create an admission", () => {
  assert.throws(
    () => runWithAiJobAdmission("", () => undefined),
    /accountOwnerId is required/,
  );
});

test("reservation preflight accepts work in the admitted job", async () => {
  await runWithAiJobAdmission("owner-1", async () => {
    const result = await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    assert.equal(result.aiUsageStatus, allowedStatus);
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
  });
});

test("concurrent first calls share one durable reservation", async () => {
  let reserveCalls = 0;
  let reservedFeature: string | undefined;

  await runWithAiJobAdmission("owner-1", async () => {
    const statuses = await Promise.all([
      ensureAiJobReservation({
        userId: "owner-1",
        brandId: 10,
        feature: "perception",
      }),
      ensureAiJobReservation({
        userId: "owner-1",
        brandId: 10,
        feature: "coverage",
      }),
    ]);
    assert.deepEqual(statuses.map((result) => result.aiUsageStatus), [allowedStatus, allowedStatus]);
  }, {
    ...testCosts,
    feature: "visibility_scan",
    reserve: async (input) => {
      reserveCalls += 1;
      reservedFeature = input.feature;
      return { job: reservedJob(), aiUsageStatus: allowedStatus };
    },
  });

  assert.equal(reserveCalls, 1);
  assert.equal(reservedFeature, "visibility_scan");
});

test("reservation estimate and overshoot use independent defaults", async () => {
  let reservation: {
    reservedCostMicroUsd: number;
    maxOvershootCostMicroUsd: number;
    entryMeters?: unknown;
  } | undefined;
  let estimateInput: {
    feature: string;
    provider?: string;
    model?: string;
    meters?: unknown;
  } | undefined;

  await runWithAiJobAdmission("owner-1", async () => {
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
      provider: "gemini",
      model: "gemini-2.5-flash",
      meters: [GEMINI_GROUNDED_PROMPT_METER],
    });
  }, {
    getReservationCost: async (feature, provider, model, meters) => {
      estimateInput = { feature, provider, model, meters };
      return 1_000_000;
    },
    getMaxOvershootCost: testCosts.getMaxOvershootCost,
    reserve: async (input) => {
      reservation = input;
      return { job: reservedJob(), aiUsageStatus: allowedStatus };
    },
  });

  assert.equal(reservation?.reservedCostMicroUsd, 1_000_000);
  assert.equal(reservation?.maxOvershootCostMicroUsd, 3_000_000);
  assert.deepEqual(estimateInput, {
    feature: "visibility_scan",
    provider: "gemini",
    model: "gemini-2.5-flash",
    meters: [GEMINI_GROUNDED_PROMPT_METER],
  });
  assert.deepEqual(reservation?.entryMeters, [GEMINI_GROUNDED_PROMPT_METER]);
});

test("response completion finalizes an admitted reservation", async () => {
  const response = responseMock();
  let finishedStatus: string | undefined;
  let expectedCallCount: number | undefined;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    response.emit("finish");
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status, callCount) => {
      finishedStatus = status;
      expectedCallCount = callCount;
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(finishedStatus, "completed");
  assert.equal(expectedCallCount, 0);
});

test("no-op response creates no reservation", async () => {
  const response = responseMock();
  let reserveCalls = 0;
  let finishCalls = 0;

  runWithAiJobAdmission("owner-1", () => {
    attachAiJobAdmissionToResponse(response);
    response.emit("finish");
  }, {
    ...testCosts,
    reserve: async () => {
      reserveCalls += 1;
      return { job: reservedJob(), aiUsageStatus: allowedStatus };
    },
    finish: async () => {
      finishCalls += 1;
      return reservedJob();
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reserveCalls, 0);
  assert.equal(finishCalls, 0);
});

test("closed no-op admission cannot create an orphan reservation", async () => {
  const response = responseMock();
  let reserveCalls = 0;
  let lateCall!: Promise<unknown>;

  runWithAiJobAdmission("owner-1", () => {
    attachAiJobAdmissionToResponse(response);
    response.emit("finish");
    lateCall = ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
  }, {
    ...testCosts,
    reserve: async () => {
      reserveCalls += 1;
      return { job: reservedJob(), aiUsageStatus: allowedStatus };
    },
  });

  await assert.rejects(lateCall, /already closed/);
  assert.equal(reserveCalls, 0);
});

test("detached failure delays finalization and marks the job failed", async () => {
  const response = responseMock();
  let rejectWork!: (error: Error) => void;
  const work = new Promise<void>((_resolve, reject) => {
    rejectWork = reject;
  });
  let finishCalls = 0;
  let finishedStatus: string | undefined;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    await registerAiJobBackgroundWork(() => work);
    response.emit("finish");
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      finishCalls += 1;
      finishedStatus = status;
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finishCalls, 0);

  rejectWork(new Error("scan failed"));
  await finished;
  assert.equal(finishCalls, 1);
  assert.equal(finishedStatus, "failed");
});

test("registered detached work may start provider calls after response finish", async () => {
  const response = responseMock();
  let releaseWork!: () => void;
  const workReady = new Promise<void>((resolve) => {
    releaseWork = resolve;
  });
  let providerCalls = 0;
  let finishCalls = 0;
  let finishedStatus: string | undefined;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    let work!: Promise<unknown>;
    await registerAiJobBackgroundWork(() => {
      work = workReady.then(() => executeAiCall(
        { userId: "owner-1", brandId: 10, feature: "visibility_scan" },
        "gemini",
        "gemini-2.5-flash",
        async () => {
          providerCalls += 1;
          throw new Error("provider failed");
        },
        () => ZERO_USAGE,
      ));
      return work;
    });
    response.emit("finish");
    releaseWork();
    await assert.rejects(work, /provider failed/);
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      finishCalls += 1;
      finishedStatus = status;
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(providerCalls, 1);
  assert.equal(finishCalls, 1);
  assert.equal(finishedStatus, "failed");
});

test("ordinary request work cannot start a provider after closing during reservation", async () => {
  const response = responseMock();
  let releaseEstimate!: () => void;
  const estimateBlocked = new Promise<void>((resolve) => {
    releaseEstimate = resolve;
  });
  let providerCalls = 0;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    const call = executeAiCall(
      { userId: "owner-1", brandId: 10, feature: "visibility_scan" },
      "gemini",
      "gemini-2.5-flash",
      async () => {
        providerCalls += 1;
        throw new Error("provider should not start");
      },
      () => ZERO_USAGE,
    );
    response.emit("close");
    releaseEstimate();
    await assert.rejects(call, /closed before the provider call started/);
  }, {
    getReservationCost: async () => {
      await estimateBlocked;
      return 1_000_000;
    },
    getMaxOvershootCost: testCosts.getMaxOvershootCost,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      assert.equal(status, "failed");
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(providerCalls, 0);
});

test("registered work does not admit unrelated request descendants after response finish", async () => {
  const response = responseMock();
  let releaseBackground!: () => void;
  const backgroundWork = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  let providerCalls = 0;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    await registerAiJobBackgroundWork(() => backgroundWork);
    response.emit("finish");
    await assert.rejects(
      executeAiCall(
        { userId: "owner-1", brandId: 10, feature: "visibility_scan" },
        "gemini",
        "gemini-2.5-flash",
        async () => {
          providerCalls += 1;
          throw new Error("provider should not start");
        },
        () => ZERO_USAGE,
      ),
      /already closed/,
    );
    releaseBackground();
    await backgroundWork;
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      assert.equal(status, "completed");
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(providerCalls, 0);
});

test("background registration claims lifecycle ownership before async preparation", async () => {
  const response = responseMock();
  let releasePreparation!: () => void;
  const preparationBlocked = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let workStarted = false;
  let finishCalls = 0;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    await ensureAiJobReservation({
      userId: "owner-1",
      brandId: 10,
      feature: "visibility_scan",
    });
    const registration = registerAiJobBackgroundWork(
      async () => {
        workStarted = true;
      },
      async () => {
        await preparationBlocked;
      },
    );
    response.emit("close");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finishCalls, 0);
    assert.equal(workStarted, false);
    releasePreparation();
    await registration;
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      finishCalls += 1;
      assert.equal(status, "failed");
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(workStarted, true);
  assert.equal(finishCalls, 1);
});

test("response close waits for active calls and failure remains monotonic", async () => {
  const response = responseMock();
  let releaseProvider!: () => void;
  const providerBlocked = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  let providerStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  let finishCalls = 0;
  let finishedStatus: string | undefined;
  let finishDone!: () => void;
  const finished = new Promise<void>((resolve) => {
    finishDone = resolve;
  });

  await runWithAiJobAdmission("owner-1", async () => {
    attachAiJobAdmissionToResponse(response);
    const call = executeAiCall(
      { userId: "owner-1", brandId: 10, feature: "visibility_scan" },
      "gemini",
      "gemini-2.5-flash",
      async () => {
        providerStarted();
        await providerBlocked;
        throw new Error("provider failed");
      },
      () => ZERO_USAGE,
    );
    await started;
    response.emit("close");
    response.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finishCalls, 0);
    releaseProvider();
    await assert.rejects(call, /provider failed/);
  }, {
    ...testCosts,
    reserve: async () => ({ job: reservedJob(), aiUsageStatus: allowedStatus }),
    finish: async (_jobId, _ownerId, status) => {
      finishCalls += 1;
      finishedStatus = status;
      finishDone();
      return { ...reservedJob(), status, finishedAt: new Date() };
    },
  });

  await finished;
  assert.equal(finishCalls, 1);
  assert.equal(finishedStatus, "failed");
});
