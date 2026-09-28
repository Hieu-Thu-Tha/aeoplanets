import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Lock, ArrowRight, ArrowLeft, Loader2, Sparkles, PartyPopper, ScrollText, Building2, FileCheck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { usePageMeta } from "@/hooks/usePageMeta";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePricing, formatMoney } from "@/hooks/usePricing";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/hooks/useAuth";
import { PageHeading } from "@/components/ui/enterprise";

const PLAN_DETAILS: Record<string, {
  name: string;
  /** Stripe lookup_key prefix for live price resolution.
   *  Omitted for legacy grandfathered keys. */
  lookupKeyPrefix?: string;
  annualAmount: string;
  monthlyAmount: string;
  annualEquiv: string;
  features: string[];
}> = {
  starter_v2: {
    name: "Starter",
    lookupKeyPrefix: "plan_starter",
    annualAmount: "£650.00",
    monthlyAmount: "£75.00",
    annualEquiv: "£54.17/mo equivalent",
    features: [
      "10 topics (75 prompts) tracked across all 3 LLMs",
      "1 brand profile, 1 user, 5 competitor domains",
      "Weekly data refresh",
      "AI Visibility Dashboard & Perception Mirror",
      "Technical Brand Audit (1/month)",
      "Change Alerts (50/month)",
      "Executive PDF Report (1/period)",
      "ChatGPT, Claude Haiku 4.5, Gemini 2.5 Flash",
    ],
  },
  growth_v2: {
    name: "Growth",
    lookupKeyPrefix: "plan_growth",
    annualAmount: "£1,300.00",
    monthlyAmount: "£150.00",
    annualEquiv: "£108.33/mo equivalent",
    features: [
      "25 topics (150 prompts) tracked across all 3 LLMs",
      "1 brand profile, 3 users, 10 competitor domains",
      "Daily data refresh",
      "Competitor AI Positioning Map",
      "Semantic Coverage Gap Analysis",
      "Technical Brand Audit (4/month)",
      "Change Alerts (150/month)",
      "All PDF Reports (4/period)",
    ],
  },
  accelerate: {
    name: "Accelerate",
    lookupKeyPrefix: "plan_accelerate",
    annualAmount: "£2,600.00",
    monthlyAmount: "£300.00",
    annualEquiv: "£216.67/mo equivalent",
    features: [
      "50 topics (250 prompts) tracked across all 3 LLMs",
      "1 brand profile, 5 users, 10 competitor domains",
      "Daily data refresh",
      "Everything in Growth",
      "Technical Brand Audit (4/month)",
      "Change Alerts (300/month)",
      "All PDF Reports (4/period)",
      "Priority support",
    ],
  },
  // Legacy keys retained for grandfathered customers visiting the checkout
  // confirm screen during a Stripe-managed plan change.
  starter: {
    name: "Starter (legacy)",
    annualAmount: "£359.88",
    monthlyAmount: "£38.99",
    annualEquiv: "£29.99/mo equivalent",
    features: ["Legacy Starter plan (grandfathered)"],
  },
  growth: {
    name: "Growth (legacy)",
    annualAmount: "£959.88",
    monthlyAmount: "£103.99",
    annualEquiv: "£79.99/mo equivalent",
    features: ["Legacy Growth plan (grandfathered)"],
  },
};

