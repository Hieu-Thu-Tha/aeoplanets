import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before } from "node:test";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  aiJobs,
  aiUsageLogs,
  users,
} from "@shared/schema";
import {
  expireStaleAiJobReservations,
  finishAiJobReservation,
  reserveAiJob,
  type AiJobReservationDependencies,
  type ReserveAiJobInput,
} from "../../../../server/services/ai-jobs/reservation";
import { aiJobAccountLockQuery } from "../../../../server/services/ai-jobs/account-lock";
import type { AiJobQuotaPolicyContext } from "../../../../server/services/ai-jobs/reservation-policy";
import { AiUsageCapExceededError } from "../../../../server/services/ai-usage/cap";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";
import {
  createTestDatabasePool,
  resetTestDatabase,
  waitForBlockedSessions,
} from "../../helpers/postgres";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const BASE_POLICY: AiJobQuotaPolicyContext = {
  plan: "test",
  warningThreshold: 0.75,
  policy: { refreshGbp: 10, monthlyGbp: 10 },
  cadence: "daily",
  usdGbpRate: 1,
};

before(resetTestDatabase);

function reservationInput(accountOwnerId: string): ReserveAiJobInput {
  return {
    accountOwnerId,
    feature: "report",
    entryProvider: "gemini",
    entryModel: "gemini-2.5-flash",
    reservedCostMicroUsd: 1_000_000,
    maxOvershootCostMicroUsd: 1_000_000,
  };
}

function reservationDependencies(
  database: ReturnType<typeof drizzle>,
  policy: AiJobQuotaPolicyContext = BASE_POLICY,
): AiJobReservationDependencies {
  return {
    database,
    loadPolicy: async () => policy,
    now: () => NOW,
  };
}

async function insertUser(database: ReturnType<typeof drizzle>): Promise<string> {
  const id = randomUUID();
  await database.insert(users).values({ id, email: `${id}@example.test` });
  return id;
}

test("concurrent reservations for one account cannot oversubscribe the hard cap", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const controlPool = createTestDatabasePool();
  const control = await controlPool.connect();
  const accountOwnerId = await insertUser(databases[0]);
  let attempts: ReturnType<typeof reserveAiJob>[] = [];

  try {
    await databases[0].insert(aiUsageLogs).values({
      userId: accountOwnerId,
      feature: "report",
      provider: "gemini",
      model: "gemini-2.5-flash",
      costMicroUsd: 9_500_000,
      createdAt: NOW,
    });

    await control.query("BEGIN");
    await drizzle(control).execute(aiJobAccountLockQuery(accountOwnerId));
    attempts = Array.from({ length: 12 }, (_, index) => reserveAiJob(
      reservationInput(accountOwnerId),
      reservationDependencies(databases[index % databases.length]),
    ));
    await waitForBlockedSessions(control, 12);
    await control.query("COMMIT");

    const settled = await Promise.allSettled(attempts);
    const admitted = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");
    assert.equal(admitted.length, 1);
    assert.equal(rejected.length, 11);
    assert.equal(rejected.every((result) => (
      result as PromiseRejectedResult
    ).reason instanceof AiUsageCapExceededError), true);

    const jobs = await databases[0].select().from(aiJobs)
      .where(eq(aiJobs.accountOwnerId, accountOwnerId));
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "reserved");
    assert.equal(jobs[0].reservedCostMicroUsd, 1_000_000);
  } finally {
    await control.query("ROLLBACK").catch(() => undefined);
    await Promise.allSettled(attempts);
    control.release();
    await databases[0].delete(users).where(eq(users.id, accountOwnerId));
    await Promise.all([...pools.map((pool) => pool.end()), controlPool.end()]);
  }
});

