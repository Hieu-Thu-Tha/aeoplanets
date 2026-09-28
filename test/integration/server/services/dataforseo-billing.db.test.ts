import assert from "node:assert/strict";
import test, { before } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { aiJobs, aiUsageLogs } from "@shared/schema";
import {
  DATAFORSEO_AI_OVERVIEW_METER,
  type PricedMeterUsage,
} from "@shared/ai-billing";
import type { ModelRate } from "../../../../server/config/system-config-defaults";
import { DEFAULT_AI_METER_PRICING } from "../../../../server/config/system-config-defaults";
import type { MeterSku } from "@shared/ai-billing";
import {
  runScheduledAiJob,
} from "../../../../server/services/ai-jobs/admission";
import {
  finishAiJobReservation,
  reserveAiJob,
  type ReserveAiJobInput,
} from "../../../../server/services/ai-jobs/reservation";
import type { AiJobQuotaPolicyContext } from "../../../../server/services/ai-jobs/reservation-policy";
import { executeAiCall } from "../../../../server/services/ai-usage";
import { sumAiUsageCostMicroUsd } from "../../../../server/services/ai-usage/cycle";
import { evaluateAiUsageCap } from "../../../../server/services/ai-usage/cap-policy";
import { usageFromDataForSeo } from "../../../../server/services/llm-provider/dataforseo/usage";
import type {
  DataForSeoSerpResult,
} from "../../../../server/services/llm-provider/dataforseo/types";
import {
  getEstimatedAiJobCostMicroUsd,
  invalidateAiCostEstimation,
} from "../../../../server/services/ai-cost-estimation";
import { hashAiJobModelProfile } from "../../../../server/services/ai-jobs/profile";
import { AiJobDatabaseFixture } from "../../fixtures/ai-job";
import {
  createTestDatabasePool,
  resetTestDatabase,
} from "../../helpers/postgres";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const DISABLED_POLICY: AiJobQuotaPolicyContext = {
  plan: "test",
  warningThreshold: 0.75,
  policy: null,
};
const RATE: ModelRate = { inputPerMTok: 1, outputPerMTok: 4 };
const getPricing = async () => RATE;
const getMeterPricing = async (sku: MeterSku) => DEFAULT_AI_METER_PRICING[sku];

const PROFILE = [{
  provider: "dataforseo",
  model: "google_ai_overview",
  meters: [DATAFORSEO_AI_OVERVIEW_METER],
}];

function normalizedOverviewResult(overrides: {
  taskId: string;
  costUsd: number | null;
  asynchronousAiOverview: boolean | null;
}): DataForSeoSerpResult {
  return {
    vendor: "dataforseo",
    engine: "google_ai_overview",
    isAnswerPresent: true,
    answerText: "Fresh answer.",
    answerMarkdown: null,
    references: [],
    taskId: overrides.taskId,
    costUsd: overrides.costUsd,
    resultTimestamp: null,
    checkUrl: null,
    metadata: {
      keyword: "best tires",
      resultType: "organic",
      surfaceType: "ai_overview",
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["ai_overview"],
      rankGroup: 1,
      rankAbsolute: 1,
      asynchronousAiOverview: overrides.asynchronousAiOverview,
    },
  };
}

function pricedOverviewMeter(quantity: 1 | 2, costMicroUsd: number): PricedMeterUsage {
  return {
    ...DATAFORSEO_AI_OVERVIEW_METER,
    quantity,
    source: "deterministic",
    providerCostMicroUsd: costMicroUsd,
    rateMicroUsd: 2_000,
    costMicroUsd,
  };
}

before(resetTestDatabase);

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

