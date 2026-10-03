import assert from "node:assert/strict";
import test from "node:test";
import { computeStats, parseArgs } from "../../../../scripts/fake-ai-stress";

test("parseArgs honours flags and falls back to pure-op defaults", () => {
  assert.deepEqual(parseArgs([]), {
    iterations: 20,
    concurrency: 4,
    ops: ["scan", "daily", "news", "reports", "fixtures"],
    brandIds: [],
  });
  const custom = parseArgs(["--iterations", "7", "--concurrency", "2", "--ops", "scan,news", "--brand-ids", "1,2"]);
  assert.deepEqual(custom, { iterations: 7, concurrency: 2, ops: ["scan", "news"], brandIds: [1, 2] });
});

test("parseArgs ignores unknown ops and keeps previous selection", () => {
  const opts = parseArgs(["--ops", "bogus"]);
  assert.deepEqual(opts.ops, ["scan", "daily", "news", "reports", "fixtures"]);
});

test("computeStats reports count, failures and quantiles", () => {
  const stats = computeStats("scan", [10, 20, 30, 40], 1, 2);
  assert.equal(stats.op, "scan");
  assert.equal(stats.count, 4);
  assert.equal(stats.failures, 1);
  assert.equal(stats.chaosFailures, 2);
  assert.equal(stats.meanMs, 25);
  assert.equal(stats.p50Ms, 30);
  assert.equal(stats.p95Ms, 40);
  assert.equal(stats.maxMs, 40);
});

test("computeStats handles empty samples", () => {
  const stats = computeStats("scan", [], 3, 0);
  assert.equal(stats.count, 0);
  assert.equal(stats.meanMs, 0);
  assert.equal(stats.p50Ms, 0);
  assert.equal(stats.failures, 3);
});