const TERMS_AND_CONDITIONS = `AEOStars Terms and Conditions of Service

Effective Date: 10/01/2026
Company: Bobble Digital Ltd, trading as AEOStars, a company registered in England and Wales
Registered Address: Suite 1.07, Department, 4 The Boulevard, Leeds Dock, Leeds, LS10 1PZ
Telephone: +44 (0113) 468 3902


1. Acceptance of Terms

By upgrading from a free trial to a paid subscription, you confirm that you:

Agree to be bound by these Terms and Conditions

Authorise Bobble Digital Ltd (trading as AEOStars) to charge the selected subscription fee

Confirm that you are acting on behalf of a business or in a professional capacity

If you do not agree to these Terms, you must not proceed with payment or use the paid Services.

2. Description of Service

AEOStars provides an AI-driven analytics and optimisation platform designed to:

Analyse how brands appear within AI systems and search environments

Provide recommendations based on publicly available and model-interpreted data

Monitor and report on visibility trends over time

The Service is provided on a best-effort, insight-led basis and does not guarantee accuracy, completeness, or specific outcomes.

3. Subscription and Payment
3.1 Subscription Model

The Service is provided on a subscription basis, billed [monthly/annually] in advance

Pricing is displayed at the point of purchase and may change with notice

3.2 Payment Authorisation

By subscribing, you:

Authorise AEOStars to collect recurring payments using your selected method

Agree that payments will continue until cancelled in accordance with these Terms

3.3 Failed Payments

If payment fails:

Access to the Service may be suspended or restricted

AEOStars reserves the right to retry payment collection

4. Free Trial and Conversion

Free trials are provided at AEOStars' discretion

Upon expiry, continued access requires a paid subscription

Upgrading from trial to paid constitutes acceptance of these Terms

5. No Refund Policy

All payments are non-refundable.

This includes, but is not limited to:

Partial use of the Service

Dissatisfaction with insights or outputs

Lack of usage following purchase

Changes in business circumstances

You are responsible for cancelling your subscription before renewal if you do not wish to continue.

6. Service Availability and Outages

AEOStars aims to provide high availability but does not guarantee uninterrupted access.

We are not liable for:

Temporary outages or downtime

Maintenance periods (scheduled or emergency)

Third-party service failures, including AI providers, hosting infrastructure, or APIs

We may modify, suspend, or discontinue any part of the Service at any time.

7. Accuracy and Use of Information
7.1 No Guarantee of Accuracy

The platform relies on:

Third-party AI systems

Publicly available data

Probabilistic models

As such:

Outputs may be incomplete, outdated, or incorrect

Recommendations should not be relied upon as sole decision-making input

7.2 User Responsibility

You agree that:

All decisions made using AEOStars data are your responsibility

You will validate insights before acting on them commercially

8. Limitation of Liability

To the fullest extent permitted by law:

AEOStars shall not be liable for any indirect, incidental, or consequential loss

This includes loss of revenue, profit, data, business opportunity, or reputation

Our total liability for any claim shall not exceed:

The total fees paid by you in the preceding 3 months

9. Intellectual Property

All rights in the platform, including:

Software

Algorithms

Data models

Branding

remain the property of Bobble Digital Ltd.

You are granted a limited, non-transferable licence to use the Service for internal business purposes only.

10. Acceptable Use

You agree not to:

Reverse engineer or attempt to extract source code

Use the Service for unlawful or harmful purposes

Resell, sublicense, or commercially exploit the platform without permission

Attempt to overload, disrupt, or compromise the system

11. Data and Privacy

AEOStars processes data in accordance with its Privacy Policy

You confirm that you have the right to provide any data submitted to the platform

We may use aggregated, anonymised data to improve the Service

12. Termination
12.1 By You

You may cancel your subscription at any time via your account settings.

Cancellation applies to the next billing cycle

No refunds will be issued for the current period

12.2 By AEOStars

We may suspend or terminate access if:

You breach these Terms

Payment is not received

We suspect misuse or abuse of the platform

13. Changes to the Service and Terms

We reserve the right to:

Update these Terms at any time

Modify features, pricing, or functionality

Continued use of the Service constitutes acceptance of updated Terms.

14. Governing Law

These Terms are governed by the laws of England and Wales.

Any disputes shall be subject to the exclusive jurisdiction of the English courts.`;

