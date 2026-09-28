/**
 * Live system config: dynamic runtime configuration backed by the
 * system_config table, cached in memory for zero-RTT reads.
 *
 * Lifecycle:
 *  - loadSystemConfig() at boot reads the whole table into memory and seeds
 *    any registry key missing from the DB.
 *  - Reads return the in-memory value instantly. If the entry has a
 *    cacheMaxDurationSecs and is stale, the read passively re-fetches from
 *    the key's refreshSource (deduped across concurrent readers), updates
 *    memory, and persists back to the DB. On fetch failure the stale value
 *    is served and the error is logged loudly.
 *  - updateConfigValue() (admin API) validates against the registry schema,
 *    writes memory first, then persists.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemConfig, type SystemConfigEntry } from "@shared/schema";
import {
  SYSTEM_CONFIG_REGISTRY,
  DEFAULT_AI_JOB_MAX_OVERSHOOT_USD,
  DEFAULT_AI_JOB_RESERVATION_USD,
  DEFAULT_AI_METER_PRICING,
  DEFAULT_AI_MODEL_PRICING,
  type AiMeterPricing,
  type AiJobMaxOvershootUsdConfig,
  type AiJobReservationUsdConfig,
  type AiModelPricing,
  type ModelRate,
  type MeterRate,
} from "../config/system-config-defaults";
import type { AiFeature } from "./ai-usage";
import type { MeterSku } from "@shared/ai-billing";

const cache = new Map<string, SystemConfigEntry>();
const inflightRefreshes = new Map<string, Promise<void>>();

function resolveDefault(key: string): unknown {
  const def = SYSTEM_CONFIG_REGISTRY[key].default;
  return typeof def === "function" ? (def as () => unknown)() : def;
}

async function persist(entry: SystemConfigEntry): Promise<void> {
  await db
    .insert(systemConfig)
    .values(entry)
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: entry.value, cacheMaxDurationSecs: entry.cacheMaxDurationSecs, updatedAt: entry.updatedAt },
    });
}

function normalizeAiUsageCaps(value: unknown): { value: unknown; changed: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, changed: false };
  }

  let changed = false;
  const config = { ...(value as Record<string, unknown>) };
  for (const sectionName of ["plans", "accountOverrides"] as const) {
    const section = config[sectionName];
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;

    const normalizedSection: Record<string, unknown> = { ...(section as Record<string, unknown>) };
    for (const [key, policy] of Object.entries(normalizedSection)) {
      if (!policy || typeof policy !== "object" || Array.isArray(policy)) continue;
      const values = policy as Record<string, unknown>;
      if (!("rolling30DayGbp" in values)) continue;

      const normalizedPolicy = { ...values };
      if (!("monthlyGbp" in normalizedPolicy)) {
        normalizedPolicy.monthlyGbp = normalizedPolicy.rolling30DayGbp;
      }
      delete normalizedPolicy.rolling30DayGbp;
      normalizedSection[key] = normalizedPolicy;
      changed = true;
    }
    config[sectionName] = normalizedSection;
  }
  return { value: config, changed };
}

export async function loadSystemConfig(): Promise<void> {
  const rows = await db.select().from(systemConfig);
  for (const row of rows) {
    if (row.key !== "ai_usage_caps") {
      cache.set(row.key, row);
      continue;
    }

    const normalized = normalizeAiUsageCaps(row.value);
    const entry = normalized.changed
      ? { ...row, value: normalized.value, updatedAt: new Date() }
      : row;
    cache.set(row.key, entry);
    if (normalized.changed) {
      await persist(entry);
      console.log("[system-config] normalized 'ai_usage_caps' to UTC monthly cap fields");
    }
  }

  for (const [key, def] of Object.entries(SYSTEM_CONFIG_REGISTRY)) {
    if (cache.has(key)) continue;
    const entry: SystemConfigEntry = {
      key,
      value: resolveDefault(key),
      cacheMaxDurationSecs: def.cacheMaxDurationSecs,
      updatedAt: new Date(),
    };
    cache.set(key, entry);
    await persist(entry);
    console.log(`[system-config] seeded '${key}' with default value`);
  }
}

function isStale(entry: SystemConfigEntry): boolean {
  if (entry.cacheMaxDurationSecs == null) return false;
  return Date.now() - entry.updatedAt.getTime() > entry.cacheMaxDurationSecs * 1000;
}

async function refresh(key: string): Promise<void> {
  const existing = inflightRefreshes.get(key);
  if (existing) return existing;

  const def = SYSTEM_CONFIG_REGISTRY[key];
  if (!def?.refreshSource) return;

  const task = (async () => {
    const value = await def.refreshSource!();
    const parsed = def.schema.parse(value);
    const entry: SystemConfigEntry = {
      ...cache.get(key)!,
      value: parsed,
      updatedAt: new Date(),
    };
    cache.set(key, entry);
    await persist(entry);
  })().finally(() => inflightRefreshes.delete(key));

  inflightRefreshes.set(key, task);
  return task;
}

/**
 * Read a config value. Serves the in-memory copy instantly; a stale entry
 * (per its own cacheMaxDurationSecs) triggers an awaited, deduped refresh.
 * Never throws: on refresh failure the stale value is served and the error
 * is fully logged for monitoring.
 */
