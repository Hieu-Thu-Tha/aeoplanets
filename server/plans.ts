// Plan keys.
//
// Legacy keys (`starter`, `growth`, `enterprise`) are preserved verbatim so
// existing subscriptions continue to resolve to the limits and amounts they
// were sold at. New customers go onto the v2 keys (`starter_v2`,
// `growth_v2`, `accelerate`) which carry the May 2026 pricing & limits.
// `enterprise` is still surfaced in the UI as "Custom" — kept for DB
// compatibility and grandfathering. There is intentionally no backend record
// for "agency"; that tier is contact-sales only on the marketing side.
export type PlanKey =
  | "starter"
  | "growth"
  | "enterprise"
  | "starter_v2"
  | "growth_v2"
  | "accelerate";

export type PlanLimits = {
  trackedTerms: number | null;
  questionsPerTerm: number;
  promptsLimit: number | null;
  brands: number | null;
  competitors: number | null;
  teamUsers: number | null;
  usersLimit: number | null;
  reportsPerMonth: number | null;
  pdfReportsPerPeriod: number | null;
  allowedReportTypes: string[];
  alertsPerMonth: number | null;
  auditsPerMonth: number | null;
  competitorMap: boolean;
  coverageGap: boolean;
  dataRefreshCadence: "daily" | "weekly" | "monthly";
};

export const EXTRA_USER_MONTHLY_PENCE = 1500;

export type PlanConfig = {
  displayName: string;
  monthlyAmount: number | null;
  annualAmount: number | null;
  monthlyEquivalent: number | null;
  limits: PlanLimits;
};

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  // ─── Legacy (grandfathered) ─────────────────────────────────────────────
  starter: {
    displayName: "Starter",
    monthlyAmount: 3899,
    annualAmount: 35988,
    monthlyEquivalent: 2999,
    limits: {
      trackedTerms: 10,
      questionsPerTerm: 10,
      promptsLimit: 100,
      brands: 1,
      competitors: 3,
      teamUsers: 2,
      usersLimit: 2,
      reportsPerMonth: 1,
      pdfReportsPerPeriod: 1,
      allowedReportTypes: ["executive"],
      alertsPerMonth: 30,
      auditsPerMonth: 1,
      competitorMap: false,
      coverageGap: false,
      dataRefreshCadence: "daily",
    },
  },
  growth: {
    displayName: "Growth",
    monthlyAmount: 10399,
    annualAmount: 95988,
    monthlyEquivalent: 7999,
    limits: {
      trackedTerms: 25,
      questionsPerTerm: 10,
      promptsLimit: 250,
      brands: 3,
      competitors: 10,
      teamUsers: 5,
      usersLimit: 5,
      reportsPerMonth: null,
      pdfReportsPerPeriod: null,
      allowedReportTypes: ["executive", "marketing", "competitive"],
      alertsPerMonth: null,
      auditsPerMonth: null,
      competitorMap: true,
      coverageGap: true,
      dataRefreshCadence: "daily",
    },
  },
  enterprise: {
    displayName: "Custom",
    monthlyAmount: null,
    annualAmount: null,
    monthlyEquivalent: null,
    limits: {
      trackedTerms: null,
      questionsPerTerm: 10,
      promptsLimit: null,
      brands: null,
      competitors: null,
      teamUsers: null,
      usersLimit: null,
      reportsPerMonth: null,
      pdfReportsPerPeriod: null,
      allowedReportTypes: ["executive", "marketing", "competitive"],
      alertsPerMonth: null,
      auditsPerMonth: null,
      competitorMap: true,
      coverageGap: true,
      dataRefreshCadence: "daily",
    },
  },

  // ─── May 2026 pricing (active for new subscribers) ──────────────────────
  starter_v2: {
    displayName: "Starter",
    monthlyAmount: 7500,
    annualAmount: 65000,
    monthlyEquivalent: 5417,
    limits: {
      trackedTerms: 10,
      questionsPerTerm: 8,
      promptsLimit: 75,
      brands: 1,
      competitors: 5,
      teamUsers: 1,
      usersLimit: 1,
      reportsPerMonth: 1,
      pdfReportsPerPeriod: 1,
      allowedReportTypes: ["executive"],
      alertsPerMonth: 50,
      auditsPerMonth: 1,
      competitorMap: false,
      coverageGap: false,
      dataRefreshCadence: "weekly",
    },
  },
  growth_v2: {
    displayName: "Growth",
    monthlyAmount: 15000,
    annualAmount: 130000,
    monthlyEquivalent: 10833,
    limits: {
      trackedTerms: 25,
      questionsPerTerm: 6,
      promptsLimit: 150,
      brands: 1,
      competitors: 10,
      teamUsers: 3,
      usersLimit: 3,
      reportsPerMonth: 4,
      pdfReportsPerPeriod: 4,
      allowedReportTypes: ["executive", "marketing", "competitive"],
      alertsPerMonth: 150,
      auditsPerMonth: 4,
      competitorMap: true,
      coverageGap: true,
      dataRefreshCadence: "daily",
    },
  },
  accelerate: {
    displayName: "Accelerate",
    monthlyAmount: 30000,
    annualAmount: 260000,
    monthlyEquivalent: 21667,
    limits: {
      trackedTerms: 50,
      questionsPerTerm: 5,
      promptsLimit: 250,
      brands: 1,
      competitors: 10,
      teamUsers: 5,
      usersLimit: 5,
      reportsPerMonth: 4,
      pdfReportsPerPeriod: 4,
      allowedReportTypes: ["executive", "marketing", "competitive"],
      alertsPerMonth: 300,
      auditsPerMonth: 4,
      competitorMap: true,
      coverageGap: true,
      dataRefreshCadence: "daily",
    },
  },
};