test("account advisory locks serialize only matching accounts", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const database = databases[0];
  const independentClient = await pools[1].connect();
  const independentDatabase = drizzle(independentClient);
  const controlPool = createTestDatabasePool();
  const control = await controlPool.connect();
  const blockedOwnerId = await insertUser(database);
  const independentOwnerId = await insertUser(database);
  const policy: AiJobQuotaPolicyContext = {
    ...BASE_POLICY,
    policy: { refreshGbp: 100, monthlyGbp: 100 },
  };

  let blocked: ReturnType<typeof reserveAiJob> | undefined;
  try {
    await independentClient.query("SET lock_timeout = '250ms'");
    await control.query("BEGIN");
    await drizzle(control).execute(aiJobAccountLockQuery(blockedOwnerId));
    let blockedFinished = false;
    blocked = reserveAiJob(
      reservationInput(blockedOwnerId),
      reservationDependencies(database, policy),
    ).finally(() => {
      blockedFinished = true;
    });
    await waitForBlockedSessions(control, 1);

    const independent = await reserveAiJob(
      reservationInput(independentOwnerId),
      reservationDependencies(independentDatabase, policy),
    );
    assert.equal(independent.job.accountOwnerId, independentOwnerId);
    assert.equal(blockedFinished, false);

    await control.query("COMMIT");
    assert.equal((await blocked).job.accountOwnerId, blockedOwnerId);
  } finally {
    await control.query("ROLLBACK").catch(() => undefined);
    if (blocked) await blocked.catch(() => undefined);
    control.release();
    independentClient.release();
    await database.delete(users).where(inArray(users.id, [blockedOwnerId, independentOwnerId]));
    await Promise.all([...pools.map((pool) => pool.end()), controlPool.end()]);
  }
});

test("persisted usage and the unspent portion of active reservations both count", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const accountOwnerId = await insertUser(database);

  try {
    const [activeJob] = await database.insert(aiJobs).values({
      accountOwnerId,
      feature: "report",
      entryProvider: "gemini",
      entryModel: "gemini-2.5-flash",
      reservedCostMicroUsd: 3_000_000,
      expiresAt: new Date(NOW.getTime() + 60_000),
      createdAt: NOW,
      updatedAt: NOW,
    }).returning();
    await database.insert(aiUsageLogs).values([
      {
        userId: accountOwnerId,
        feature: "report",
        provider: "gemini",
        model: "gemini-2.5-flash",
        costMicroUsd: 8_000_000,
        createdAt: NOW,
      },
      {
        userId: accountOwnerId,
        jobId: activeJob.id,
        callIndex: 0,
        feature: "report",
        provider: "gemini",
        model: "gemini-2.5-flash",
        costMicroUsd: 1_000_000,
        createdAt: NOW,
      },
    ]);

    await assert.rejects(
      reserveAiJob(reservationInput(accountOwnerId), reservationDependencies(database)),
      (error) => {
        assert.equal(error instanceof AiUsageCapExceededError, true);
        assert.deepEqual((error as AiUsageCapExceededError).capStatus.blockedBy, ["refresh", "monthly"]);
        return true;
      },
    );
    assert.equal(
      await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)),
      1,
    );
  } finally {
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await pool.end();
  }
});

test("admission expires stale holds in the same transaction before reserving", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const accountOwnerId = await insertUser(database);

  try {
    const [staleJob] = await database.insert(aiJobs).values({
      accountOwnerId,
      feature: "report",
      reservedCostMicroUsd: 10_000_000,
      expiresAt: new Date(NOW.getTime() - 1),
      createdAt: new Date(NOW.getTime() - 3_600_000),
      updatedAt: new Date(NOW.getTime() - 3_600_000),
    }).returning();

    const admitted = await reserveAiJob(
      reservationInput(accountOwnerId),
      reservationDependencies(database),
    );
    const jobs = await database.select().from(aiJobs)
      .where(eq(aiJobs.accountOwnerId, accountOwnerId))
      .orderBy(asc(aiJobs.createdAt));
    assert.equal(admitted.job.status, "reserved");
    assert.deepEqual(
      jobs.map((job) => [job.id, job.status]),
      [[staleJob.id, "expired"], [admitted.job.id, "reserved"]],
    );
    assert.equal(jobs[0].finishedAt?.getTime(), NOW.getTime());
  } finally {
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await pool.end();
  }
});