export async function getConfigValue<T = unknown>(key: string): Promise<T> {
  let entry = cache.get(key);
  if (!entry) {
    // Boot-time seeding normally guarantees presence; recover defensively.
    const seeded: SystemConfigEntry = {
      key,
      value: resolveDefault(key),
      cacheMaxDurationSecs: SYSTEM_CONFIG_REGISTRY[key]?.cacheMaxDurationSecs ?? null,
      updatedAt: new Date(),
    };
    cache.set(key, seeded);
    persist(seeded).catch((err) =>
      console.error(`[system-config] FAILED to persist seeded '${key}'`, err),
    );
    entry = seeded;
  }

  if (isStale(entry)) {
    try {
      await refresh(key);
      entry = cache.get(key)!;
    } catch (err) {
      console.error(
        `[system-config] FAILED to refresh stale '${key}' — serving stale value from ${entry.updatedAt.toISOString()}`,
        err,
      );
    }
  }

  return entry.value as T;
}

/** Validate + apply a live config update: in-memory first, then persist. */
export async function updateConfigValue(key: string, value: unknown): Promise<SystemConfigEntry> {
  const def = SYSTEM_CONFIG_REGISTRY[key];
  if (!def) throw new UnknownConfigKeyError(key);

  const parsed = def.schema.parse(value); // throws ZodError on invalid shape
  const entry: SystemConfigEntry = {
    key,
    value: parsed,
    cacheMaxDurationSecs: cache.get(key)?.cacheMaxDurationSecs ?? def.cacheMaxDurationSecs,
    updatedAt: new Date(),
  };
  cache.set(key, entry);
  await persist(entry);
  return entry;
}

export function getAllConfigEntries(): (SystemConfigEntry & { isStale: boolean })[] {
  return Array.from(cache.values()).map((entry) => ({ ...entry, isStale: isStale(entry) }));
}

export class UnknownConfigKeyError extends Error {
  constructor(key: string) {
    super(`Unknown system config key: ${key}`);
  }
}

// --- Typed helpers ---

export async function getUsdToGbpRate(): Promise<number> {
  try {
    return await getConfigValue<number>("usd_gbp_rate");
  } catch (err) {
    console.error("[system-config] FAILED to read usd_gbp_rate — using env fallback", err);
    return Number(process.env.USD_GBP_RATE_FALLBACK || "0.79");
  }
}

export async function getModelPricing(provider: string, model: string): Promise<ModelRate> {
  const pricing = await getConfigValue<AiModelPricing>("ai_model_pricing");
  const rate = pricing?.[provider]?.[model];
  if (rate) {
    // DB-backed config created before cache pricing existed lacks these fields.
    // Merge only missing defaults while preserving all admin overrides.
    return {
      ...DEFAULT_AI_MODEL_PRICING[provider]?.[model],
      ...rate,
    };
  }
  console.warn(
    `[system-config] no pricing for ${provider}/${model} — using conservative fallback rate`,
  );
  return getConfigValue<ModelRate>("ai_pricing_fallback");
}

export async function getMeterPricing(sku: MeterSku): Promise<MeterRate> {
  const pricing = await getConfigValue<AiMeterPricing>("ai_meter_pricing");
  return pricing?.[sku] ?? DEFAULT_AI_METER_PRICING[sku];
}

export async function getAiUsageCutoverAt(): Promise<Date> {
  return new Date(await getConfigValue<string>("ai_usage_cutover_at"));
}

export async function getAiJobMaxOvershootMicroUsd(feature: AiFeature): Promise<number> {
  const config = await getConfigValue<Partial<AiJobMaxOvershootUsdConfig>>(
    "ai_job_max_overshoot_usd",
  );
  const usd = config?.[feature] ?? DEFAULT_AI_JOB_MAX_OVERSHOOT_USD[feature];
  const microUsd = typeof usd === "number" ? Math.round(usd * 1_000_000) : NaN;
  if (Number.isSafeInteger(microUsd) && microUsd > 0) return microUsd;

  const fallback = Math.round(DEFAULT_AI_JOB_MAX_OVERSHOOT_USD[feature] * 1_000_000);
  console.warn(
    `[system-config] invalid AI job overshoot for '${feature}' — using $${DEFAULT_AI_JOB_MAX_OVERSHOOT_USD[feature]} default`,
  );
  return fallback;
}

export async function getAiJobReservationMicroUsd(feature: AiFeature): Promise<number> {
  const config = await getConfigValue<Partial<AiJobReservationUsdConfig>>(
    "ai_job_reservation_usd",
  );
  const usd = config?.[feature] ?? DEFAULT_AI_JOB_RESERVATION_USD[feature];
  const microUsd = typeof usd === "number" ? Math.round(usd * 1_000_000) : NaN;
  if (Number.isSafeInteger(microUsd) && microUsd > 0) return microUsd;

  const fallback = Math.round(DEFAULT_AI_JOB_RESERVATION_USD[feature] * 1_000_000);
  console.warn(
    `[system-config] invalid AI job reservation for '${feature}' — using $${DEFAULT_AI_JOB_RESERVATION_USD[feature]} default`,
  );
  return fallback;
}
