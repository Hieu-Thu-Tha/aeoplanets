import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight, Eye, Brain, Bell, FileSearch, Tag } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import type { CustomerReview } from "@shared/schema";
import { ReviewsSection } from "@/components/ReviewsSection";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePricing, formatMoney } from "@/hooks/usePricing";
import bobbleBannerBg from "@assets/bobble-homepage-banner_1776335377884.webp";
import blueBgPattern from "@assets/blue-background_1776335377885.webp";
import { TRIAL_DAY_ADJECTIVE_TITLE } from "@shared/trial";
import { PageHeading } from "@/components/ui/enterprise";

type PlanColumnKey = "starter" | "growth" | "accelerate" | "custom" | "agency";

const COMPARISON_ROWS: Array<{
  label: string;
  values: Record<PlanColumnKey, string | boolean>;
  highlight?: boolean;
}> = [
  {
    label: "Topics tracked",
    values: { starter: "10 topics", growth: "25 topics", accelerate: "50 topics", custom: "Unlimited", agency: "Unlimited" },
    highlight: true,
  },
  {
    label: "Prompts tracked",
    values: { starter: "75 prompts", growth: "150 prompts", accelerate: "250 prompts", custom: "Unlimited", agency: "Unlimited" },
  },
  {
    label: "Brand profiles",
    values: { starter: "1 brand", growth: "1 brand", accelerate: "1 brand", custom: "Custom", agency: "Multi-client" },
  },
  {
    label: "Users",
    values: { starter: "1 user", growth: "3 users", accelerate: "5 users", custom: "Custom", agency: "Custom" },
  },
  {
    label: "Competitor domains",
    values: { starter: "5", growth: "10", accelerate: "10", custom: "Custom", agency: "Custom" },
  },
  {
    label: "Data refresh",
    values: { starter: "Weekly", growth: "Daily", accelerate: "Daily", custom: "Real-time available", agency: "Real-time available" },
  },
  {
    label: "LLM models",
    values: { starter: "ChatGPT, Claude, Gemini", growth: "ChatGPT, Claude, Gemini", accelerate: "ChatGPT, Claude, Gemini", custom: "ChatGPT, Claude, Gemini", agency: "ChatGPT, Claude, Gemini" },
  },
  {
    label: "AI Visibility Dashboard",
    values: { starter: true, growth: true, accelerate: true, custom: true, agency: true },
  },
  {
    label: "AI Perception Mirror",
    values: { starter: true, growth: true, accelerate: true, custom: true, agency: true },
  },
  {
    label: "Technical Brand Audit",
    values: { starter: "1/month", growth: "4/month", accelerate: "4/month", custom: "Unlimited", agency: "Unlimited" },
  },
  {
    label: "Change Alerts",
    values: { starter: "50/month", growth: "150/month", accelerate: "300/month", custom: "Unlimited", agency: "Unlimited" },
  },
  {
    label: "PDF Reports",
    values: { starter: "1/period (Executive)", growth: "4/period (All)", accelerate: "4/period (All)", custom: "Unlimited", agency: "Unlimited" },
  },
  {
    label: "Competitor AI Positioning Map",
    values: { starter: false, growth: true, accelerate: true, custom: true, agency: true },
  },
  {
    label: "Semantic Coverage Gap Analysis",
    values: { starter: false, growth: true, accelerate: true, custom: true, agency: true },
  },
  {
    label: "API Access",
    values: { starter: false, growth: false, accelerate: false, custom: true, agency: true },
  },
  {
    label: "White-label option",
    values: { starter: false, growth: false, accelerate: false, custom: true, agency: true },
  },
  {
    label: "Dedicated Account Manager",
    values: { starter: false, growth: false, accelerate: false, custom: true, agency: true },
  },
];

function CellValue({ val }: { val: string | boolean }) {
  if (val === true) return <Check className="h-4 w-4 text-[#00B8D4] mx-auto" />;
  if (val === false) return <X className="h-4 w-4 text-[#1a3a4a]/20 mx-auto" />;
  return <span className="text-sm text-[#1a3a4a]/80">{val}</span>;
}