test("a failed reservation insert rolls back stale expiry updates", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const accountOwnerId = await insertUser(database);

  try {
    const [staleJob] = await database.insert(aiJobs).values({
      accountOwnerId,
      feature: "report",
      reservedCostMicroUsd: 10_000_000,
      expiresAt: new Date(NOW.getTime() - 1),
      createdAt: new Date(NOW.getTime() - 3_600_000),
      updatedAt: new Date(NOW.getTime() - 3_600_000),
    }).returning();
    const invalidInput = {
      ...reservationInput(accountOwnerId),
      entryModel: null,
    };

    await assert.rejects(
      reserveAiJob(invalidInput, reservationDependencies(database)),
      /ai_jobs_entry_pair_check/,
    );
    const [stored] = await database.select().from(aiJobs).where(eq(aiJobs.id, staleJob.id));
    assert.equal(stored.status, "reserved");
    assert.equal(stored.finishedAt, null);
    assert.equal(
      await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)),
      1,
    );
  } finally {
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await pool.end();
  }
});

test("an account lock timeout leaves no partial reservation", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const timedClient = await pool.connect();
  const timedDatabase = drizzle(timedClient);
  const controlPool = createTestDatabasePool();
  const control = await controlPool.connect();
  const accountOwnerId = await insertUser(database);

  try {
    await timedClient.query("SET lock_timeout = '50ms'");
    await control.query("BEGIN");
    await drizzle(control).execute(aiJobAccountLockQuery(accountOwnerId));

    await assert.rejects(
      reserveAiJob(reservationInput(accountOwnerId), reservationDependencies(timedDatabase)),
      (error) => {
        assert.equal((error as { code?: string }).code, "55P03");
        return true;
      },
    );
    assert.equal(
      await database.$count(aiJobs, eq(aiJobs.accountOwnerId, accountOwnerId)),
      0,
    );
  } finally {
    await control.query("ROLLBACK").catch(() => undefined);
    control.release();
    timedClient.release();
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await Promise.all([pool.end(), controlPool.end()]);
  }
});

test("concurrent finalization is idempotent and orders the durable model profile", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const database = databases[0];
  const accountOwnerId = await insertUser(database);

  try {
    const reserved = await reserveAiJob(
      reservationInput(accountOwnerId),
      reservationDependencies(database, {
        ...BASE_POLICY,
        policy: { refreshGbp: 100, monthlyGbp: 100 },
      }),
    );
    await database.insert(aiUsageLogs).values([
      {
        userId: accountOwnerId,
        jobId: reserved.job.id,
        callIndex: 1,
        feature: "report",
        provider: "anthropic",
        model: "claude-sonnet-4",
        costMicroUsd: 200_000,
        createdAt: NOW,
      },
      {
        userId: accountOwnerId,
        jobId: reserved.job.id,
        callIndex: 0,
        feature: "report",
        provider: "gemini",
        model: "gemini-2.5-flash",
        meters: [{
          ...GEMINI_GROUNDED_PROMPT_METER,
          quantity: 0,
          source: "provider_reported",
          rateMicroUsd: 35_000,
          costMicroUsd: 0,
        }],
        costMicroUsd: 100_000,
        createdAt: NOW,
      },
    ]);

    const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      finishAiJobReservation(
        reserved.job.id,
        accountOwnerId,
        index % 2 === 0 ? "completed" : "failed",
        2,
        { database: databases[index % databases.length], now: () => NOW },
      )
    ));
    const [stored] = await database.select().from(aiJobs).where(eq(aiJobs.id, reserved.job.id));
    assert.equal(new Set(results.map((job) => job.status)).size, 1);
    assert.equal(stored.status, results[0].status);
    assert.deepEqual(stored.modelProfile, [
      {
        provider: "gemini",
        model: "gemini-2.5-flash",
        meters: [GEMINI_GROUNDED_PROMPT_METER],
      },
      { provider: "anthropic", model: "claude-sonnet-4", meters: [] },
    ]);
    assert.match(stored.modelsHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(stored.finishedAt?.getTime(), NOW.getTime());
  } finally {
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await Promise.all(pools.map((pool) => pool.end()));
  }
});

