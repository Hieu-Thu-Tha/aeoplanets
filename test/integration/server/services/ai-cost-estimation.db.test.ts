import assert from "node:assert/strict";
import test, { before } from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  aiCostEstimations,
  type AiEstimatedCallUsage,
  type AiEstimatedCallTokens,
  type AiJobModelCall,
} from "@shared/schema";
import {
  DEFAULT_AI_METER_PRICING,
  type ModelRate,
} from "../../../../server/config/system-config-defaults";
import {
  GEMINI_GROUNDED_PROMPT_METER,
  type MeterSku,
} from "@shared/ai-billing";
import {
  getEstimatedAiJobCostMicroUsd,
  invalidateAiCostEstimation,
} from "../../../../server/services/ai-cost-estimation";
import {
  AI_COST_ESTIMATION_ALGORITHM_VERSION,
  priceEstimatedAiJobUsage,
} from "../../../../server/services/ai-cost-estimation/algorithm";
import { hashAiJobModelProfile } from "../../../../server/services/ai-jobs/profile";
import { AiJobDatabaseFixture } from "../../fixtures/ai-job";
import {
  createTestDatabasePool,
  resetTestDatabase,
  waitForBlockedSessions,
} from "../../helpers/postgres";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const PROFILE: AiJobModelCall[] = Array.from({ length: 3 }, () => ({
  provider: "gemini",
  model: "gemini-2.5-flash",
  meters: [],
}));
const RATE: ModelRate = { inputPerMTok: 0.3, outputPerMTok: 2.5 };
const getPricing = async () => RATE;
const getMeterPricing = async (sku: MeterSku) => DEFAULT_AI_METER_PRICING[sku];

before(resetTestDatabase);

function historicalCalls(highCallIndex: number, highTokens: number): AiEstimatedCallTokens[] {
  return PROFILE.map((entry, callIndex) => ({
    provider: entry.provider,
    model: entry.model,
    inputTokens: callIndex === highCallIndex ? highTokens : 1_000,
    outputTokens: 1_000,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
  }));
}

function estimatedUsage(calls: AiEstimatedCallTokens[]): AiEstimatedCallUsage[] {
  return calls.map((call) => ({
    provider: call.provider,
    model: call.model,
    usage: {
      tokens: {
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        thinkingTokens: call.thinkingTokens,
        cacheReadTokens: call.cacheReadTokens,
        cacheWriteTokens: call.cacheWriteTokens,
        cacheWrite1hTokens: call.cacheWrite1hTokens,
      },
      meters: [],
    },
  }));
}

test("learned job cost stays inside the coherent historical cost envelope", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const histories = [
    historicalCalls(0, 900_000),
    historicalCalls(1, 1_000_000),
    historicalCalls(2, 1_100_000),
  ];

  try {
    const observedCosts = await Promise.all(histories.map((calls) =>
      priceEstimatedAiJobUsage(estimatedUsage(calls), getPricing, getMeterPricing)
    ));
    for (let index = 0; index < histories.length; index += 1) {
      const calls = histories[index];
      await fixture.seedCompletedJob({
        accountOwnerId,
        feature: "report",
        profile: PROFILE,
        calls: calls.map((call) => ({
          ...call,
          costMicroUsd: Math.max(1, Math.floor(observedCosts[index] / calls.length)),
        })),
        finishedAt: new Date(NOW.getTime() - (index + 1) * DAY_MS),
      });
    }
    fixture.trackEstimation("report", hashAiJobModelProfile(PROFILE));
    invalidateAiCostEstimation("report");

    const estimates = await Promise.all(Array.from({ length: 12 }, () =>
      getEstimatedAiJobCostMicroUsd("report", "gemini", "gemini-2.5-flash", [], {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      })
    ));
    assert.equal(new Set(estimates).size, 1);
    assert.ok(estimates[0] >= Math.min(...observedCosts));
    assert.ok(estimates[0] <= Math.max(...observedCosts));

    const [stored] = await database.select().from(aiCostEstimations)
      .where(eq(aiCostEstimations.feature, "report"));
    assert.equal(stored.algorithmVersion, AI_COST_ESTIMATION_ALGORITHM_VERSION);
    assert.equal(stored.sampleCount, histories.length);
    assert.equal(stored.version, 1);
    assert.equal(histories.some((calls) => {
      try {
        assert.deepEqual(stored.estimatedUsage, estimatedUsage(calls));
        return true;
      } catch {
        return false;
      }
    }), true);
  } finally {
    invalidateAiCostEstimation("report");
    await fixture.cleanup();
    await pool.end();
  }
});

