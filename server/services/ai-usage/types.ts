import type { PgDatabase } from "drizzle-orm/pg-core";
import type { ExpectedMeter, PricedMeterUsage } from "@shared/ai-billing";
import type { getMeterPricing, getModelPricing } from "../system-config";

export const AI_FEATURES = [
  "visibility_scan",
  "perception",
  "coverage",
  "readability_audit",
  "report",
  "news",
  "ticket_generation",
  "suggest_fix",
  "data_freshness",
  "brand_research",
  "competitor_research",
  "question_generation",
  "volume_estimation",
  "provisioning_research",
  "other",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export interface AiJobContext {
  userId: string;
  brandId?: number | null;
  feature: AiFeature;
}

export interface AiUsageContext extends AiJobContext {
  // System work is not attributable to a customer subscription. Manual is the
  // safe default; scheduled customer work uses the same admission path.
  source?: "manual" | "scheduled" | "system";
}

export type AiUsageDependencies = {
  database?: PgDatabase<any, any, any>;
  getPricing?: typeof getModelPricing;
  getMeterPricing?: typeof getMeterPricing;
  expectedMeters?: ExpectedMeter[];
  now?: () => Date;
};

export type ComputedAiUsageCost = {
  costMicroUsd: number;
  meters: PricedMeterUsage[];
};

