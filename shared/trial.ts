// Default for newly assigned trials and public marketing copy. Once assigned,
// an account's authoritative end is persisted in subscriptions.trialEndsAt.
//
// Set by the TRIAL_DAYS env var, defaulting to 30. The server reads it from
// process.env at runtime; the browser can't, so vite.config.ts injects the same
// key into the client bundle as __TRIAL_DAYS__ at build time.
declare const __TRIAL_DAYS__: string | undefined;

const configured = Number(
  typeof __TRIAL_DAYS__ !== "undefined"
    ? __TRIAL_DAYS__
    : typeof process !== "undefined"
      ? process.env.TRIAL_DAYS
      : undefined,
);

export const TRIAL_DURATION_DAYS =
  Number.isFinite(configured) && configured > 0 ? configured : 30;
export const MIN_TRIAL_DURATION_DAYS = 1;

export const TRIAL_PLAN_KEYS = ["starter_v2", "growth_v2", "accelerate"] as const;
export type TrialPlan = (typeof TRIAL_PLAN_KEYS)[number];
export const DEFAULT_TRIAL_PLAN: TrialPlan = "starter_v2";
export const LEGACY_TRIAL_PLAN = "starter" as const;
export const PERSISTED_TRIAL_PLAN_KEYS = [LEGACY_TRIAL_PLAN, ...TRIAL_PLAN_KEYS] as const;
export type PersistedTrialPlan = TrialPlan | typeof LEGACY_TRIAL_PLAN;

export const TRIAL_PLAN_LABELS: Record<TrialPlan, string> = {
  starter_v2: "Starter",
  growth_v2: "Growth",
  accelerate: "Accelerate",
};

export function isTrialPlan(value: unknown): value is TrialPlan {
  return typeof value === "string" && (TRIAL_PLAN_KEYS as readonly string[]).includes(value);
}

export function isPersistedTrialPlan(value: unknown): value is PersistedTrialPlan {
  return value === LEGACY_TRIAL_PLAN || isTrialPlan(value);
}

export function trialPlanLabel(plan: PersistedTrialPlan): string {
  return plan === LEGACY_TRIAL_PLAN ? "Starter (legacy)" : TRIAL_PLAN_LABELS[plan];
}

export function isValidTrialDurationDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TRIAL_DURATION_DAYS
  );
}

export function calculateTrialEnd(start: Date, durationDays: number): Date {
  if (!isValidTrialDurationDays(durationDays)) {
    throw new Error(
      `Trial duration must be a whole number of at least ${MIN_TRIAL_DURATION_DAYS} days`,
    );
  }
  return new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

export function trialDaysPhrase(durationDays: number): string {
  return `${durationDays} day${durationDays === 1 ? "" : "s"}`;
}

export function trialDayAdjective(durationDays: number): string {
  return `${durationDays}-day`;
}

// Copy variants for marketing pages and emails, derived from the same value
// so prose can't advertise a different length than the logic grants.
export const TRIAL_DAYS_PHRASE = trialDaysPhrase(TRIAL_DURATION_DAYS);
export const TRIAL_DAY_ADJECTIVE = trialDayAdjective(TRIAL_DURATION_DAYS);
export const TRIAL_DAY_ADJECTIVE_TITLE = `${TRIAL_DURATION_DAYS}-Day`;
