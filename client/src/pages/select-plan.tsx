import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, Gift, Clock, Globe, Layers, Plus, Users, Bell, Tag } from "lucide-react";
import { useLocation } from "wouter";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { usePageMeta } from "@/hooks/usePageMeta";
import blueBgPattern from "@assets/blue-background_1776335377885.webp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePricing, formatMoney } from "@/hooks/usePricing";
import { TRIAL_DAY_ADJECTIVE } from "@shared/trial";
import { PageHeading } from "@/components/ui/enterprise";

type SelfServePlanKey = "starter_v2" | "growth_v2" | "accelerate";

type PlanCard = {
  key: SelfServePlanKey | "custom" | "agency";
  badge: string;
  badgeClass: string;
  /** Stripe lookup_key prefix, e.g. "plan_starter" → resolves to
   *  plan_starter_monthly / plan_starter_annual at render time. */
  lookupKeyPrefix?: string;
  monthlyPrice?: string;
  annualHeadline?: string;
  annualSubtext?: string;
  customLabel?: string;
  description: string;
  features: string[];
  highlight?: boolean;
  ctaLabel: string;
  ctaTestId: string;
};

const PLAN_CARDS: PlanCard[] = [
  {
    key: "starter_v2",
    badge: "Starter",
    badgeClass: "bg-[#e8f4fa] text-[#0a2a3a]",
    lookupKeyPrefix: "plan_starter",
    monthlyPrice: "£75",
    annualHeadline: "£650",
    annualSubtext: "billed annually (£54.17/mo equivalent)",
    description: "Brands getting started with AI visibility tracking",
    features: [
      "10 topics (75 prompts) tracked",
      "1 brand profile, 1 user, 5 competitor domains",
      "Weekly data refresh across all 3 LLMs",
      "AI Visibility Dashboard & Perception Mirror",
      "Technical Brand Audit (1/month)",
      "Change Alerts (50/month)",
      "Executive PDF Report (1/period)",
    ],
    ctaLabel: "Select Starter",
    ctaTestId: "button-select-starter",
  },
  {
    key: "growth_v2",
    badge: "Growth",
    badgeClass: "bg-[#00B8D4]/10 text-[#00B8D4]",
    lookupKeyPrefix: "plan_growth",
    monthlyPrice: "£150",
    annualHeadline: "£1,300",
    annualSubtext: "billed annually (£108.33/mo equivalent)",
    description: "Teams managing active AI visibility strategy",
    highlight: true,
    features: [
      "25 topics (150 prompts) tracked",
      "1 brand profile, 3 users, 10 competitor domains",
      "Daily data refresh across all 3 LLMs",
      "Competitor AI Positioning Map",
      "Semantic Coverage Gap Analysis",
      "Technical Brand Audit (4/month)",
      "Change Alerts (150/month)",
      "All PDF Reports (4/period)",
    ],
    ctaLabel: "Select Growth",
    ctaTestId: "button-select-growth",
  },
  {
    key: "accelerate",
    badge: "Accelerate",
    badgeClass: "bg-[#0095ff]/10 text-[#0095ff]",
    lookupKeyPrefix: "plan_accelerate",
    monthlyPrice: "£300",
    annualHeadline: "£2,600",
    annualSubtext: "billed annually (£216.67/mo equivalent)",
    description: "Scaling brands competing aggressively in AI search",
    features: [
      "50 topics (250 prompts) tracked",
      "1 brand profile, 5 users, 10 competitor domains",
      "Daily data refresh across all 3 LLMs",
      "Everything in Growth",
      "Technical Brand Audit (4/month)",
      "Change Alerts (300/month)",
      "All PDF Reports (4/period)",
      "Priority support",
    ],
    ctaLabel: "Select Accelerate",
    ctaTestId: "button-select-accelerate",
  },
  {
    key: "custom",
    badge: "Custom",
    badgeClass: "bg-gradient-to-r from-[#a000ff]/10 to-[#ff00c8]/10 text-[#a000ff]",
    customLabel: "Contact Sales",
    description: "Large brands and platforms with bespoke needs",
    features: [
      "Unlimited topics, prompts and brands",
      "Custom competitor & user limits",
      "Dedicated Account Manager",
      "API access on request",
      "White-label option",
      "Priority SLA & support",
    ],
    ctaLabel: "Contact Sales",
    ctaTestId: "button-select-custom",
  },
  {
    key: "agency",
    badge: "Agency",
    badgeClass: "bg-gradient-to-r from-[#d946ef]/10 to-[#a000ff]/10 text-[#d946ef]",
    customLabel: "Contact Sales",
    description: "Agencies running AEOSTARS across many client brands",
    features: [
      "Multi-client workspace structure",
      "Volume pricing across brand portfolios",
      "Agency-grade reporting & exports",
      "Reseller / white-label options",
      "Dedicated agency success manager",
      "Priority SLA & support",
    ],
    ctaLabel: "Contact Sales",
    ctaTestId: "button-select-agency",
  },
];

