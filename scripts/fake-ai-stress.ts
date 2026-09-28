/**
 * FAKE_AI stress driver — hammers the fake async-AI paths concurrently and
 * reports throughput/latency, without spending tokens or needing API keys.
 *
 * Pure (DB-less) ops exercise the provider fan-out, news generation and
 * report narratives. The `fullscan` op additionally needs DATABASE_URL and
 * one or more existing brand ids, and runs real end-to-end scans (storage
 * writes included) with every provider call faked.
 *
 * Usage:
 *   FAKE_AI=1 FAKE_AI_DELAY_MS=20 npx tsx scripts/fake-ai-stress.ts \
 *     [--iterations 50] [--concurrency 8] [--ops scan,news,reports] \
 *     [--brand-ids 1,2]
 *
 * The script REFUSES to run unless FAKE_AI=1, so it can never burn real
 * tokens by accident. Failures whose message carries the FAKE_AI chaos
 * marker are reported separately and do not fail the run; anything else
 * exits non-zero.
 */
import { performance } from "node:perf_hooks";
import { fakeAiErrorRate, isFakeAiEnabled } from "../server/services/fake-ai";

export const PURE_OPS = ["scan", "daily", "news", "reports", "fixtures"] as const;
export type PureOp = (typeof PURE_OPS)[number];
export const ALL_OPS = [...PURE_OPS, "fullscan"] as const;
export type StressOp = (typeof ALL_OPS)[number];

export interface StressOptions {
  iterations: number;
  concurrency: number;
  ops: StressOp[];
  brandIds: number[];
}

export function parseArgs(argv: string[]): StressOptions {
  const opts: StressOptions = {
    iterations: 20,
    concurrency: 4,
    ops: [...PURE_OPS],
    brandIds: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--iterations" && next !== undefined) {
      opts.iterations = Math.max(1, Number.parseInt(next, 10) || 1);
      i++;
    } else if (arg === "--concurrency" && next !== undefined) {
      opts.concurrency = Math.max(1, Number.parseInt(next, 10) || 1);
      i++;
    } else if (arg === "--ops" && next !== undefined) {
      const picked = next
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => (ALL_OPS as readonly string[]).includes(s)) as StressOp[];
      if (picked.length > 0) opts.ops = picked;
      i++;
    } else if (arg === "--brand-ids" && next !== undefined) {
      opts.brandIds = next
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      i++;
    }
  }
  return opts;
}

export interface OpStats {
  op: string;
  count: number;
  failures: number;
  chaosFailures: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export function computeStats(op: string, latenciesMs: number[], failures: number, chaosFailures: number): OpStats {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const quantile = (q: number): number => {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  const meanMs = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return {
    op,
    count: sorted.length,
    failures,
    chaosFailures,
    meanMs: Math.round(meanMs * 10) / 10,
    p50Ms: Math.round(quantile(0.5) * 10) / 10,
    p95Ms: Math.round(quantile(0.95) * 10) / 10,
    maxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
  };
}

function isChaosError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("FAKE_AI simulated");
}

function fakeReportData(brandDomain: string): any {
  const brand = {
    id: -1,
    userId: "fake-stress-user",
    domain: brandDomain,
    category: "synthetic load-test tooling",
    brandPositioning: "fixture",
    targetAudience: "synthetic QA",
    competitors: ["fake-rival-alpha.example.com", "fake-rival-beta.example.com"],
  };
  const models = ["openai", "anthropic", "gemini", "perplexity"];
  const types = ["awareness", "consideration", "commercial"];
  const visibilityRuns = Array.from({ length: 12 }, (_, i) => ({
    brandId: -1,
    promptText: `Fixture prompt ${i + 1} for ${brandDomain}`,
    promptType: types[i % types.length],
    modelId: models[i % models.length],
    appeared: i % 3 !== 2,
    position: i % 3 === 2 ? null : (i % 4) + 1,
    sentiment: i % 3 === 2 ? null : ["positive", "neutral", "negative"][i % 3],
    competitorsMentioned: i % 2 === 0 ? ["fake-rival-alpha.example.com"] : [],
    citationPresent: true,
    rawResponse: `FAKE_AI fixture response ${i + 1} for ${brandDomain}.`,
  }));
  return { brand, visibilityRuns, perceptionProfile: undefined, coverageGap: undefined, readabilityAudit: undefined };
}

type OpRunner = (iteration: number) => Promise<void>;

async function buildRunners(selected: StressOp[], brandIds: number[]): Promise<Map<string, OpRunner>> {
  const runners = new Map<string, OpRunner>();
  if (selected.includes("scan")) {
    const { runPromptAcrossModels } = await import("../server/llm-runner");
    runners.set("scan", async (i) => {
      const results = await runPromptAcrossModels(
        `Stress prompt ${i}: best synthetic CRM for startups?`,
        "Acme Stress",
        ["fake-rival-alpha.example.com", "fake-rival-beta.example.com"],
      );
      for (const r of results) {
        if (typeof r.appeared !== "boolean" || !r.rawResponse) {
          throw new Error("scan result failed schema validation");
        }
      }
      if (results.length === 0) {
        // All four providers failing at once only happens under chaos; the
        // app legitimately degrades to zero visibility rows in that case.
        throw new Error(
          fakeAiErrorRate() > 0
            ? "FAKE_AI simulated outage across all scan providers (degraded-empty)"
            : "scan returned 0 results with chaos disabled",
        );
      }
    });
  }
  if (selected.includes("daily")) {
    const { runPromptForDailyModel } = await import("../server/llm-runner");
    runners.set("daily", async (i) => {
      const results = await runPromptForDailyModel(`Stress daily prompt ${i}?`, "Acme Stress", []);
      if (results.length === 0) {
        throw new Error(
          fakeAiErrorRate() > 0
            ? "FAKE_AI simulated outage in daily rotation (degraded-empty)"
            : "daily returned 0 results with chaos disabled",
        );
      }
      if (results.length !== 1) throw new Error(`daily returned ${results.length} results, expected 1`);
    });
  }
  if (selected.includes("news")) {
    const { newsGenerator } = await import("../server/news-generator");
    runners.set("news", async (i) => {
      const article = await newsGenerator.generateArticle(`Stress article topic ${i}`, ["AEO indexing"]);
      if (article.questionsAnswered.length !== 3 || article.keyTakeaways.length !== 5) {
        throw new Error("news article failed fixture validation");
      }
    });
  }
  if (selected.includes("reports")) {
    const { generateReport } = await import("../server/report-generator");
    runners.set("reports", async (i) => {
      const data = fakeReportData(`stress-${i % 5}.example.com`);
      const executive: any = await generateReport("executive", data);
      const marketing: any = await generateReport("marketing", data);
      const competitive: any = await generateReport("competitive", data);
      // Schema-shape validation only: under chaos the app legitimately
      // degrades to fallback content with empty arrays (real behaviour).
      if (typeof executive.executiveSummary !== "string") {
        throw new Error("executive report failed schema validation");
      }
      if (!Array.isArray(marketing.actionItems) || !Array.isArray(competitive.competitorStrategies)) {
        throw new Error("report fixture failed schema validation");
      }
    });
  }
  if (selected.includes("fixtures")) {
    const fake = await import("../server/services/fake-ai");
    runners.set("fixtures", async (i) => {
      const text = fake.fakeVisibilityText(`prompt ${i}`, "Acme", ["rival.com"], "openai");
      if (!text) throw new Error("empty fixture text");
      fake.fakePerceptionResult("Acme");
      fake.fakeCoverageResult("Acme", ["rival.com"]);
      fake.fakeVolumeEstimates(`stress:${i}`, 3);
      fake.fakeWeaknessReport("Rival");
    });
  }
  if (selected.includes("fullscan")) {
    if (!process.env.DATABASE_URL) {
      throw new Error("fullscan op requires DATABASE_URL to be set");
    }
    if (brandIds.length === 0) {
      throw new Error("fullscan op requires --brand-ids <id[,id...]> of existing brands");
    }
    const { assessmentEngine } = await import("../server/assessment-engine");
    const { storage } = await import("../server/storage");
    for (const id of brandIds) {
      const brand = await storage.getBrand(id);
      if (!brand) throw new Error(`fullscan: brand ${id} not found`);
    }
    runners.set("fullscan", async (i) => {
      const brandId = brandIds[i % brandIds.length];
      await assessmentEngine.runFullScan(brandId, "manual");
    });
  }
  return runners;
}

async function main(): Promise<number> {
  if (!isFakeAiEnabled()) {
    console.error("Refusing to run: FAKE_AI=1 is not set. This driver must never hit real providers.");
    return 1;
  }
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `FAKE_AI stress: iterations=${opts.iterations} concurrency=${opts.concurrency} ops=${opts.ops.join(",")}` +
      (opts.brandIds.length > 0 ? ` brands=${opts.brandIds.join(",")}` : ""),
  );

