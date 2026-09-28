import assert from "node:assert/strict";
import test from "node:test";
import {
  AiUsageCycleSpendCache,
  getUtcCycleWindow,
  sumAiUsageCostMicroUsd,
} from "../../../../server/services/ai-usage/cycle";
import { getPlanConfig } from "../../../../server/plans";

test("plan configuration selects the intended usage refresh cadence", () => {
  assert.equal(getPlanConfig("starter_v2").limits.dataRefreshCadence, "weekly");
  assert.equal(getPlanConfig("growth_v2").limits.dataRefreshCadence, "daily");
  assert.equal(getPlanConfig("accelerate").limits.dataRefreshCadence, "daily");
  assert.equal(getPlanConfig("starter").limits.dataRefreshCadence, "daily");
});

test("summary rows are aggregated in integer micro-USD", () => {
  assert.equal(sumAiUsageCostMicroUsd([
    { costMicroUsd: 125 },
    { costMicroUsd: 375 },
    { costMicroUsd: 0 },
  ]), 500);
});

test("daily cycle uses midnight-to-midnight UTC", () => {
  const window = getUtcCycleWindow("daily", new Date("2026-08-05T23:59:59.999Z"));

  assert.equal(window.start.toISOString(), "2026-08-05T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-06T00:00:00.000Z");
});

test("weekly cycle uses Monday 00:00 UTC across month boundaries", () => {
  const window = getUtcCycleWindow("weekly", new Date("2026-08-02T12:00:00.000Z"));

  assert.equal(window.start.toISOString(), "2026-07-27T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-03T00:00:00.000Z");
});

test("monthly cycle uses the first day of adjacent UTC months", () => {
  const window = getUtcCycleWindow("monthly", new Date("2026-12-31T23:59:59.999Z"));

  assert.equal(window.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("cache deduplicates reads and reloads after explicit invalidation", async () => {
  const cache = new AiUsageCycleSpendCache();
  const now = new Date("2026-08-05T12:00:00.000Z");
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return { ...getUtcCycleWindow("daily", now), costMicroUsd: loads * 100 };
  };

  const [first, concurrent] = await Promise.all([
    cache.getOrLoad("user-1", loader, () => now),
    cache.getOrLoad("user-1", loader, () => now),
  ]);
  const cached = await cache.getOrLoad("user-1", loader, () => now);

  assert.equal(loads, 1);
  assert.equal(first.costMicroUsd, 100);
  assert.equal(concurrent.costMicroUsd, 100);
  assert.equal(cached.costMicroUsd, 100);

  cache.invalidate("user-1");
  const refreshed = await cache.getOrLoad("user-1", loader, () => now);
  assert.equal(loads, 2);
  assert.equal(refreshed.costMicroUsd, 200);
});

test("namespace invalidation clears negotiated-cadence variants for one account", async () => {
  const cache = new AiUsageCycleSpendCache();
  const now = new Date("2026-08-05T12:00:00.000Z");
  let loads = 0;
  const loader = async () => ({
    ...getUtcCycleWindow("daily", now),
    costMicroUsd: ++loads,
  });

  await cache.getOrLoad("user-1\0daily", loader, () => now);
  await cache.getOrLoad("user-1\0weekly", loader, () => now);
  await cache.getOrLoad("user-2\0daily", loader, () => now);
  cache.invalidateNamespace("user-1");

  await cache.getOrLoad("user-1\0daily", loader, () => now);
  await cache.getOrLoad("user-1\0weekly", loader, () => now);
  await cache.getOrLoad("user-2\0daily", loader, () => now);
  assert.equal(loads, 5);
});

test("cache reloads automatically when the UTC cycle ends", async () => {
  const cache = new AiUsageCycleSpendCache();
  let now = new Date("2026-08-05T23:59:59.999Z");
  let loads = 0;
  const loader = async (loadedAt: Date) => ({
    ...getUtcCycleWindow("daily", loadedAt),
    costMicroUsd: ++loads,
  });

  await cache.getOrLoad("user-1", loader, () => now);
  now = new Date("2026-08-06T00:00:00.000Z");
  const nextCycle = await cache.getOrLoad("user-1", loader, () => now);

  assert.equal(loads, 2);
  assert.equal(nextCycle.costMicroUsd, 2);
  assert.equal(nextCycle.start.toISOString(), "2026-08-06T00:00:00.000Z");
});

test("invalidation during an in-flight read discards its stale result", async () => {
  const cache = new AiUsageCycleSpendCache();
  const now = new Date("2026-08-05T12:00:00.000Z");
  let loads = 0;
  let releaseFirstLoad!: () => void;
  const firstLoadBlocked = new Promise<void>((resolve) => {
    releaseFirstLoad = resolve;
  });
  const loader = async () => {
    loads += 1;
    if (loads === 1) await firstLoadBlocked;
    return { ...getUtcCycleWindow("daily", now), costMicroUsd: loads * 100 };
  };

  const spend = cache.getOrLoad("user-1", loader, () => now);
  await Promise.resolve();
  cache.invalidate("user-1");
  releaseFirstLoad();

  assert.equal((await spend).costMicroUsd, 200);
  assert.equal(loads, 2);
});
