/**
 * Registry of dynamic system-config keys: seed defaults for first boot, a zod
 * schema per key (validates live admin updates through the generic PUT
 * endpoint), an optional freshness threshold, and an optional refresh source.
 *
 * cacheMaxDurationSecs: null  → human-set value; never auto-refreshes, only
 *                               changes via the admin update API.
 * cacheMaxDurationSecs: N     → a read older than N seconds passively
 *                               re-fetches from refreshSource, updates the
 *                               in-memory cache, and persists back to the DB.
 */
import { z } from "zod";
import { AI_FEATURES, type AiFeature } from "../services/ai-usage/types";
import type { MeterSku } from "@shared/ai-billing";

const MAX_SAFE_USD = Math.floor(Number.MAX_SAFE_INTEGER / 1_000_000);

const modelRateSchema = z.object({
  // USD per 1 million tokens — public list prices, deliberately not secret
  inputPerMTok: z.number().positive(),
  outputPerMTok: z.number().positive(),
  // Optional so existing admin-managed config remains valid. Missing cache
  // rates use conservative provider-standard fallbacks in the calculator.
  cacheReadPerMTok: z.number().positive().optional(),
  cacheWritePerMTok: z.number().positive().optional(),
  cacheWrite1hPerMTok: z.number().positive().optional(),
});

export const aiModelPricingSchema = z.record(
  z.string(), // provider: openai | anthropic | gemini | perplexity
  z.record(z.string(), modelRateSchema), // model id -> rates
);
export type AiModelPricing = z.infer<typeof aiModelPricingSchema>;
export type ModelRate = z.infer<typeof modelRateSchema>;