const SELF_SERVE_KEYS: SelfServePlanKey[] = ["starter_v2", "growth_v2", "accelerate"];

export default function SelectPlan() {
  const [billingInterval, setBillingInterval] = useState<"annual" | "monthly">("monthly");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [purchasingAddon, setPurchasingAddon] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const isExpiredTrial = params.get("expired") === "true";

  const { data: billingData } = useQuery<any>({
    queryKey: ["/api/billing/subscription"],
    staleTime: 60000,
    retry: false,
  });
  const hasExistingSub = !!billingData?.subscription;
  const hasStripeSub = !!billingData?.subscription?.stripeSubscriptionId;

  const pricing = usePricing();

  async function handleAddonPurchase(addonType: string) {
    if (!hasExistingSub) {
      toast({ title: "Subscription required", description: "Please choose a plan first before adding packs.", variant: "destructive" });
      return;
    }
    setPurchasingAddon(addonType);
    try {
      const path = hasStripeSub ? "/api/billing/stripe/addons" : "/api/billing/addons";
      // Add-ons are billed monthly only in the May 2026 pricing model.
      await apiRequest("POST", path, { addonType, billingInterval: "monthly", quantity: 1 });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({
        title: "Add-on activated",
        description: hasStripeSub
          ? "Your new pack is active. Stripe will prorate the cost on your next invoice."
          : "Your new pack is now active. An invoice has been generated.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to add pack", variant: "destructive" });
    } finally {
      setPurchasingAddon(null);
    }
  }

  async function handleStripePlanChange(plan: SelfServePlanKey) {
    try {
      await apiRequest("POST", "/api/billing/stripe/change-plan", { plan, billingInterval });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Plan updated", description: "Your subscription has been changed. Stripe will prorate the difference." });
      navigate("/billing");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to change plan", variant: "destructive" });
    }
  }

  usePageMeta({
    title: "Choose Your Plan | AEOSTARS",
    description: "Select the AEOSTARS plan that fits your AI visibility monitoring needs.",
    ogType: "website",
  });

  function handleSelect(plan: SelfServePlanKey) {
    if (hasStripeSub) {
      void handleStripePlanChange(plan);
      return;
    }
    const upgradeParam = hasExistingSub ? "&upgrade=true" : "";
    navigate(`/checkout?plan=${plan}&interval=${billingInterval}${upgradeParam}`);
  }

  const isAnnual = billingInterval === "annual";

  const ADDON_CARDS: Array<{
    key: string;
    /** Stripe lookup_key for the monthly add-on price. */
    lookupKey: string;
    icon: React.ElementType;
    accent: string;
    bg: string;
    name: string;
    description: string;
    monthlyPrice: string;
    bullets: string[];
    variant: "primary" | "outline";
  }> = [
    {
      key: "extra_user",
      lookupKey: "addon_extra_user_monthly",
      icon: Users,
      accent: "text-[#22c55e]",
      bg: "bg-[#22c55e]/10",
      name: "Extra User",
      description: "Add 1 additional team member to your account",
      monthlyPrice: "£15.00",
      bullets: ["+1 user seat", "Full platform access", "Cancel any time"],
      variant: "outline",
    },
    {
      key: "extra_brand",
      lookupKey: "addon_extra_brand_monthly",
      icon: Globe,
      accent: "text-[#00B8D4]",
      bg: "bg-[#00B8D4]/10",
      name: "Extra Brand",
      description: "A complete additional brand bundle for your account",
      monthlyPrice: "£50.00",
      bullets: [
        "+1 brand profile",
        "+3 competitors, +10 topics, +75 prompts",
        "+1 audit, +50 alerts, +1 PDF report",
      ],
      variant: "primary",
    },
    {
      key: "topic_prompt_pack",
      lookupKey: "addon_topic_prompt_monthly",
      icon: Tag,
      accent: "text-[#a000ff]",
      bg: "bg-[#a000ff]/10",
      name: "Topic & Prompt Pack",
      description: "Expand the topic and prompt capacity on a brand",
      monthlyPrice: "£25.00",
      bullets: ["+10 topics", "+100 prompts", "Stacks across all your brands"],
      variant: "outline",
    },
    {
      key: "change_alerts_pack",
      lookupKey: "addon_change_alerts_monthly",
      icon: Bell,
      accent: "text-[#0095ff]",
      bg: "bg-[#0095ff]/10",
      name: "Change Alerts Pack",
      description: "More alert headroom plus an extra weekly refresh",
      monthlyPrice: "£25.00",
      bullets: ["+50 change alerts per month", "+1 extra weekly refresh", "Cancel any time"],
      variant: "outline",
    },
    {
      key: "competitor_pack",
      lookupKey: "addon_competitor_pack_monthly",
      icon: Layers,
      accent: "text-[#d946ef]",
      bg: "bg-[#d946ef]/10",
      name: "Competitor Pack",
      description: "Add 5 extra competitor slots across your brands",
      monthlyPrice: "£15.00",
      bullets: ["+5 competitor slots", "AI competitor positioning intelligence", "Cancel any time"],
      variant: "outline",
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#D6EEF8] text-[#0a2a3a] overflow-x-hidden">
      <div className="absolute inset-0">
        <img src={blueBgPattern} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
      <div className="relative">
        <SiteHeader />
        <main>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-24">
            <div className="text-center mb-12 sm:mb-16">
              {isExpiredTrial && (
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-5 py-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Your free trial has ended</span>
                </div>
              )}
              <PageHeading
                title={isExpiredTrial ? "Confirm your plan to continue" : "Choose your plan"}
                headingClassName="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a2a3a] mb-4"
              />
              <p className="text-base sm:text-lg text-[#1a3a4a]/70 mb-8 sm:mb-10 max-w-xl mx-auto">
                {isExpiredTrial
                  ? "Select a plan below to keep your data and continue using AEOSTARS."
                  : `Start with a ${TRIAL_DAY_ADJECTIVE} free trial on annual plans. Cancel any time.`}
              </p>
              <div className="inline-flex items-center rounded-full border border-[#b8ddef]/50 bg-white p-1 gap-1">
                <button
                  onClick={() => setBillingInterval("monthly")}
                  className={`px-4 sm:px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    !isAnnual ? "bg-[#00B8D4] text-white" : "text-[#1a3a4a]/70 hover:text-[#0a2a3a]"
                  }`}
                  data-testid="toggle-monthly"
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingInterval("annual")}
                  className={`px-4 sm:px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    isAnnual ? "bg-[#00B8D4] text-white" : "text-[#1a3a4a]/70 hover:text-[#0a2a3a]"
                  }`}
                  data-testid="toggle-annual"
                >
                  Annually
                  <span className="ml-2 inline-flex items-center rounded-full bg-[#00B8D4] text-white text-[10px] font-bold px-2 py-0.5">
                    Save 28%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {PLAN_CARDS.map((p) => {
                const isSelfServe = SELF_SERVE_KEYS.includes(p.key as SelfServePlanKey);
                const isContactSales = p.key === "custom" || p.key === "agency";
                const accentTick =
                  p.key === "custom"
                    ? "text-[#a000ff]"
                    : p.key === "agency"
                      ? "text-[#d946ef]"
                      : "text-[#00B8D4]";
                return (
                  <div
                    key={p.key}
                    className={`marketing-card rounded-xl hover-elevate ${p.highlight ? "border-2 border-[#00B8D4]/40 relative" : ""}`}
                    data-testid={`card-select-${p.key}`}
                  >
                    {p.highlight && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-[#00B8D4] to-[#d946ef] text-white px-4 py-1">
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    <div className={`p-6 pb-6 ${p.highlight ? "pt-8" : ""}`}>
                      <Badge className={`w-fit mb-4 ${p.badgeClass}`}>{p.badge}</Badge>
                      {isSelfServe ? (
                        <>
                          <div className="text-3xl sm:text-4xl font-bold text-[#0a2a3a]" data-testid={`text-price-monthly-${p.key}`}>
                            {p.lookupKeyPrefix
                              ? pricing.display(`${p.lookupKeyPrefix}_monthly`, p.monthlyPrice ?? "")
                              : p.monthlyPrice}
                            <span className="text-base sm:text-lg text-[#1a3a4a]/50 font-normal">/month</span>
                          </div>
                          {isAnnual ? (
                            (() => {
                              const liveAnnual = p.lookupKeyPrefix
                                ? pricing.get(`${p.lookupKeyPrefix}_annual`)
                                : undefined;
                              const moEquiv = liveAnnual?.unitAmount != null
                                ? formatMoney(Math.round(liveAnnual.unitAmount / 12), liveAnnual.currency)
                                : null;
                              return (
                                <div className="space-y-1 mt-1">
                                  <p className="text-sm text-[#1a3a4a]/60" data-testid={`text-price-annual-${p.key}`}>
                                    or {p.lookupKeyPrefix
                                      ? pricing.display(`${p.lookupKeyPrefix}_annual`, p.annualHeadline ?? "")
                                      : p.annualHeadline}
                                    /year
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center rounded-full bg-[#00B8D4] text-white text-xs font-bold px-2.5 py-0.5">
                                      Save 28%
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs text-[#00B8D4] font-medium">
                                      <Gift className="h-3 w-3" />
                                      {TRIAL_DAY_ADJECTIVE} free trial
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#1a3a4a]/40">
                                    {moEquiv
                                      ? `billed annually (${moEquiv}/mo equivalent)`
                                      : p.annualSubtext}
                                  </p>
                                </div>
                              );
                            })()
                          ) : (
                            <p className="text-sm text-[#00B8D4]/70 mt-1">Save 28% with annual billing</p>
                          )}
                        </>
                      ) : (
                        <div className="text-3xl sm:text-4xl font-bold text-[#0a2a3a]">{p.customLabel}</div>
                      )}
                      <p className="text-[#1a3a4a]/60 mt-2 text-sm">{p.description}</p>
                    </div>
                    <div className="px-6 pb-6 sm:pb-8 space-y-6">
                      <div className="space-y-3">
                        {p.features.map((f) => (
                          <div key={f} className="flex items-start gap-3">
                            <Check className={`h-4 w-4 ${accentTick} mt-0.5 flex-shrink-0`} />
                            <p className="text-sm text-[#0a2a3a]">{f}</p>
                          </div>
                        ))}
                      </div>
                      {isSelfServe ? (
                        <Button
                          className="w-full bg-[#00B8D4] border-[#00B8D4] text-white"
                          size="lg"
                          onClick={() => handleSelect(p.key as SelfServePlanKey)}
                          data-testid={p.ctaTestId}
                        >
                          {hasStripeSub
                            ? `Change to ${p.badge}`
                            : isExpiredTrial
                              ? "Confirm My Plan"
                              : isAnnual
                                ? "Start Free Trial"
                                : p.ctaLabel}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      ) : isContactSales ? (
                        <Button
                          className="w-full border-[#0a2a3a]/20 text-[#0a2a3a]"
                          size="lg"
                          variant="outline"
                          asChild
                          data-testid={p.ctaTestId}
                        >
                          <a href="mailto:sales@aeostars.com" className="flex items-center justify-center gap-2">
                            {p.ctaLabel}
                            <ArrowRight className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-sm text-[#1a3a4a]/40 mt-10">
              Secure card payments via Stripe. Cancel any time from your billing page.
            </p>

            <div className="mt-16 sm:mt-20 pt-12 sm:pt-16 border-t border-[#b8ddef]/30">
              <div className="text-center mb-8 sm:mb-10">
                <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">Additional Packs</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#0a2a3a] mt-3">Need more capacity?</h2>
                <p className="mt-3 text-sm text-[#1a3a4a]/60 max-w-xl mx-auto">
                  Add-on packs are billed monthly alongside your subscription. Stack as many as you need.
                </p>
              </div>

              <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
                {ADDON_CARDS.map((a) => (
                  <div
                    key={a.key}
                    className="marketing-card rounded-xl hover-elevate p-6 sm:p-8"
                    data-testid={`card-addon-${a.key.replace(/_/g, "-")}`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${a.bg} flex items-center justify-center mb-3`}>
                      <a.icon className={`h-5 w-5 ${a.accent}`} />
                    </div>
                    <h3 className="text-lg font-bold text-[#0a2a3a] mb-1">{a.name}</h3>
                    <p className="text-[#1a3a4a]/60 text-sm mb-4">{a.description}</p>
                    <div className="mb-4">
                      <div className="text-2xl font-bold text-[#0a2a3a]" data-testid={`text-addon-price-${a.key.replace(/_/g, "-")}`}>
                        {pricing.display(a.lookupKey, a.monthlyPrice)}
                        <span className="text-sm text-[#1a3a4a]/50 font-normal">/month</span>
                      </div>
                      <p className="text-xs text-[#1a3a4a]/40 mt-1">Monthly only — cancel any time</p>
                    </div>
                    <ul className="space-y-2 mb-4">
                      {a.bullets.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <Check className={`h-3.5 w-3.5 ${a.accent} mt-0.5 shrink-0`} />
                          <span className="text-xs text-[#1a3a4a]/70">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={
                        a.variant === "primary"
                          ? "w-full bg-[#00B8D4] border-[#00B8D4] text-white"
                          : "w-full border-[#0a2a3a]/20 text-[#0a2a3a]"
                      }
                      variant={a.variant === "primary" ? "default" : "outline"}
                      onClick={() => handleAddonPurchase(a.key)}
                      disabled={!hasExistingSub || purchasingAddon === a.key}
                      data-testid={`button-addon-${a.key.replace(/_/g, "-")}`}
                    >
                      {purchasingAddon === a.key ? (
                        "Adding..."
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Add {a.name}
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              {!hasExistingSub && (
                <p className="text-center text-xs text-[#1a3a4a]/40 mt-6">
                  Choose a plan above first, then you can add packs to expand your capacity.
                </p>
              )}
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