type PlanCard = {
  key: PlanColumnKey;
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
  features: { text: string; bold?: boolean }[];
  highlight?: boolean;
  ctaLabel: string;
  ctaHref: string;
  ctaTestId: string;
  showLinkedIn?: boolean;
  isContactSales?: boolean;
};

const PLAN_CARDS: PlanCard[] = [
  {
    key: "starter",
    badge: "Starter",
    badgeClass: "bg-[#e8f4fa] text-[#0a2a3a]",
    lookupKeyPrefix: "plan_starter",
    monthlyPrice: "£75",
    annualHeadline: "£650",
    annualSubtext: "billed annually (£54.17/mo equivalent)",
    description: "Brands and in-house teams getting started with AI visibility",
    features: [
      { text: "10 topics (75 prompts) tracked", bold: true },
      { text: "1 brand, 1 user, 5 competitors" },
      { text: "Weekly data refresh, all 3 LLMs" },
      { text: "AI Visibility Dashboard & Perception Mirror" },
      { text: "Technical Brand Audit (1/month)" },
      { text: "Change Alerts (50/month)" },
      { text: "Executive PDF Report (1/period)" },
    ],
    ctaLabel: "Get Started",
    ctaHref: "/signup",
    ctaTestId: "button-select-starter",
    showLinkedIn: true,
  },
  {
    key: "growth",
    badge: "Growth",
    badgeClass: "bg-[#00B8D4]/10 text-[#00B8D4]",
    lookupKeyPrefix: "plan_growth",
    monthlyPrice: "£150",
    annualHeadline: "£1,300",
    annualSubtext: "billed annually (£108.33/mo equivalent)",
    description: "Teams managing active AI visibility strategy",
    highlight: true,
    features: [
      { text: "25 topics (150 prompts) tracked", bold: true },
      { text: "1 brand, 3 users, 10 competitors" },
      { text: "Daily data refresh, all 3 LLMs" },
      { text: "Competitor AI Positioning Map" },
      { text: "Semantic Coverage Gap Analysis" },
      { text: "Technical Brand Audit (4/month)" },
      { text: "Change Alerts (150/month)" },
      { text: "All PDF Reports (4/period)" },
    ],
    ctaLabel: "Get Started",
    ctaHref: "/signup",
    ctaTestId: "button-select-growth",
    showLinkedIn: true,
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
      { text: "50 topics (250 prompts) tracked", bold: true },
      { text: "1 brand, 5 users, 10 competitors" },
      { text: "Daily data refresh, all 3 LLMs" },
      { text: "Everything in Growth" },
      { text: "Technical Brand Audit (4/month)" },
      { text: "Change Alerts (300/month)" },
      { text: "All PDF Reports (4/period)" },
      { text: "Priority support" },
    ],
    ctaLabel: "Get Started",
    ctaHref: "/signup",
    ctaTestId: "button-select-accelerate",
    showLinkedIn: true,
  },
  {
    key: "custom",
    badge: "Custom",
    badgeClass: "bg-gradient-to-r from-[#a000ff]/10 to-[#ff00c8]/10 text-[#a000ff]",
    customLabel: "Contact Sales",
    description: "Large brands and platforms with bespoke needs",
    features: [
      { text: "Unlimited topics, prompts and brands", bold: true },
      { text: "Custom competitor & user limits" },
      { text: "Real-time data refresh available" },
      { text: "Dedicated Account Manager" },
      { text: "API access on request" },
      { text: "White-label option" },
      { text: "Priority SLA & support" },
    ],
    ctaLabel: "Contact Sales",
    ctaHref: "mailto:sales@aeostars.com",
    ctaTestId: "button-select-custom",
    isContactSales: true,
  },
  {
    key: "agency",
    badge: "Agency",
    badgeClass: "bg-gradient-to-r from-[#d946ef]/10 to-[#a000ff]/10 text-[#d946ef]",
    customLabel: "Contact Sales",
    description: "Agencies running AEOSTARS across many client brands",
    features: [
      { text: "Multi-client workspace structure", bold: true },
      { text: "Volume pricing across brand portfolios" },
      { text: "Agency-grade reporting & exports" },
      { text: "Reseller / white-label options" },
      { text: "Dedicated agency success manager" },
      { text: "Priority SLA & support" },
    ],
    ctaLabel: "Contact Sales",
    ctaHref: "mailto:sales@aeostars.com",
    ctaTestId: "button-select-agency",
    isContactSales: true,
  },
];

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"annual" | "monthly">("monthly");

  usePageMeta({
    title: "AEOSTARS Pricing — AI Brand Visibility Monitoring Plans",
    description: "Transparent pricing for AI brand visibility intelligence. Monitor how your brand appears in ChatGPT, Claude, and Gemini. Plans from £75/month, save 28% annually.",
    keywords: "AEOSTARS pricing, AI brand monitoring plans, LLM visibility tracking cost, AI share of voice pricing, brand intelligence platform pricing",
    ogType: "website",
  });

  const { data: reviews = [] } = useQuery<CustomerReview[]>({
    queryKey: ["/api/reviews/approved"],
    staleTime: 60000,
  });

  const pricing = usePricing();
  const isAnnual = billingInterval === "annual";

  return (
    <div className="min-h-screen bg-[#D6EEF8] text-[#0a2a3a] overflow-x-hidden">
      <SiteHeader />
      <div className="flex flex-col">
        <main className="flex-1">
          <div className="relative overflow-hidden bg-white">
            <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-24 lg:py-32">
              <div className="flex flex-col items-center justify-center text-center">
                <PageHeading
                  title={(
                    <>
                      <span className="block gradient-text-bobble">Simple, transparent</span>
                      <span className="block mt-2 text-[#0a2a3a]">pricing</span>
                    </>
                  )}
                  titleText="Simple, transparent pricing"
                  headingClassName="text-4xl sm:text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl max-w-5xl"
                />
                <p className="mt-10 max-w-3xl text-lg sm:text-xl text-[#1a3a4a]/70">
                  Choose the plan that matches your monitoring needs. Every plan includes scanning across ChatGPT, Claude Haiku 4.5, and Gemini 2.5 Flash — no hidden fees, no setup costs.
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#D6EEF8]">
            <div className="absolute inset-0">
              <img src={bobbleBannerBg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24">

              <div className="flex justify-center mb-12">
                <div className="inline-flex items-center rounded-full border border-[#b8ddef]/50 bg-white p-1 gap-1">
                  <button
                    onClick={() => setBillingInterval("monthly")}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${!isAnnual ? "bg-[#00B8D4] text-white" : "text-[#1a3a4a]/70 hover:text-[#0a2a3a]"}`}
                    data-testid="toggle-monthly"
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingInterval("annual")}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${isAnnual ? "bg-[#00B8D4] text-white" : "text-[#1a3a4a]/70 hover:text-[#0a2a3a]"}`}
                    data-testid="toggle-annual"
                  >
                    Annually
                    <span className="ml-2 text-xs font-semibold opacity-90">Save 28%</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {PLAN_CARDS.map((p) => {
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
                      data-testid={`card-plan-${p.key}`}
                    >
                      {p.highlight && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <Badge className="bg-gradient-to-r from-[#00B8D4] to-[#d946ef] text-white px-4 py-1">
                            Most Popular
                          </Badge>
                        </div>
                      )}
                      <div className={`p-6 pb-6 ${p.highlight ? "pt-8" : ""}`}>
                        <Badge className={`w-fit mb-4 ${p.badgeClass}`} data-testid={`badge-plan-${p.key}`}>{p.badge}</Badge>
                        {!p.isContactSales ? (
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
                                    <span className="inline-flex items-center rounded-full bg-[#00B8D4] text-white text-xs font-bold px-2.5 py-0.5">
                                      Save 28%
                                    </span>
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
                      <div className="px-6 pb-6 sm:pb-8 space-y-5">
                        <div className="space-y-3">
                          {p.features.map((f) => (
                            <div key={f.text} className="flex items-start gap-2">
                              <Check className={`h-4 w-4 ${accentTick} mt-0.5 flex-shrink-0`} />
                              <p className={`text-sm ${f.bold ? "text-[#0a2a3a] font-semibold" : "text-[#1a3a4a]/80"}`}>{f.text}</p>
                            </div>
                          ))}
                        </div>
                        <div className="pt-4 border-t border-[#b8ddef]/20">
                          <p className="text-xs text-[#1a3a4a]/40 mb-4">
                            {p.isContactSales
                              ? "Custom contract — talk to our team"
                              : isAnnual
                                ? "Billed annually — cancel any time"
                                : "Monthly — switch to annual to save 28%"}
                          </p>
                          {p.isContactSales ? (
                            <Button
                              className="w-full border-[#0a2a3a]/20 text-[#0a2a3a]"
                              size="lg"
                              variant="outline"
                              data-testid={p.ctaTestId}
                              asChild
                            >
                              <a href={p.ctaHref} className="flex items-center justify-center gap-2">
                                {p.ctaLabel}
                                <ArrowRight className="ml-1 h-4 w-4" />
                              </a>
                            </Button>
                          ) : (
                            <>
                              <Button
                                className="w-full bg-[#00B8D4] border-[#00B8D4] text-white"
                                size="lg"
                                data-testid={p.ctaTestId}
                                asChild
                              >
                                <a href={p.ctaHref} className="flex items-center justify-center gap-2">
                                  {p.ctaLabel}
                                  <ArrowRight className="ml-1 h-4 w-4" />
                                </a>
                              </Button>
                              {p.showLinkedIn && (
                                <a
                                  href="/api/auth/linkedin"
                                  className="text-[#1a3a4a]/40 text-xs flex items-center justify-center gap-1.5 mt-3"
                                  data-testid={`link-${p.key}-linkedin`}
                                >
                                  <SiLinkedin className="h-3 w-3" />
                                  or sign up with LinkedIn
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-center text-sm text-[#1a3a4a]/40 mt-8">
                Secure card payments via Stripe. Cancel any time from your billing page.
              </p>
            </div>
          </div>

          <div className="bg-white border-t border-[#b8ddef]/30">
            <div className="mx-auto max-w-5xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
              <div className="text-center mb-14">
                <h2 className="text-3xl sm:text-4xl font-bold text-[#0a2a3a] mb-4">Core platform — in every plan</h2>
                <p className="text-lg text-[#1a3a4a]/70">
                  All plans include AI scanning across the major LLMs and these core intelligence tools from day one
                </p>
              </div>
              <div className="grid gap-8 lg:grid-cols-3 md:grid-cols-2">
                <div className="marketing-card rounded-xl hover-elevate p-6 sm:p-8" data-testid="card-feature-terms">
                  <div className="w-14 h-14 rounded-lg bg-[#00B8D4]/10 flex items-center justify-center mb-6">
                    <Tag className="h-7 w-7 text-[#00B8D4]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">Topic & Prompt Tracking</h3>
                  <p className="text-base text-[#1a3a4a]/70 leading-relaxed">
                    Define the exact topics and prompts you want to monitor — like "best [your category] platform for [your audience]" — and track how each LLM responds to them on your refresh cadence.
                  </p>
                </div>

                <div className="marketing-card rounded-xl hover-elevate p-6 sm:p-8" data-testid="card-feature-visibility">
                  <div className="w-14 h-14 rounded-lg bg-[#00B8D4]/10 flex items-center justify-center mb-6">
                    <Eye className="h-7 w-7 text-[#00B8D4]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">AI Visibility Dashboard</h3>
                  <p className="text-base text-[#1a3a4a]/70 leading-relaxed">
                    AI Share of Voice scores, 30-day trend charts, and a filterable table of every prompt run — broken down by model, type, sentiment, and competitor mentions.
                  </p>
                </div>

                <div className="marketing-card rounded-xl hover-elevate p-6 sm:p-8" data-testid="card-feature-perception">
                  <div className="w-14 h-14 rounded-lg bg-[#a000ff]/10 flex items-center justify-center mb-6">
                    <Brain className="h-7 w-7 text-[#a000ff]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">AI Perception Mirror</h3>
                  <p className="text-base text-[#1a3a4a]/70 leading-relaxed">
                    A scored narrative profile of how AI models describe your brand — covering positioning clarity, authority depth, proof strength, and differentiation.
                  </p>
                </div>

                <div className="marketing-card rounded-xl hover-elevate p-6 sm:p-8" data-testid="card-feature-alerts">
                  <div className="w-14 h-14 rounded-lg bg-[#d946ef]/10 flex items-center justify-center mb-6">
                    <Bell className="h-7 w-7 text-[#d946ef]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">Change Monitoring & Alerts</h3>
                  <p className="text-base text-[#1a3a4a]/70 leading-relaxed">
                    Change detection compares AI responses against the previous run. Get alerted when a competitor gains ground, your brand disappears, or sentiment shifts.
                  </p>
                </div>

                <div className="marketing-card rounded-xl hover-elevate p-6 sm:p-8" data-testid="card-feature-audit">
                  <div className="w-14 h-14 rounded-lg bg-[#0095ff]/10 flex items-center justify-center mb-6">
                    <FileSearch className="h-7 w-7 text-[#0095ff]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">Technical Brand Audit</h3>
                  <p className="text-base text-[#1a3a4a]/70 leading-relaxed">
                    Technical assessment of your website's LLM readability — checks schema markup, FAQ structure, author signals, canonical tags, and internal linking.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#e8f4fa] border-t border-[#b8ddef]/30">
            <div className="absolute inset-0">
              <img src={blueBgPattern} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-[#0a2a3a] mb-3">Full feature comparison</h2>
                <p className="text-[#1a3a4a]/60">Everything you need to pick the right plan</p>
              </div>
              <div className="overflow-x-auto bg-white rounded-xl border border-[#b8ddef]/30 shadow-sm">
                <table className="w-full text-sm" data-testid="table-feature-comparison">
                  <thead>
                    <tr className="border-b border-[#b8ddef]/20">
                      <th className="text-left py-4 pr-4 pl-6 text-[#1a3a4a]/60 font-medium w-[28%]">Feature</th>
                      <th className="py-4 px-3 text-center text-[#0a2a3a] font-semibold">Starter</th>
                      <th className="py-4 px-3 text-center text-[#00B8D4] font-semibold">Growth</th>
                      <th className="py-4 px-3 text-center text-[#0095ff] font-semibold">Accelerate</th>
                      <th className="py-4 px-3 text-center text-[#a000ff] font-semibold">Custom</th>
                      <th className="py-4 px-3 text-center text-[#d946ef] font-semibold">Agency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map((row) => (
                      <tr
                        key={row.label}
                        className={`border-b border-[#b8ddef]/10 ${row.highlight ? "bg-[#D6EEF8]/30" : ""}`}
                      >
                        <td className={`py-3 pr-4 pl-6 ${row.highlight ? "text-[#0a2a3a] font-medium" : "text-[#1a3a4a]/70"}`}>
                          {row.label}
                        </td>
                        <td className="py-3 px-3 text-center"><CellValue val={row.values.starter} /></td>
                        <td className="py-3 px-3 text-center"><CellValue val={row.values.growth} /></td>
                        <td className="py-3 px-3 text-center"><CellValue val={row.values.accelerate} /></td>
                        <td className="py-3 px-3 text-center"><CellValue val={row.values.custom} /></td>
                        <td className="py-3 px-3 text-center"><CellValue val={row.values.agency} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <ReviewsSection
            reviews={reviews}
            title="What Our Customers Say"
            subtitle="Customer Reviews"
          />

          <div className="bg-white border-t border-[#b8ddef]/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-24 text-center">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a2a3a] mb-6 sm:mb-8">
                Start measuring your AI presence today
              </h2>
              <p className="text-lg text-[#1a3a4a]/70 mb-8 sm:mb-12 max-w-2xl mx-auto">
                Connect your domain, set your competitors, and get a complete baseline AI visibility report within minutes
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-[#00B8D4] border-[#00B8D4] text-white text-base sm:text-lg"
                  asChild
                  data-testid="button-cta-get-started"
                >
                  <a href="/signup" className="flex items-center gap-2">
                    Start {TRIAL_DAY_ADJECTIVE_TITLE} Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[#0a2a3a]/20 text-[#0a2a3a] text-base sm:text-lg"
                  asChild
                  data-testid="button-cta-contact"
                >
                  <a href="mailto:sales@aeostars.com">Contact Sales</a>
                </Button>
              </div>
              <a
                href="/api/auth/linkedin"
                className="mt-4 text-[#1a3a4a]/40 text-sm inline-flex items-center gap-1.5"
                data-testid="link-pricing-bottom-linkedin"
              >
                <SiLinkedin className="h-3.5 w-3.5" />
                or sign up with LinkedIn
              </a>
            </div>
          </div>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
