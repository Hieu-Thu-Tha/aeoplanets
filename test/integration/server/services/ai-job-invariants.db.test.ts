import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { EventEmitter } from "node:events";
import test, { before } from "node:test";
import type { Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { aiJobs, aiUsageLogs } from "@shared/schema";
import type { AiFeature } from "../../../../server/services/ai-usage";
import type { AiProvider } from "@shared/ai-billing";
import type { AiJobModelCall } from "@shared/schema";
import { OPENAI_WEB_SEARCH_METER } from "@shared/ai-billing";
import type { ModelRate } from "../../../../server/config/system-config-defaults";
import {
  attachAiJobAdmissionToResponse,
  runScheduledAiJob,
  runWithAiJobAdmission,
} from "../../../../server/services/ai-jobs/admission";
import { aiJobAccountLockQuery } from "../../../../server/services/ai-jobs/account-lock";
import {
  finishAiJobReservation,
  reserveAiJob,
  type ReserveAiJobInput,
} from "../../../../server/services/ai-jobs/reservation";
import type { AiJobQuotaPolicyContext } from "../../../../server/services/ai-jobs/reservation-policy";
import { AiUsageCapExceededError } from "../../../../server/services/ai-usage/cap";
import { executeAiCall, type BillableUsage } from "../../../../server/services/ai-usage";
import { hashAiJobModelProfile } from "../../../../server/services/ai-jobs/profile";
import {
  computeTokenCostMicroUsd,
  normalizeTokenUsage,
} from "../../../../server/services/ai-usage/tokens";
import type { TokenUsage } from "@shared/ai-billing";
import { AiJobDatabaseFixture } from "../../fixtures/ai-job";
import {
  createTestDatabasePool,
  resetTestDatabase,
  waitForBlockedSessions,
} from "../../helpers/postgres";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const ENABLED_POLICY: AiJobQuotaPolicyContext = {
  plan: "test",
  warningThreshold: 0.75,
  policy: { refreshGbp: 10, monthlyGbp: 10 },
  cadence: "daily",
  usdGbpRate: 1,
};
const DISABLED_POLICY: AiJobQuotaPolicyContext = {
  plan: "test",
  warningThreshold: 0.75,
  policy: null,
};
const RATE: ModelRate = { inputPerMTok: 1, outputPerMTok: 4 };

function billableUsage(tokens: TokenUsage): BillableUsage {
  return { tokens: normalizeTokenUsage(tokens), meters: [] };
}

before(resetTestDatabase);

function reservationInput(
  accountOwnerId: string,
  reservedCostMicroUsd: number,
  maxOvershootCostMicroUsd = 1_000_000,
): ReserveAiJobInput {
  return {
    accountOwnerId,
    feature: "report",
    entryProvider: "gemini",
    entryModel: "gemini-2.5-flash",
    reservedCostMicroUsd,
    maxOvershootCostMicroUsd,
  };
}

function reserveWith(
  database: ReturnType<typeof drizzle>,
  policy: AiJobQuotaPolicyContext,
) {
  return (input: ReserveAiJobInput) => reserveAiJob(input, {
    database,
    loadPolicy: async () => policy,
    now: () => NOW,
  });
}

function finishWith(database: ReturnType<typeof drizzle>) {
  return (
    jobId: string,
    accountOwnerId: string,
    status: "completed" | "failed",
    expectedCallCount?: number,
  ) => finishAiJobReservation(
    jobId,
    accountOwnerId,
    status,
    expectedCallCount,
    { database, now: () => NOW },
  );
}

function responseMock(): Response & EventEmitter {
  const response = new EventEmitter() as Response & EventEmitter;
  response.statusCode = 200;
  response.headersSent = false;
  response.setHeader = (() => response) as Response["setHeader"];
  return response;
}

function latch(target: number): { hit: () => void; reached: Promise<void> } {
  let count = 0;
  let resolve!: () => void;
  const reached = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    hit: () => {
      count += 1;
      if (count === target) resolve();
    },
    reached,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function shuffledDelayRanks(length: number): number[] {
  const ranks = Array.from({ length }, (_, index) => index);
  for (let index = ranks.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    [ranks[index], ranks[selected]] = [ranks[selected], ranks[index]];
  }
  if (ranks.every((rank, index) => rank === index)) {
    [ranks[0], ranks[1]] = [ranks[1], ranks[0]];
  }
  return ranks;
}

async function usageCost(database: ReturnType<typeof drizzle>, accountOwnerId: string): Promise<number> {
  const [result] = await database.select({
    cost: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}), 0)::float8`,
  }).from(aiUsageLogs).where(eq(aiUsageLogs.userId, accountOwnerId));
  return Number(result.cost);
}

async function withoutReservationLogs<T>(operation: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    return await operation();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test("near-cap reservation spam can never exceed the one-job overshoot allowance", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();

  try {
    await fixture.seedSettledUsage({
      accountOwnerId,
      costMicroUsd: 9_500_000,
      createdAt: NOW,
    });
    const reserve = reserveWith(database, ENABLED_POLICY);
    const first = await reserve(reservationInput(accountOwnerId, 1_500_000));
    assert.equal(first.aiUsageStatus.status, "warning");

    const spam = await withoutReservationLogs(() => Promise.allSettled(
      Array.from({ length: 100 }, () => reserve(reservationInput(accountOwnerId, 1))),
    ));
    assert.equal(spam.every((result) => (
      result.status === "rejected" && result.reason instanceof AiUsageCapExceededError
    )), true);

    const [held] = await database.select({
      total: sql<number>`coalesce(sum(${aiJobs.reservedCostMicroUsd}), 0)::float8`,
    }).from(aiJobs).where(and(
      eq(aiJobs.accountOwnerId, accountOwnerId),
      eq(aiJobs.status, "reserved"),
    ));
    const projectedCost = 9_500_000 + Number(held.total);
    assert.equal(projectedCost, 11_000_000);
    assert.ok(projectedCost <= 10_000_000 + 1_000_000);
    assert.equal(await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)), 1);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("one thousand concurrent zero-usage jobs all settle durably", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const reserve = reserveWith(database, DISABLED_POLICY);
  const finish = finishWith(database);
  const jobCount = 1_000;

  try {
    const settled = await withoutReservationLogs(() => Promise.all(Array.from(
      { length: jobCount },
      (_, index) => runScheduledAiJob({
        userId: accountOwnerId,
        feature: "report",
      }, () => executeAiCall(
        { userId: accountOwnerId, feature: "report", source: "scheduled" },
        "gemini",
        "gemini-2.5-flash",
        async () => index,
        () => billableUsage({ inputTokens: 0, outputTokens: 0 }),
        { database, getPricing: async () => RATE, now: () => NOW },
      ), {
        admission: {
          reserve,
          finish,
          getReservationCost: async () => 1,
          getMaxOvershootCost: async () => 1,
        },
      }),
    )));
    assert.equal(settled.length, jobCount);
    assert.equal(new Set(settled).size, jobCount);

    const jobs = await database.select({
      id: aiJobs.id,
      status: aiJobs.status,
      modelsHash: aiJobs.modelsHash,
      modelProfile: aiJobs.modelProfile,
      usageCount: sql<number>`count(${aiUsageLogs.id})::int`,
      minimumCallIndex: sql<number>`min(${aiUsageLogs.callIndex})::int`,
      maximumCallIndex: sql<number>`max(${aiUsageLogs.callIndex})::int`,
    }).from(aiJobs).leftJoin(aiUsageLogs, eq(aiUsageLogs.jobId, aiJobs.id))
      .where(eq(aiJobs.accountOwnerId, accountOwnerId))
      .groupBy(aiJobs.id);
    assert.equal(jobs.length, jobCount);
    assert.equal(jobs.every((job) => job.status === "completed"), true);
    assert.equal(jobs.every((job) => job.usageCount === 1), true);
    assert.equal(jobs.every((job) => job.minimumCallIndex === 0), true);
    assert.equal(jobs.every((job) => job.maximumCallIndex === 0), true);
    assert.equal(jobs.every((job) => job.modelsHash != null), true);
    assert.equal(jobs.every((job) => job.modelProfile?.length === 1), true);
    assert.equal(await database.$count(
      aiUsageLogs,
      eq(aiUsageLogs.userId, accountOwnerId),
    ), jobCount);
    assert.equal(await usageCost(database, accountOwnerId), 0);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("settled usage growth equals the sum of every completed provider call", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const reserve = reserveWith(database, DISABLED_POLICY);
  const finish = finishWith(database);
  const features: AiFeature[] = ["report", "perception", "coverage"];
  const jobs = Array.from({ length: 30 }, (_, jobIndex) => ({
    feature: features[jobIndex % features.length],
    calls: Array.from({ length: jobIndex % 4 + 1 }, (_, callIndex): TokenUsage => ({
      inputTokens: (jobIndex + 1) * 1_000 + callIndex * 100,
      outputTokens: (callIndex + 1) * 250,
    })),
  }));

  try {
    const before = await usageCost(database, accountOwnerId);
    const expected = jobs.flatMap((job) => job.calls)
      .reduce((total, usage) => total + computeTokenCostMicroUsd(usage, RATE), 0);
    await withoutReservationLogs(() => Promise.all(jobs.map((job) => runScheduledAiJob({
      userId: accountOwnerId,
      feature: job.feature,
    }, async () => Promise.all(job.calls.map((usage) => executeAiCall(
      { userId: accountOwnerId, feature: job.feature, source: "scheduled" },
      "gemini",
      "gemini-2.5-flash",
      async () => usage,
      (result) => billableUsage(result),
      { database, getPricing: async () => RATE, now: () => NOW },
    ))), {
      admission: {
        reserve,
        finish,
        getReservationCost: async () => 1,
        getMaxOvershootCost: async () => 1,
      },
    }))));
    const after = await usageCost(database, accountOwnerId);

    assert.equal(after - before, expected);
    assert.equal(await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)), jobs.length);
    assert.equal(
      await database.$count(aiUsageLogs, eq(aiUsageLogs.userId, accountOwnerId)),
      jobs.reduce((total, job) => total + job.calls.length, 0),
    );
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("usage persistence atomically stores priced meters in aggregate cost", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();

  try {
    await runScheduledAiJob({
      userId: accountOwnerId,
      feature: "report",
    }, () => executeAiCall(
      { userId: accountOwnerId, feature: "report", source: "scheduled" },
      "openai",
      "search-model",
      async () => 1,
      () => ({
        tokens: normalizeTokenUsage({ inputTokens: 1_000, outputTokens: 0 }),
        meters: [{
          ...OPENAI_WEB_SEARCH_METER,
          quantity: 1,
          source: "deterministic",
        }],
      }),
      {
        database,
        expectedMeters: [OPENAI_WEB_SEARCH_METER],
        getPricing: async () => RATE,
        getMeterPricing: async () => ({ unit: "call", rateMicroUsd: 10_000 }),
        now: () => NOW,
      },
    ), {
      admission: {
        reserve: reserveWith(database, DISABLED_POLICY),
        finish: finishWith(database),
        getReservationCost: async () => 11_000,
        getMaxOvershootCost: async () => 1,
      },
    });

    const [stored] = await database.select().from(aiUsageLogs)
      .where(eq(aiUsageLogs.userId, accountOwnerId));
    assert.equal(stored.costMicroUsd, 11_000);
    assert.deepEqual(stored.meters, [{
      ...OPENAI_WEB_SEARCH_METER,
      quantity: 1,
      source: "deterministic",
      rateMicroUsd: 10_000,
      costMicroUsd: 10_000,
    }]);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("random completion order never changes invocation-indexed model profiles", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const reserve = reserveWith(database, DISABLED_POLICY);
  const finish = finishWith(database);
  const jobCount = 100;
  const profile: Array<AiJobModelCall & { provider: AiProvider }> = [
    { provider: "gemini", model: "gemini-launch-0", meters: [] },
    { provider: "anthropic", model: "anthropic-launch-1", meters: [] },
    { provider: "openai", model: "openai-launch-2", meters: [] },
    { provider: "gemini", model: "gemini-launch-3", meters: [] },
    { provider: "openai", model: "openai-launch-4", meters: [] },
    { provider: "anthropic", model: "anthropic-launch-5", meters: [] },
    { provider: "gemini", model: "gemini-launch-6", meters: [] },
    { provider: "openai", model: "openai-launch-7", meters: [] },
  ];
  const launchOrder = Array.from({ length: profile.length }, (_, index) => index);
  const expectedHash = hashAiJobModelProfile(profile);

  try {
    const completionOrders = await withoutReservationLogs(async () => {
      const orders: number[][] = [];
      for (let jobIndex = 0; jobIndex < jobCount; jobIndex += 1) {
        const completionOrder = shuffledDelayRanks(profile.length);
        const started = latch(profile.length);
        const gates = profile.map(() => deferred());
        const observedCompletionOrder: number[] = [];
        const result = await runScheduledAiJob({
          userId: accountOwnerId,
          feature: "report",
        }, async () => {
          const calls = profile.map((call, launchIndex) => executeAiCall(
            { userId: accountOwnerId, feature: "report", source: "scheduled" },
            call.provider,
            call.model,
            async () => {
              started.hit();
              await gates[launchIndex].promise;
              observedCompletionOrder.push(launchIndex);
              return launchIndex;
            },
            () => billableUsage({
              inputTokens: jobIndex * 100 + launchIndex + 1,
              outputTokens: 0,
            }),
            { database, getPricing: async () => RATE, now: () => NOW },
          ));
          await started.reached;
          for (const launchIndex of completionOrder) {
            gates[launchIndex].resolve();
            await calls[launchIndex];
          }
          await Promise.all(calls);
          return observedCompletionOrder;
        }, {
          admission: {
            reserve,
            finish,
            getReservationCost: async () => 1,
            getMaxOvershootCost: async () => 1,
          },
        });
        assert.deepEqual(result, completionOrder);
        orders.push(result);
      }
      return orders;
    });
    assert.equal(completionOrders.length, jobCount);
    assert.equal(completionOrders.every((order) => {
      try {
        assert.notDeepEqual(order, launchOrder);
        return true;
      } catch {
        return false;
      }
    }), true);
    assert.ok(new Set(completionOrders.map((order) => order.join(","))).size > 1);

    const jobs = await database.select({
      id: aiJobs.id,
      modelProfile: aiJobs.modelProfile,
      modelsHash: aiJobs.modelsHash,
    }).from(aiJobs).where(eq(aiJobs.accountOwnerId, accountOwnerId));
    const usageRows = await database.select({
      id: aiUsageLogs.id,
      jobId: aiUsageLogs.jobId,
      callIndex: aiUsageLogs.callIndex,
      provider: aiUsageLogs.provider,
      model: aiUsageLogs.model,
      inputTokens: aiUsageLogs.inputTokens,
    }).from(aiUsageLogs).where(eq(aiUsageLogs.userId, accountOwnerId))
      .orderBy(asc(aiUsageLogs.id));
    const usageByJob = new Map<string, typeof usageRows>();
    for (const row of usageRows) {
      assert.ok(row.jobId);
      const rows = usageByJob.get(row.jobId) ?? [];
      rows.push(row);
      usageByJob.set(row.jobId, rows);
    }

    assert.equal(jobs.length, jobCount);
    assert.equal(usageRows.length, jobCount * profile.length);
    for (const job of jobs) {
      assert.equal(job.modelsHash, expectedHash);
      assert.deepEqual(job.modelProfile, profile);
      const rows = usageByJob.get(job.id);
      assert.ok(rows);
      const jobIndex = Math.floor((rows[0].inputTokens - 1) / 100);
      assert.deepEqual(rows.map((row) => row.callIndex), completionOrders[jobIndex]);
      const launchOrderedRows = [...rows].sort(
        (left, right) => (left.callIndex ?? -1) - (right.callIndex ?? -1),
      );
      assert.deepEqual(launchOrderedRows.map((row) => ({
        provider: row.provider,
        model: row.model,
      })), profile.map(({ provider, model }) => ({ provider, model })));
      assert.deepEqual(launchOrderedRows.map((row) => row.callIndex), launchOrder);
    }
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("an admitted overshooting job never chops off its in-flight provider calls", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const response = responseMock();
  const providerCallCount = 100;
  const started = latch(providerCallCount);
  let releaseProviders!: () => void;
  const providersBlocked = new Promise<void>((resolve) => {
    releaseProviders = resolve;
  });
  let finalized!: () => void;
  const finalization = new Promise<void>((resolve) => {
    finalized = resolve;
  });
  let finishCalls = 0;

  try {
    await fixture.seedSettledUsage({
      accountOwnerId,
      costMicroUsd: 9_500_000,
      createdAt: NOW,
    });
    const reserve = reserveWith(database, ENABLED_POLICY);
    const finish = finishWith(database);
    let calls!: Promise<number[]>;
    await runWithAiJobAdmission(accountOwnerId, async () => {
      attachAiJobAdmissionToResponse(response);
      calls = Promise.all(Array.from({ length: providerCallCount }, (_, index) => executeAiCall(
        { userId: accountOwnerId, feature: "report" },
        "gemini",
        "gemini-2.5-flash",
        async () => {
          started.hit();
          await providersBlocked;
          return index;
        },
        () => billableUsage({ inputTokens: 100_000, outputTokens: 0 }),
        { database, getPricing: async () => RATE, now: () => NOW },
      )));
      await started.reached;
      response.emit("finish");
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(finishCalls, 0);
      releaseProviders();
      assert.deepEqual(await calls, Array.from({ length: providerCallCount }, (_, index) => index));
    }, {
      feature: "report",
      reserve,
      finish: async (jobId, ownerId, status, expectedCallCount) => {
        finishCalls += 1;
        const result = await finish(jobId, ownerId, status, expectedCallCount);
        finalized();
        return result;
      },
      getReservationCost: async () => 1_500_000,
      getMaxOvershootCost: async () => 1_000_000,
    });
    await finalization;

    const [job] = await database.select().from(aiJobs)
      .where(eq(aiJobs.accountOwnerId, accountOwnerId));
    const usage = await database.select().from(aiUsageLogs)
      .where(eq(aiUsageLogs.jobId, job.id))
      .orderBy(asc(aiUsageLogs.callIndex));
    assert.equal(finishCalls, 1);
    assert.equal(job.status, "completed");
    assert.equal(job.modelProfile?.length, providerCallCount);
    assert.equal(usage.length, providerCallCount);
    assert.deepEqual(usage.map((row) => row.callIndex), Array.from(
      { length: providerCallCount },
      (_, index) => index,
    ));
    assert.equal(usage.reduce((total, row) => total + row.costMicroUsd, 0), 10_000_000);
  } finally {
    releaseProviders?.();
    await fixture.cleanup();
    await pool.end();
  }
});

test("usage persistence closes the accounting gap before a competing admission", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const database = databases[0];
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const activeJob = await fixture.seedReservedJob({
    accountOwnerId,
    reservedCostMicroUsd: 1_000_000,
    now: NOW,
  });
  const controlPool = createTestDatabasePool();
  const control = await controlPool.connect();
  const observerPool = createTestDatabasePool();
  const observer = await observerPool.connect();
  let admittedWork: Promise<number> | undefined;
  let competing: ReturnType<typeof reserveAiJob> | undefined;

  try {
    await fixture.seedSettledUsage({
      accountOwnerId,
      costMicroUsd: 8_000_000,
      createdAt: NOW,
    });
    await control.query("BEGIN");
    await control.query("LOCK TABLE ai_usage_logs IN ACCESS EXCLUSIVE MODE");

    admittedWork = runScheduledAiJob({
      userId: accountOwnerId,
      feature: "report",
    }, () => executeAiCall(
      { userId: accountOwnerId, feature: "report", source: "scheduled" },
      "gemini",
      "gemini-2.5-flash",
      async () => 1,
      () => billableUsage({ inputTokens: 2_000_000, outputTokens: 0 }),
      { database: databases[0], getPricing: async () => RATE, now: () => NOW },
    ), {
      admission: {
        reserve: async () => ({
          job: activeJob,
          aiUsageStatus: {
            enabled: true,
            plan: "test",
            status: "ok",
            warningThreshold: 0.75,
            blockedBy: [],
          },
        }),
        finish: finishWith(databases[0]),
        getReservationCost: async () => 1_000_000,
        getMaxOvershootCost: async () => 1_000_000,
      },
    });
    const [usageBackendPid] = await waitForBlockedSessions(control, 1, { lockType: "relation" });

    competing = reserveAiJob(reservationInput(accountOwnerId, 1_000_000), {
      database: databases[1],
      loadPolicy: async () => ENABLED_POLICY,
      now: () => NOW,
    });
    void competing.catch(() => undefined);
    await waitForBlockedSessions(observer, 1, {
      blockerPid: usageBackendPid,
      lockType: "advisory",
    });
    await control.query("COMMIT");

    assert.equal(await admittedWork, 1);
    await assert.rejects(competing, AiUsageCapExceededError);
    const [stored] = await database.select().from(aiJobs).where(eq(aiJobs.id, activeJob.id));
    assert.equal(stored.status, "completed");
    assert.equal(await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)), 1);
    assert.equal(await usageCost(database, accountOwnerId), 10_000_000);
  } finally {
    await control.query("ROLLBACK").catch(() => undefined);
    await Promise.allSettled([admittedWork, competing].filter((entry) => entry != null));
    control.release();
    observer.release();
    await fixture.cleanup();
    await Promise.all([
      ...pools.map((pool) => pool.end()),
      controlPool.end(),
      observerPool.end(),
    ]);
  }
});