  let runners: Map<string, OpRunner>;
  try {
    runners = await buildRunners(opts.ops, opts.brandIds);
  } catch (err) {
    console.error("Setup failed:", err instanceof Error ? err.message : err);
    return 1;
  }

  const latencies = new Map<string, number[]>();
  const failures = new Map<string, number>();
  const chaosFailures = new Map<string, number>();
  for (const op of Array.from(runners.keys())) {
    latencies.set(op, []);
    failures.set(op, 0);
    chaosFailures.set(op, 0);
  }

  const started = performance.now();
  let cursor = 0;
  const opNames = Array.from(runners.keys());
  const total = opts.iterations * runners.size;
  const worker = async (): Promise<void> => {
    while (true) {
      const n = cursor++;
      if (n >= total) return;
      const op = opNames[n % opNames.length];
      const run = runners.get(op)!;
      const begin = performance.now();
      try {
        await run(n);
        latencies.get(op)!.push(performance.now() - begin);
      } catch (err) {
        if (isChaosError(err)) {
          chaosFailures.set(op, chaosFailures.get(op)! + 1);
          latencies.get(op)!.push(performance.now() - begin);
        } else {
          failures.set(op, failures.get(op)! + 1);
          console.error(`[${op}] iteration ${n} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, total) }, () => worker()));
  const elapsedMs = performance.now() - started;

  let failed = false;
  console.log("\nop        count  fails  chaos   mean   p50   p95   max  (ms)");
  latencies.forEach((samples, op) => {
    const stats = computeStats(op, samples, failures.get(op)!, chaosFailures.get(op)!);
    failed = failed || stats.failures > 0;
    console.log(
      `${op.padEnd(10)}${String(stats.count).padEnd(7)}${String(stats.failures).padEnd(7)}` +
        `${String(stats.chaosFailures).padEnd(7)}${String(stats.meanMs).padEnd(7)}${String(stats.p50Ms).padEnd(6)}` +
        `${String(stats.p95Ms).padEnd(6)}${stats.maxMs}`,
    );
  });
  const completed = Array.from(latencies.values()).reduce((a, s) => a + s.length, 0);
  console.log(
    `\n${completed}/${total} ops completed in ${Math.round(elapsedMs)}ms ` +
      `(${(completed / (elapsedMs / 1000)).toFixed(1)} ops/s), 0 real tokens spent.`,
  );
  return failed ? 1 : 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("fake-ai-stress.ts") || process.argv[1].endsWith("fake-ai-stress.js"));
if (invokedDirectly) {
  void main().then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