test("the public estimator never serves an incompatible synthetic estimate", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const calls = historicalCalls(0, 500_000);
  const observedCost = await priceEstimatedAiJobUsage(
    estimatedUsage(calls),
    getPricing,
    getMeterPricing,
  );
  const finishedAt = new Date(NOW.getTime() - DAY_MS);
  const modelsHash = hashAiJobModelProfile(PROFILE);

  try {
    await fixture.seedCompletedJob({
      accountOwnerId,
      feature: "report",
      profile: PROFILE,
      calls: calls.map((call) => ({ ...call, costMicroUsd: 1 })),
      finishedAt,
    });
    fixture.trackEstimation("report", modelsHash);
    await database.insert(aiCostEstimations).values({
      feature: "report",
      modelsHash,
      modelProfile: PROFILE,
      estimatedTokens: PROFILE.map((entry) => ({
        ...entry,
        inputTokens: 100_000_000,
        outputTokens: 100_000_000,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      })),
      sampleCount: 1,
      sourceMaxFinishedAt: finishedAt,
      algorithmVersion: 1,
      version: 7,
      lastUpdatedAt: NOW,
    });
    invalidateAiCostEstimation("report");

    const estimate = await getEstimatedAiJobCostMicroUsd(
      "report",
      "gemini",
      "gemini-2.5-flash",
      [],
      {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      },
    );
    assert.equal(estimate, observedCost);

    const [stored] = await database.select().from(aiCostEstimations)
      .where(eq(aiCostEstimations.feature, "report"));
    assert.equal(stored.algorithmVersion, AI_COST_ESTIMATION_ALGORITHM_VERSION);
    assert.equal(stored.version, 8);
    assert.deepEqual(stored.estimatedTokens, calls);
    assert.deepEqual(stored.estimatedUsage, estimatedUsage(calls));
  } finally {
    invalidateAiCostEstimation("report");
    await fixture.cleanup();
    await pool.end();
  }
});

test("a compatible stale estimate remains non-blocking while it refreshes", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const calls = historicalCalls(0, 500_000);
  const observedCost = await priceEstimatedAiJobUsage(
    estimatedUsage(calls),
    getPricing,
    getMeterPricing,
  );
  const finishedAt = new Date(NOW.getTime() - DAY_MS);
  const modelsHash = hashAiJobModelProfile(PROFILE);
  const controlPool = createTestDatabasePool();
  const controlClient = await controlPool.connect();
  const controlDatabase = drizzle(controlClient);

  try {
    await fixture.seedCompletedJob({
      accountOwnerId,
      feature: "report",
      profile: PROFILE,
      calls: calls.map((call) => ({ ...call, costMicroUsd: 1 })),
      finishedAt,
    });
    fixture.trackEstimation("report", modelsHash);
    await database.insert(aiCostEstimations).values({
      feature: "report",
      modelsHash,
      modelProfile: PROFILE,
      estimatedTokens: calls,
      estimatedUsage: estimatedUsage(calls),
      sampleCount: 1,
      sourceMaxFinishedAt: finishedAt,
      algorithmVersion: AI_COST_ESTIMATION_ALGORITHM_VERSION,
      version: 1,
      lastUpdatedAt: new Date(NOW.getTime() - 7 * 60 * 60 * 1000),
    });
    invalidateAiCostEstimation("report");
    await controlDatabase.transaction(async (transaction) => {
      await transaction.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`ai-cost-estimation:report:${modelsHash}`}, 0)
        )
      `);
      const estimate = getEstimatedAiJobCostMicroUsd(
        "report",
        "gemini",
        "gemini-2.5-flash",
        [],
        {
          database,
          now: () => NOW,
          getFallbackCost: async () => 1_500_000,
          getPricing,
          getMeterPricing,
        },
      );
      const result = await Promise.race([
        estimate,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("stale estimate blocked on refresh")), 2_000);
        }),
      ]);
      assert.equal(result, observedCost);
      await waitForBlockedSessions(controlClient, 1);
    });

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const [stored] = await database.select().from(aiCostEstimations)
        .where(eq(aiCostEstimations.feature, "report"));
      if (stored.version === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const [refreshed] = await database.select().from(aiCostEstimations)
      .where(eq(aiCostEstimations.feature, "report"));
    assert.equal(refreshed.version, 2);
  } finally {
    invalidateAiCostEstimation("report");
    await fixture.cleanup();
    controlClient.release();
    await Promise.all([pool.end(), controlPool.end()]);
  }
});

test("metered jobs never learn from token-only history with the same model", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const tokenProfile: AiJobModelCall[] = [{
    provider: "gemini",
    model: "gemini-2.5-flash",
    meters: [],
  }];
  const meteredProfile: AiJobModelCall[] = [{
    ...tokenProfile[0],
    meters: [GEMINI_GROUNDED_PROMPT_METER],
  }];

  try {
    await fixture.seedCompletedJob({
      accountOwnerId,
      feature: "report",
      profile: tokenProfile,
      calls: [{
        provider: "gemini",
        model: "gemini-2.5-flash",
        inputTokens: 10_000_000,
        outputTokens: 1_000_000,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        costMicroUsd: 5_500_000,
      }],
      finishedAt: new Date(NOW.getTime() - DAY_MS),
    });
    await fixture.seedCompletedJob({
      accountOwnerId,
      feature: "report",
      profile: meteredProfile,
      calls: [{
        provider: "gemini",
        model: "gemini-2.5-flash",
        inputTokens: 1_000,
        outputTokens: 100,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        meters: [{
          ...GEMINI_GROUNDED_PROMPT_METER,
          quantity: 1,
          source: "provider_reported",
          rateMicroUsd: 35_000,
          costMicroUsd: 35_000,
        }],
        costMicroUsd: 35_550,
      }],
      finishedAt: new Date(NOW.getTime() - 2 * DAY_MS),
    });
    invalidateAiCostEstimation("report");

    const estimate = await getEstimatedAiJobCostMicroUsd(
      "report",
      "gemini",
      "gemini-2.5-flash",
      [GEMINI_GROUNDED_PROMPT_METER],
      {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      },
    );

    assert.equal(estimate, 35_550);
  } finally {
    invalidateAiCostEstimation("report");
    await fixture.cleanup();
    await pool.end();
  }
});