const meterRateSchema = <TUnit extends string>(unit: TUnit) => z.object({
  unit: z.literal(unit),
  rateMicroUsd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const aiMeterPricingSchema = z.object({
  "openai.web_search": meterRateSchema("call"),
  "anthropic.web_search": meterRateSchema("search"),
  "gemini.google_search_grounded_prompt": meterRateSchema("grounded_prompt"),
  "gemini.google_search_query": meterRateSchema("query"),
  "perplexity.search_web": meterRateSchema("search_request"),
  "dataforseo.google_ai_mode": meterRateSchema("task"),
  "dataforseo.google_ai_overview": meterRateSchema("task"),
}).strict();
export type AiMeterPricing = z.infer<typeof aiMeterPricingSchema>;
export type MeterRate = AiMeterPricing[MeterSku];

export const DEFAULT_AI_METER_PRICING: AiMeterPricing = {
  "openai.web_search": { unit: "call", rateMicroUsd: 10_000 },
  "anthropic.web_search": { unit: "search", rateMicroUsd: 10_000 },
  "gemini.google_search_grounded_prompt": { unit: "grounded_prompt", rateMicroUsd: 35_000 },
  "gemini.google_search_query": { unit: "query", rateMicroUsd: 14_000 },
  "perplexity.search_web": { unit: "search_request", rateMicroUsd: 2_500 },
  "dataforseo.google_ai_mode": { unit: "task", rateMicroUsd: 4_000 },
  // Live-probed 2026-09-28: organic live/advanced with depth 10 +
  // load_async_ai_overview bills $0.002/task whether or not an overview
  // surface is present (matches the vendor's default-task band).
  "dataforseo.google_ai_overview": { unit: "task", rateMicroUsd: 2_000 },
};

export const DEFAULT_AI_MODEL_PRICING: AiModelPricing = {
  openai: {
    "gpt-4o-mini": {
      inputPerMTok: 0.15,
      outputPerMTok: 0.6,
      cacheReadPerMTok: 0.075,
    },
    "gpt-5-search-api": {
      inputPerMTok: 1.25,
      outputPerMTok: 10.0,
      cacheReadPerMTok: 0.125,
    },
  },
  anthropic: {
    "claude-haiku-4-5": {
      inputPerMTok: 1.0,
      outputPerMTok: 5.0,
      cacheReadPerMTok: 0.1,
      cacheWritePerMTok: 1.25,
      cacheWrite1hPerMTok: 2.0,
    },
  },
  gemini: {
    "gemini-2.5-flash": {
      inputPerMTok: 0.3,
      outputPerMTok: 2.5,
      cacheReadPerMTok: 0.03,
    },
    "gemini-3.1-pro-preview": {
      inputPerMTok: 1.0,
      outputPerMTok: 6.0,
      cacheReadPerMTok: 0.1,
    },
  },
  perplexity: {
    // Sonar bills newly-created cache tokens at the plain input rate; the
    // rate is not published (derived and verified live, docs/08). It must be
    // explicit here — the missing-rate fallback assumes Anthropic's 1.25x
    // premium and would overbill sonar by ~5%.
    "perplexity/sonar": {
      inputPerMTok: 0.25,
      outputPerMTok: 2.5,
      cacheReadPerMTok: 0.0625,
      cacheWritePerMTok: 0.25,
    },
  },
};

const aiUsageCapSchema = z.object({
  refreshGbp: z.number().positive(),
  monthlyGbp: z.number().positive(),
  // Contract tiers can negotiate a cadence; standard plans omit this and use
  // the cadence already defined by their plan.
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
});

export const aiUsageCapsSchema = z.object({
  warningThreshold: z.number().positive().lt(1),
  plans: z.record(z.string(), aiUsageCapSchema.nullable()),
  // Per-account entries take precedence over plan defaults. This is the
  // contract hook for Custom accounts and Agency parent organisations.
  accountOverrides: z.record(z.string(), aiUsageCapSchema),
});
export type AiUsageCapsConfig = z.infer<typeof aiUsageCapsSchema>;

const aiJobMaxOvershootUsdShape = Object.fromEntries(
  AI_FEATURES.map((feature) => [
    feature,
    z.number().positive().finite().max(MAX_SAFE_USD),
  ]),
) as Record<AiFeature, z.ZodNumber>;

export const aiJobMaxOvershootUsdSchema = z.object(aiJobMaxOvershootUsdShape).strict();
export type AiJobMaxOvershootUsdConfig = z.infer<typeof aiJobMaxOvershootUsdSchema>;

export const DEFAULT_AI_JOB_MAX_OVERSHOOT_USD = Object.fromEntries(
  AI_FEATURES.map((feature) => [feature, 3]),
) as AiJobMaxOvershootUsdConfig;

export const aiJobReservationUsdSchema = z.object(aiJobMaxOvershootUsdShape).strict();
export type AiJobReservationUsdConfig = z.infer<typeof aiJobReservationUsdSchema>;

export const DEFAULT_AI_JOB_RESERVATION_USD = Object.fromEntries(
  AI_FEATURES.map((feature) => [feature, 1.5]),
) as AiJobReservationUsdConfig;

async function fetchUsdGbpRate(): Promise<number> {
  // frankfurter.app — free, no API key, ECB reference rates
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=GBP");
  if (!res.ok) throw new Error(`frankfurter.app responded ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.GBP;
  if (typeof rate !== "number" || !(rate > 0)) {
    throw new Error(`frankfurter.app returned invalid GBP rate: ${JSON.stringify(data)}`);
  }
  return rate;
}

export interface SystemConfigKeyDef {
  schema: z.ZodTypeAny;
  // Plain value, or a function resolved once at seed time (for defaults that
  // must be computed at first boot, e.g. the instrumentation cut-over instant)
  default: unknown | (() => unknown);
  cacheMaxDurationSecs: number | null;
  refreshSource: (() => Promise<unknown>) | null;
}

// Re-read the ai_model_pricing row directly from the DB. Used as the refresh
// source so migration-written pricing (migrations bypass updateConfigValue)
// converges without a process restart.
async function reloadAiModelPricingFromDb(): Promise<unknown> {
  const { db } = await import("../db");
  const { systemConfig } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_model_pricing"));
  return row?.value ?? DEFAULT_AI_MODEL_PRICING;
}

export const SYSTEM_CONFIG_REGISTRY: Record<string, SystemConfigKeyDef> = {
  // Verified against provider pricing pages (Aug 2026):
  // gpt-4o-mini $0.15/$0.60; gpt-5-search-api $1.25/$10.00;
  // claude-haiku-4-5 $1.00/$5.00;
  // gemini-2.5-flash $0.30/$2.50; gemini-3.1-pro-preview $1.00/$6.00 (<=200K ctx tier)
  ai_model_pricing: {
    schema: aiModelPricingSchema,
    default: DEFAULT_AI_MODEL_PRICING,
    cacheMaxDurationSecs: 900,
    refreshSource: reloadAiModelPricingFromDb,
  },

  ai_meter_pricing: {
    schema: aiMeterPricingSchema,
    default: DEFAULT_AI_METER_PRICING,
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },

  // Applied when a call uses a model missing from ai_model_pricing —
  // deliberately conservative (overestimates) so unknown models get noticed.
  ai_pricing_fallback: {
    schema: modelRateSchema,
    default: { inputPerMTok: 2.0, outputPerMTok: 12.0 } satisfies ModelRate,
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },

  usd_gbp_rate: {
    schema: z.number().positive(),
    default: Number(process.env.USD_GBP_RATE_FALLBACK || "0.79"),
    // FX sources update ~daily; 3h keeps us comfortably fresh without hammering
    cacheMaxDurationSecs: 3 * 60 * 60,
    refreshSource: fetchUsdGbpRate,
  },

  // Instrumentation cut-over: visibility_runs rows BEFORE this instant are
  // costed with the legacy chars/4 estimate; everything after is measured via
  // ai_usage_logs. Seeded once at first boot of the instrumented version.
  ai_usage_cutover_at: {
    schema: z.string().datetime(),
    default: () => new Date().toISOString(),
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },

  ai_usage_caps: {
    schema: aiUsageCapsSchema,
    default: {
      warningThreshold: 0.75,
      plans: {
        // Legacy ceilings retain 65% of their original monthly list price.
        starter: { refreshGbp: 20, monthlyGbp: 25.34 },
        growth: { refreshGbp: 20, monthlyGbp: 67.59 },
        enterprise: null,
        // Current plans follow the agreed commercial caps.
        starter_v2: { refreshGbp: 20, monthlyGbp: 48.75 },
        growth_v2: { refreshGbp: 20, monthlyGbp: 100 },
        accelerate: { refreshGbp: 20, monthlyGbp: 195 },
        // Agency is contract-defined and requires an account override.
        agency: null,
      },
      accountOverrides: {},
    } satisfies AiUsageCapsConfig,
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },

  // Maximum first-job overshoot above either cap. Values are USD per primary
  // job feature and can be tuned live by super admins.
  ai_job_max_overshoot_usd: {
    schema: aiJobMaxOvershootUsdSchema,
    default: DEFAULT_AI_JOB_MAX_OVERSHOOT_USD,
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },

  // Conservative no-data floor for estimated job cost. This is intentionally
  // separate from the maximum first-job overshoot allowance.
  ai_job_reservation_usd: {
    schema: aiJobReservationUsdSchema,
    default: DEFAULT_AI_JOB_RESERVATION_USD,
    cacheMaxDurationSecs: null,
    refreshSource: null,
  },
};