export type AddonType =
  | "extra_brand"
  | "competitor_pack"
  | "key_terms_pack"
  | "extra_user"
  | "topic_prompt_pack"
  | "change_alerts_pack";

export type AddonGrants = {
  brands?: number;
  competitors?: number;
  trackedTerms?: number;
  promptsLimit?: number;
  usersLimit?: number;
  auditsPerMonth?: number;
  alertsPerMonth?: number;
  pdfReportsPerPeriod?: number;
  // Additive bump on top of the plan's `dataRefreshCadence`. The base plan
  // sets the cadence (weekly = 1 refresh/week, daily = 7 refreshes/week);
  // each grant adds N additional weekly refreshes. Surfaced in
  // `getEffectiveLimits` for entitlement consumers.
  extraWeeklyRefreshes?: number;
};

export type AddonConfig = {
  displayName: string;
  description: string;
  monthlyAmount: number;
  annualAmount: number;
  monthlyEquivalent: number;
  // Add-ons stack additively on top of the base plan limits via
  // `getEffectiveLimits` in server/routes.ts. Any field not listed here is
  // left untouched.
  grantsExtra: AddonGrants;
};

// All add-ons are billed monthly only in the new (May 2026) pricing model.
// We still populate `annualAmount` (= 12 × monthly) so the Stripe seed and
// schema-backed local invoices have a value to read; the UI never offers
// the annual SKU for new packs.
export const ADDON_CONFIG: Record<AddonType, AddonConfig> = {
  extra_user: {
    displayName: "Extra User",
    description: "Add 1 additional user seat to your account",
    monthlyAmount: 1500,
    annualAmount: 18000,
    monthlyEquivalent: 1500,
    grantsExtra: { usersLimit: 1 },
  },
  extra_brand: {
    displayName: "Extra Brand Pack",
    description:
      "Add a complete extra brand: +1 brand, +3 competitors, +10 topics, +75 prompts, +1 MR audit, +50 alerts, +1 PDF report",
    monthlyAmount: 5000,
    annualAmount: 60000,
    monthlyEquivalent: 5000,
    grantsExtra: {
      brands: 1,
      competitors: 3,
      trackedTerms: 10,
      promptsLimit: 75,
      auditsPerMonth: 1,
      alertsPerMonth: 50,
      pdfReportsPerPeriod: 1,
    },
  },
  topic_prompt_pack: {
    displayName: "Topic & Prompt Pack",
    description: "Add 10 topics and 100 prompts of additional capacity",
    monthlyAmount: 2500,
    annualAmount: 30000,
    monthlyEquivalent: 2500,
    grantsExtra: { trackedTerms: 10, promptsLimit: 100 },
  },
  change_alerts_pack: {
    displayName: "Change Alerts Pack",
    description: "Add 50 change alerts and 1 extra weekly refresh",
    monthlyAmount: 2500,
    annualAmount: 30000,
    monthlyEquivalent: 2500,
    grantsExtra: { alertsPerMonth: 50, extraWeeklyRefreshes: 1 },
  },
  competitor_pack: {
    displayName: "Competitor Pack",
    description: "Add 5 extra competitor slots across your brands",
    monthlyAmount: 1500,
    annualAmount: 13860,
    monthlyEquivalent: 1500,
    grantsExtra: { competitors: 5 },
  },
  // Legacy add-on kept for grandfathering; no longer offered in the UI.
  key_terms_pack: {
    displayName: "Key Terms Pack",
    description: "Add 10 extra tracked key terms",
    monthlyAmount: 1000,
    annualAmount: 9240,
    monthlyEquivalent: 770,
    grantsExtra: { trackedTerms: 10 },
  },
};

export function getAddonConfig(type: string): AddonConfig | undefined {
  return ADDON_CONFIG[type as AddonType];
}

export function getAddonEffectiveAmount(type: string, billingInterval: string): number {
  const config = getAddonConfig(type);
  if (!config) return 0;
  if (billingInterval === "monthly") return config.monthlyAmount;
  return config.annualAmount;
}

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIG[plan as PlanKey] ?? PLAN_CONFIG.starter_v2;
}

export function canAccessFeature(plan: string, feature: keyof PlanLimits): boolean {
  const config = getPlanConfig(plan);
  const limit = config.limits[feature];
  if (typeof limit === "boolean") return limit;
  if (typeof limit === "string") return true;
  return limit !== 0;
}

export function getEffectiveAmount(plan: string, billingInterval: string): number {
  const config = getPlanConfig(plan);
  if (billingInterval === "monthly") return config.monthlyAmount ?? 0;
  return config.annualAmount ?? 0;
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
