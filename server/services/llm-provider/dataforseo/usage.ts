/**
 * DataForSEO usage extraction: turns the normalized Google-engine response
 * into the strict billable-usage contract for the metered funnel.
 *
 * DataForSEO exposes no token usage for Google AI Mode / AI Overview — the
 * unit of consumption is the API task itself. The extractor therefore reports
 * zero tokens plus a deterministic per-call meter whose billed actual is the
 * vendor's own reported task cost (the provider-cost parity path; estimation
 * keeps projecting quantity × NOW-config rate).
 */
import {
  DATAFORSEO_AI_MODE_METER,
  DATAFORSEO_AI_OVERVIEW_METER,
  billableUsageSchema,
  canonicalizeExpectedMeters,
  type BillableUsage,
  type ExpectedMeter,
  type MeterUsage,
} from "@shared/ai-billing";
import { normalizeTokenUsage } from "../../ai-usage/tokens";
import type { DataForSeoSerpEngine, DataForSeoSerpResult } from "./types";

export function expectedMeterForEngine(engine: DataForSeoSerpEngine): ExpectedMeter {
  return engine === "google_ai_mode"
    ? DATAFORSEO_AI_MODE_METER
    : DATAFORSEO_AI_OVERVIEW_METER;
}

function meterUsageForAiMode(meter: ExpectedMeter, providerCostMicroUsd?: number): MeterUsage {
  if (meter.sku !== "dataforseo.google_ai_mode") {
    throw new TypeError(`Unsupported DataForSEO meter: ${meter.sku}`);
  }
  return {
    ...meter,
    quantity: 1,
    source: "deterministic",
    ...(providerCostMicroUsd === undefined ? {} : { providerCostMicroUsd }),
  };
}

function meterUsageForAiOverview(
  meter: ExpectedMeter,
  hasAiOverviewGenCost: boolean,
  providerCostMicroUsd?: number,
): MeterUsage {
  if (meter.sku !== "dataforseo.google_ai_overview") {
    throw new TypeError(`Unsupported DataForSEO meter: ${meter.sku}`);
  }
  return {
    ...meter,
    // The vendor bills per 10-result SERP unit ($0.002): 1 unit for the base
    // task (cached or absent overview), 2 units when a fresh asynchronous
    // overview was generated (+$0.002 async fee, refunded otherwise). Quantity
    // carries the unit count so the fixed per-unit rate prices both cases and
    // the P95 estimator learns the mix from history instead of a magic middle.
    quantity: hasAiOverviewGenCost ? 2 : 1,
    source: "deterministic",
    ...(providerCostMicroUsd === undefined ? {} : { providerCostMicroUsd }),
  };
}

export function usageFromDataForSeo(
  result: DataForSeoSerpResult,
  expectedMeters: readonly ExpectedMeter[] = [],
): BillableUsage {
  const isAiMode = result.engine === "google_ai_mode";
  const providerCostMicroUsd = result.costUsd === null
    ? undefined
    // The vendor reports the task cost in USD; the micro-USD conversion at
    // this boundary is the system convention (actuals = provider truth).
    : Math.round(result.costUsd * 1_000_000);

  const meterUsages: MeterUsage[] = canonicalizeExpectedMeters(expectedMeters).map(
    (meter): MeterUsage => isAiMode
      ? meterUsageForAiMode(meter, providerCostMicroUsd)
      : meterUsageForAiOverview(
        meter,
        result.metadata.asynchronousAiOverview === true,
        providerCostMicroUsd,
      ),
  );

  return billableUsageSchema.parse({
    // SERP providers cannot report token usage: zero tokens mean "no token
    // data" for this call — the vendor cost carries the entire bill.
    tokens: normalizeTokenUsage({
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
    }),
    meters: meterUsages,
  });
}
