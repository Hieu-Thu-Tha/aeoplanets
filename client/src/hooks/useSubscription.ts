import { useQuery } from "@tanstack/react-query";

export type PlanLimits = {
  trackedTerms: number | null;
  brands: number | null;
  competitors: number | null;
  reportsPerMonth: number | null;
  allowedReportTypes: string[];
  alertsPerMonth: number | null;
  auditsPerMonth: number | null;
  competitorMap: boolean;
  coverageGap: boolean;
  promptsLimit?: number | null;
  usersLimit?: number | null;
  pdfReportsPerPeriod?: number | null;
  dataRefreshCadence?: "weekly" | "daily" | "real_time" | null;
};

export type PlanConfig = {
  displayName: string;
  monthlyAmount: number | null;
  annualAmount: number | null;
  monthlyEquivalent: number | null;
  limits: PlanLimits;
};

export type BillingSubscription = {
  id: number;
  userId: string;
  plan: string;
  billingInterval: string;
  status: string;
  monthlyAmount: number;
  annualAmount: number;
  currency: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialUpdatedAt: string | null;
  trialUpdatedBy: string | null;
  createdAt: string;
  cancelledAt: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionItemId: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingUsage = {
  trackedTerms: number;
  userQuestions: number;
  brands: number;
  competitors: number;
  reportsThisMonth: number;
};

export type SubscriptionAddon = {
  id: number;
  subscriptionId: number;
  userId: string;
  addonType: string;
  quantity: number;
  status: string;
  stripeSubscriptionItemId: string | null;
  stripePriceId: string | null;
};

export type BillingData = {
  subscription: BillingSubscription;
  planConfig: PlanConfig;
  usage: BillingUsage;
  addons: SubscriptionAddon[];
  trialEnd: string | null;
  isInTrial: boolean;
  isManuallyBilled?: boolean;
};

export function useSubscription() {
  const { data, isLoading, refetch } = useQuery<BillingData | null>({
    queryKey: ["/api/billing/subscription"],
    staleTime: 60000,
    retry: false,
  });

  const plan = data?.subscription?.plan ?? "starter";
  const limits: PlanLimits = data?.planConfig?.limits ?? {
    trackedTerms: 10,
    brands: 1,
    competitors: 3,
    reportsPerMonth: 1,
    allowedReportTypes: ["executive"],
    alertsPerMonth: 30,
    auditsPerMonth: 1,
    competitorMap: false,
    coverageGap: false,
  };

  function canAccess(feature: keyof PlanLimits): boolean {
    const val = limits[feature];
    if (typeof val === "boolean") return val;
    if (val === null) return true;
    if (Array.isArray(val)) return val.length > 0;
    return (val as number) > 0;
  }

  return {
    billingData: data ?? null,
    subscription: data?.subscription ?? null,
    planConfig: data?.planConfig ?? null,
    usage: data?.usage ?? null,
    trialEnd: data?.trialEnd ?? null,
    isInTrial: data?.isInTrial ?? false,
    isManuallyBilled: data?.isManuallyBilled ?? false,
    plan,
    limits,
    canAccess,
    isLoading,
    refetch,
  };
}