test("uncommitted usage cannot produce a falsely complete model profile", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const usageClient = await pool.connect();
  const usageDatabase = drizzle(usageClient);
  const accountOwnerId = await insertUser(database);

  try {
    const [job] = await database.insert(aiJobs).values({
      accountOwnerId,
      feature: "report",
      entryProvider: "gemini",
      entryModel: "gemini-2.5-flash",
      reservedCostMicroUsd: 1_000_000,
      expiresAt: new Date(NOW.getTime() + 60_000),
      createdAt: NOW,
      updatedAt: NOW,
    }).returning();
    await usageClient.query("BEGIN");
    await usageDatabase.insert(aiUsageLogs).values({
      userId: accountOwnerId,
      jobId: job.id,
      callIndex: 0,
      feature: "report",
      provider: "gemini",
      model: "gemini-2.5-flash",
      costMicroUsd: 100_000,
      createdAt: NOW,
    });

    const finished = await finishAiJobReservation(
      job.id,
      accountOwnerId,
      "completed",
      2,
      { database, now: () => NOW },
    );
    await usageClient.query("COMMIT");
    assert.equal(finished.status, "completed");
    assert.equal(finished.modelProfile, null);
    assert.equal(finished.modelsHash, null);
    assert.equal(await database.$count(aiUsageLogs, eq(aiUsageLogs.jobId, job.id)), 1);
  } finally {
    await usageClient.query("ROLLBACK").catch(() => undefined);
    usageClient.release();
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await pool.end();
  }
});

test("cleanup and admission serialize stale reservation expiry", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const database = databases[0];
  const controlPool = createTestDatabasePool();
  const control = await controlPool.connect();
  const accountOwnerId = await insertUser(database);

  let cleanup: ReturnType<typeof expireStaleAiJobReservations> | undefined;
  let admission: ReturnType<typeof reserveAiJob> | undefined;
  try {
    const [staleJob] = await database.insert(aiJobs).values({
      accountOwnerId,
      feature: "report",
      reservedCostMicroUsd: 10_000_000,
      expiresAt: new Date(NOW.getTime() - 1),
      createdAt: new Date(NOW.getTime() - 3_600_000),
      updatedAt: new Date(NOW.getTime() - 3_600_000),
    }).returning();
    await control.query("BEGIN");
    await drizzle(control).execute(aiJobAccountLockQuery(accountOwnerId));
    cleanup = expireStaleAiJobReservations(NOW, { database: databases[0] });
    admission = reserveAiJob(
      reservationInput(accountOwnerId),
      reservationDependencies(databases[1]),
    );
    await waitForBlockedSessions(control, 2);
    await control.query("COMMIT");
    const [expiredCount, admitted] = await Promise.all([cleanup, admission]);

    const jobs = await database.select().from(aiJobs).where(and(
      eq(aiJobs.accountOwnerId, accountOwnerId),
      inArray(aiJobs.id, [staleJob.id, admitted.job.id]),
    ));
    assert.equal(expiredCount === 0 || expiredCount === 1, true);
    assert.equal(jobs.find((job) => job.id === staleJob.id)?.status, "expired");
    assert.equal(jobs.find((job) => job.id === admitted.job.id)?.status, "reserved");
    assert.equal(await database.$count(
      aiJobs,
      and(eq(aiJobs.accountOwnerId, accountOwnerId), eq(aiJobs.status, "reserved")),
    ), 1);
  } finally {
    await control.query("ROLLBACK").catch(() => undefined);
    await Promise.allSettled([cleanup, admission].filter((task) => task != null));
    control.release();
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await Promise.all([...pools.map((pool) => pool.end()), controlPool.end()]);
  }
});