function getRenewalDate(interval: string): string {
  const d = new Date();
  if (interval === "annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const STEPS = [
  { id: 1, label: "Company Details", icon: Building2 },
  { id: 2, label: "Terms & Conditions", icon: ScrollText },
  { id: 3, label: "Confirm", icon: FileCheck },
];

export default function Checkout() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const urlParams = new URLSearchParams(window.location.search);
  const plan = (urlParams.get("plan") as "starter_v2" | "growth_v2" | "accelerate" | "starter" | "growth") ?? "starter_v2";
  const interval = (urlParams.get("interval") as "monthly" | "annual") ?? "annual";
  const isUpgrade = urlParams.get("upgrade") === "true";

  const { brands, activeBrand } = useBrand();
  const hasExistingBrand = brands.length > 0;
  const existingBrand = hasExistingBrand ? activeBrand : null;

  const [step, setStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    billingAddress: "",
    billingEmail: user?.email ?? "",
    fullName: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
    telephone: "",
  });

  usePageMeta({
    title: `Complete Your ${plan} Plan — AEOSTARS`,
    description: "Confirm your AEOSTARS subscription to get started.",
    ogType: "website",
  });

  useEffect(() => {
    if (existingBrand?.domain && !formData.companyName) {
      const cleaned = existingBrand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      setFormData((prev) => ({ ...prev, companyName: cleaned }));
    }
  }, [existingBrand]);

  const pricing = usePricing();

  if (!["starter", "growth", "starter_v2", "growth_v2", "accelerate"].includes(plan)) {
    navigate("/select-plan");
    return null;
  }

  const planDetails = PLAN_DETAILS[plan];
  const isAnnual = interval === "annual";
  const periodLabel = isAnnual ? "/year" : "/month";

  const liveMonthly = planDetails.lookupKeyPrefix
    ? pricing.get(`${planDetails.lookupKeyPrefix}_monthly`)
    : undefined;
  const liveAnnual = planDetails.lookupKeyPrefix
    ? pricing.get(`${planDetails.lookupKeyPrefix}_annual`)
    : undefined;
  const displayMonthly = formatMoney(liveMonthly?.unitAmount, liveMonthly?.currency ?? "gbp")
    ?? planDetails.monthlyAmount;
  const displayAnnual = formatMoney(liveAnnual?.unitAmount, liveAnnual?.currency ?? "gbp")
    ?? planDetails.annualAmount;
  const displayPrice = isAnnual ? displayAnnual : displayMonthly;
  const displayAnnualEquiv = liveAnnual?.unitAmount != null
    ? `${formatMoney(Math.round(liveAnnual.unitAmount / 12), liveAnnual.currency) ?? ""}/mo equivalent`
    : planDetails.annualEquiv;

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleNextFromCompany() {
    if (!formData.companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    if (!formData.billingEmail.trim()) {
      toast({ title: "Billing email is required", variant: "destructive" });
      return;
    }
    if (!formData.telephone.trim()) {
      toast({ title: "Telephone number is required", variant: "destructive" });
      return;
    }
    setStep(2);
  }

  function handleNextFromTerms() {
    if (!termsAccepted) {
      toast({ title: "Please accept the Terms & Conditions to continue", variant: "destructive" });
      return;
    }
    setStep(3);
  }

  function handleTermsScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) {
      setTermsScrolled(true);
    }
  }

  // ALWAYS refetch on mount so we never act on a stale "Stripe is offline"
  // snapshot (e.g. cached from before STRIPE_SECRET_KEY was added). Without
  // this, the legacy local-only path could silently activate plans without
  // ever creating a Stripe Customer or Subscription.
  const { refetch: refetchStripeConfig } = useQuery<{ configured: boolean; mode: string | null }>({
    queryKey: ["/api/billing/stripe/config"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      // Re-verify Stripe is configured at the moment of checkout. If the
      // server reports "not configured" we abort with a visible error
      // rather than falling back to the legacy local-only confirm-plan
      // path — that fallback was the source of the silent drift bug.
      const fresh = await refetchStripeConfig();
      if (!fresh.data?.configured) {
        toast({
          title: "Billing temporarily unavailable",
          description: "Stripe is not currently configured. Please try again in a moment, or contact support if this persists.",
          variant: "destructive",
        });
        return;
      }

      const res = await apiRequest("POST", "/api/billing/checkout", {
        plan,
        billingInterval: interval,
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Stripe checkout did not return a URL");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to start checkout";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-black text-white overflow-x-hidden">
        <SiteHeader />
        <main>
          <div className="max-w-xl mx-auto px-4 sm:px-8 py-24 sm:py-32 text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-[#00c8ff]/10 flex items-center justify-center">
                <PartyPopper className="h-10 w-10 text-[#00c8ff]" />
              </div>
            </div>
            <PageHeading
              title={isUpgrade ? "Plan upgraded!" : "You're all set!"}
              headingClassName="text-3xl sm:text-4xl font-bold text-white mb-4"
              headingTestId="text-success-title"
            />
            <p className="text-white/70 text-lg mb-2">
              Your <span className="text-white font-semibold">{planDetails.name}</span> plan is now active.
            </p>
            <p className="text-white/50 text-sm mb-8">
              Your payment of {displayPrice} has been processed. A receipt will be sent to via email from Stripe.
            </p>
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full sm:w-auto px-10"
                onClick={() => navigate("/")}
                data-testid="button-go-to-dashboard"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
              <p className="text-xs text-white/30">
                Your existing brand data and scan results are ready
              </p>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <SiteHeader />
      <main>
        <div className="max-w-4xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-20">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => step > 1 ? setStep(step - 1) : navigate("/select-plan")}
              className="text-white/60"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    step === s.id
                      ? "bg-[#00c8ff]/15 text-[#00c8ff] border border-[#00c8ff]/30"
                      : step > s.id
                        ? "bg-[#00c8ff]/10 text-[#00c8ff]/70"
                        : "bg-white/5 text-white/40"
                  }`}
                >
                  {step > s.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <s.icon className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-12 h-px ${step > s.id ? "bg-[#00c8ff]/40" : "bg-white/10"}`} />
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="md:col-span-3">
              {step === 1 && (
                <Card className="glass-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-white">Company Details</CardTitle>
                    <p className="text-sm text-white/60">Confirm your company information for billing</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-white/80">Full name *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => handleChange("fullName", e.target.value)}
                        required
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                        placeholder="Your full name"
                        data-testid="input-full-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="companyName" className="text-white/80">Company name *</Label>
                      <Input
                        id="companyName"
                        value={formData.companyName}
                        onChange={(e) => handleChange("companyName", e.target.value)}
                        required
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                        placeholder="Your company name"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="billingEmail" className="text-white/80">Billing email *</Label>
                      <Input
                        id="billingEmail"
                        type="email"
                        value={formData.billingEmail}
                        onChange={(e) => handleChange("billingEmail", e.target.value)}
                        required
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                        placeholder="billing@company.com"
                        data-testid="input-billing-email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="telephone" className="text-white/80">Telephone number *</Label>
                      <Input
                        id="telephone"
                        type="tel"
                        value={formData.telephone}
                        onChange={(e) => handleChange("telephone", e.target.value)}
                        required
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                        placeholder="+44 20 1234 5678"
                        data-testid="input-telephone"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="billingAddress" className="text-white/80">Billing address</Label>
                      <Textarea
                        id="billingAddress"
                        value={formData.billingAddress}
                        onChange={(e) => handleChange("billingAddress", e.target.value)}
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/30 resize-none"
                        placeholder="Company address (optional)"
                        rows={3}
                        data-testid="input-billing-address"
                      />
                    </div>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleNextFromCompany}
                      data-testid="button-next-to-terms"
                    >
                      Continue to Terms & Conditions
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card className="glass-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-white">Terms & Conditions</CardTitle>
                    <p className="text-sm text-white/60">Please review and accept the terms of service</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      className="h-80 overflow-y-auto rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70 leading-relaxed whitespace-pre-wrap font-mono"
                      onScroll={handleTermsScroll}
                      data-testid="container-terms"
                    >
                      {TERMS_AND_CONDITIONS}
                    </div>
                    {!termsScrolled && (
                      <p className="text-xs text-white/40 text-center">Scroll to the bottom to continue</p>
                    )}
                    <div className="flex items-start gap-3 pt-2">
                      <Checkbox
                        id="accept-terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                        className="mt-0.5 border-white/30 data-[state=checked]:bg-[#00c8ff] data-[state=checked]:border-[#00c8ff]"
                        data-testid="checkbox-accept-terms"
                      />
                      <label htmlFor="accept-terms" className="text-sm text-white/80 cursor-pointer leading-snug">
                        I have read and agree to the AEOStars Terms and Conditions of Service (Bobble Digital Ltd). I understand that all payments are non-refundable.
                      </label>
                    </div>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleNextFromTerms}
                      disabled={!termsAccepted}
                      data-testid="button-next-to-confirm"
                    >
                      Continue to Confirmation
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card className="glass-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-white">Confirm Your Plan</CardTitle>
                    <p className="text-sm text-white/60">Review your details and confirm your subscription</p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="rounded-md border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <h3 className="text-sm font-medium text-white/90">Company Information</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-white/50">Name:</span>
                          <span className="ml-2 text-white">{formData.fullName}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Company:</span>
                          <span className="ml-2 text-white">{formData.companyName}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Email:</span>
                          <span className="ml-2 text-white">{formData.billingEmail}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Telephone:</span>
                          <span className="ml-2 text-white" data-testid="text-confirm-telephone">{formData.telephone}</span>
                        </div>
                        {formData.billingAddress && (
                          <div>
                            <span className="text-white/50">Address:</span>
                            <span className="ml-2 text-white">{formData.billingAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <h3 className="text-sm font-medium text-white/90">Subscription</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[#00c8ff]/20 text-[#00c8ff]">{planDetails.name}</Badge>
                        <Badge variant="outline" className="text-white/60 border-white/20">
                          {isAnnual ? "Annual" : "Monthly"}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {displayPrice}<span className="text-sm text-white/50 font-normal">{periodLabel}</span>
                      </p>
                      <p className="text-xs text-white/40">
                        Next renewal: {getRenewalDate(interval)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-[#00c8ff] flex-shrink-0" />
                      <p className="text-xs text-white/60">Terms & Conditions accepted</p>
                    </div>

                    <div className="rounded-md border border-[#00c8ff]/20 bg-[#00c8ff]/5 p-4">
                      <p className="text-xs text-[#00c8ff]/80">
                        After confirming, you'll be redirected to Stripe's secure checkout to complete your payment. Your subscription will activate once payment is confirmed.
                      </p>
                    </div>

                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      data-testid="button-confirm-plan"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          Confirm My Plan — {displayPrice}{periodLabel}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>

                    <div className="flex items-center justify-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-white/30" />
                      <p className="text-xs text-white/30">Payments processed securely by Stripe</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="md:col-span-2">
              <Card className="glass-card sticky top-8">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <Badge className="bg-[#00c8ff]/20 text-[#00c8ff]">{planDetails.name}</Badge>
                    <Badge variant="outline" className="text-white/60 border-white/20">
                      {isAnnual ? "Annual" : "Monthly"}
                    </Badge>
                  </div>
                  <CardTitle className="text-3xl font-bold text-white">
                    {displayPrice}<span className="text-lg text-white/60 font-normal">{periodLabel}</span>
                  </CardTitle>
                  {isAnnual && (
                    <p className="text-sm text-white/50 mt-1">{planDetails.annualEquiv}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {planDetails.features.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-[#00c8ff] mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-white/80">{f}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <div className="flex flex-wrap justify-between gap-1 text-sm">
                      <span className="text-white/60">Amount due</span>
                      <span className="font-medium text-white">{displayPrice}</span>
                    </div>
                    <p className="text-xs text-white/40">
                      Next renewal: {getRenewalDate(interval)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
