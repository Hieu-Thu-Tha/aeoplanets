import { LEGACY_TRIAL_PLAN } from "@shared/trial";

export function getTrialCompetitorLimit(params: {
  plan: string;
  isInTrial: boolean;
  baseLimit: number | null;
  extraCompetitors: number;
}): number | null {
  if (params.isInTrial && params.plan === LEGACY_TRIAL_PLAN) return 15;
  return params.baseLimit === null ? null : params.baseLimit + params.extraCompetitors;
}