test("funnel records a DataForSEO call with zero tokens and provider-cost reconciliation", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();
  const reserve = reserveWith(database, DISABLED_POLICY);
  const finish = finishWith(database);

  try {
    await runScheduledAiJob({
      userId: accountOwnerId,
      feature: "report",
    }, () => executeAiCall(
      { userId: accountOwnerId, feature: "report", source: "scheduled" },
      "dataforseo",
      "google_ai_overview",
      async () => normalizedOverviewResult({ taskId: "task-live", costUsd: 0.004, asynchronousAiOverview: true }),
      (result, expected) => usageFromDataForSeo(result, expected),
      {
        database,
        getPricing,
        getMeterPricing,
        expectedMeters: [DATAFORSEO_AI_OVERVIEW_METER],
        now: () => NOW,
      },
    ), {
      admission: {
        reserve,
        finish,
        getReservationCost: async () => 4_000,
        getMaxOvershootCost: async () => 1_000_000,
      },
    });

    const rows = await database.select().from(aiUsageLogs)
      .where(eq(aiUsageLogs.jobId, (
        await database.select({ id: aiJobs.id }).from(aiJobs)
          .where(eq(aiJobs.accountOwnerId, accountOwnerId))
      )[0].id));
    assert.equal(rows.length, 1);
    const row = rows[0];
    // Zero tokens mean "no token data" — the vendor cost carries the bill.
    assert.deepEqual(
      {
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        thinkingTokens: row.thinkingTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        cacheWrite1hTokens: row.cacheWrite1hTokens,
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      },
    );
    // Actual-cost reconciliation: the ledger bills the vendor invoice line.
    assert.deepEqual(row.meters, [pricedOverviewMeter(2, 4_000)]);
    assert.equal(row.costMicroUsd, 4_000);

    const [job] = await database.select().from(aiJobs)
      .where(eq(aiJobs.accountOwnerId, accountOwnerId));
    assert.deepEqual(job.entryMeters, [{ ...DATAFORSEO_AI_OVERVIEW_METER }]);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("recorded SERP spend reaches the budget-cap policy inputs", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();

  try {
    await fixture.seedCompletedJob({
      accountOwnerId,
      feature: "coverage",
      profile: PROFILE,
      calls: [{
        provider: "dataforseo",
        model: "google_ai_overview",
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        costMicroUsd: 4_000,
        meters: [pricedOverviewMeter(2, 4_000)],
      }],
      finishedAt: NOW,
    });

    const rows = await database.select({ costMicroUsd: aiUsageLogs.costMicroUsd })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.userId, accountOwnerId));
    // The real spend helper sums whatever the ledger holds — provider-agnostic.
    const spendMicroUsd = sumAiUsageCostMicroUsd(rows);
    assert.equal(spendMicroUsd, 4_000);

    const status = evaluateAiUsageCap({
      plan: "test",
      cadence: "daily",
      cycleEndsAt: new Date(NOW.getTime() + DAY_MS),
      monthlyEndsAt: new Date(NOW.getTime() + 30 * DAY_MS),
      currentCostMicroUsd: spendMicroUsd,
      monthlyCostMicroUsd: spendMicroUsd,
      usdGbpRate: 1,
      warningThreshold: 0.75,
      policy: { refreshGbp: 0.001, monthlyGbp: 100 },
    });
    // $0.004 of SERP spend trips a $0.001 refresh budget: SERP spend counts.
    assert.equal(status.status, "blocked");
    assert.deepEqual(status.blockedBy, ["refresh"]);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("mixed 1/2-unit histories estimate the conservative tail", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();

  try {
    const histories: Array<{ quantity: 1 | 2; cost: number }> = [
      { quantity: 1, cost: 2_000 },
      { quantity: 1, cost: 2_000 },
      { quantity: 2, cost: 4_000 },
    ];
    for (let index = 0; index < histories.length; index += 1) {
      const history = histories[index];
      await fixture.seedCompletedJob({
        accountOwnerId,
        feature: "coverage",
        profile: PROFILE,
        calls: [{
          provider: "dataforseo",
          model: "google_ai_overview",
          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          costMicroUsd: history.cost,
          meters: [pricedOverviewMeter(history.quantity, history.cost)],
        }],
        finishedAt: new Date(NOW.getTime() - (index + 1) * DAY_MS),
      });
    }
    fixture.trackEstimation("coverage", hashAiJobModelProfile(PROFILE));
    invalidateAiCostEstimation("coverage");

    const estimate = await getEstimatedAiJobCostMicroUsd(
      "coverage",
      "dataforseo",
      "google_ai_overview",
      [DATAFORSEO_AI_OVERVIEW_METER],
      {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      },
    );
    // P95 over repriced {2000, 2000, 4000} selects the 2-unit tail.
    assert.equal(estimate, 4_000);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("linear history estimates the single observed cost", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  const accountOwnerId = await fixture.createOwner();

  try {
    for (let index = 0; index < 3; index += 1) {
      await fixture.seedCompletedJob({
        accountOwnerId,
        feature: "news",
        profile: PROFILE,
        calls: [{
          provider: "dataforseo",
          model: "google_ai_overview",
          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          costMicroUsd: 2_000,
          meters: [pricedOverviewMeter(1, 2_000)],
        }],
        finishedAt: new Date(NOW.getTime() - (index + 1) * DAY_MS),
      });
    }
    fixture.trackEstimation("news", hashAiJobModelProfile(PROFILE));
    invalidateAiCostEstimation("news");

    const estimate = await getEstimatedAiJobCostMicroUsd(
      "news",
      "dataforseo",
      "google_ai_overview",
      [DATAFORSEO_AI_OVERVIEW_METER],
      {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      },
    );
    assert.equal(estimate, 2_000);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("no history falls back without a DataForSEO estimate", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const fixture = new AiJobDatabaseFixture(database);
  await fixture.createOwner();

  try {
    invalidateAiCostEstimation("other");
    const estimate = await getEstimatedAiJobCostMicroUsd(
      "other",
      "dataforseo",
      "google_ai_overview",
      [DATAFORSEO_AI_OVERVIEW_METER],
      {
        database,
        now: () => NOW,
        getFallbackCost: async () => 1_500_000,
        getPricing,
        getMeterPricing,
      },
    );
    assert.equal(estimate, 1_500_000);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});
