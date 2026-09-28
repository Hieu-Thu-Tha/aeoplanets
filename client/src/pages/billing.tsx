import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, ArrowUpRight, CreditCard, Calendar, Tag, FileText, Bell, Clock, AlertTriangle, ArrowDown, Loader2, Trash2, Users, Globe, Layers, Plus, Minus, X } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { usePageMeta } from "@/hooks/usePageMeta";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageHeading } from "@/components/ui/enterprise";

type Invoice = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  stripeHostedInvoiceUrl?: string | null;
  stripeInvoicePdfUrl?: string | null;
};

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function UsageMeter({ label, icon: Icon, used, limit, unit = "" }: {
  label: string;
  icon: React.ElementType;
  used: number;
  limit: number | null;
  unit?: string;
}) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const atLimit = !isUnlimited && used >= limit;
  const nearLimit = !isUnlimited && pct >= 80;

  return (
    <Card data-testid={`card-usage-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">{label}</p>
            <p className="text-xl font-bold tabular-nums">
              {isUnlimited ? (
                <span className="text-green-400">Unlimited</span>
              ) : (
                <span className={atLimit ? "text-red-400" : nearLimit ? "text-amber-400" : ""}>
                  {used} <span className="text-muted-foreground text-sm font-normal">of {limit}{unit}</span>
                </span>
              )}
            </p>
            {!isUnlimited && (
              <Progress
                value={pct}
                className="mt-2 h-1.5"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge className="bg-green-500/15 text-green-400 border-green-500/20 border">Paid</Badge>;
  if (status === "overdue") return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 border">Overdue</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 border">Pending</Badge>;
}

type Addon = {
  id: number;
  addonType: string;
  quantity: number;
  billingInterval: string;
  monthlyAmount: number;
  annualAmount: number;
  status: string;
  createdAt: string;
};

const ADDON_DISPLAY: Record<string, { name: string; icon: React.ElementType; color: string; description: string }> = {
  extra_user: { name: "Extra User", icon: Layers, color: "text-[#22c55e]", description: "+1 user seat" },
  extra_brand: { name: "Extra Brand", icon: Globe, color: "text-[#00c8ff]", description: "Complete extra brand (topics, prompts, competitors, audits, alerts, PDF)" },
  topic_prompt_pack: { name: "Topic & Prompt Pack", icon: Tag, color: "text-[#a000ff]", description: "+10 topics and +100 prompts" },
  change_alerts_pack: { name: "Change Alerts Pack", icon: Layers, color: "text-[#0095ff]", description: "+50 change alerts and +1 weekly refresh" },
  competitor_pack: { name: "Competitor Pack", icon: Layers, color: "text-[#d946ef]", description: "+5 competitor slots" },
  key_terms_pack: { name: "Key Terms Pack", icon: Tag, color: "text-[#22c55e]", description: "+10 tracked terms (legacy)" },
};

export default function Billing() {
  const [cancelStep, setCancelStep] = useState<"closed" | "offer" | "confirm">("closed");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellingAddonId, setCancellingAddonId] = useState<number | null>(null);
  const [isSwitchingToStarter, setIsSwitchingToStarter] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { billingData, isLoading, refetch: refetchSubscription } = useSubscription();
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
    staleTime: 30000,
  });

  usePageMeta({
    title: "Billing — AEOSTARS",
    description: "Manage your AEOSTARS subscription, usage, and invoices.",
    ogType: "website",
  });

  // Post-checkout polling: when Stripe redirects back to /billing?checkout=success
  // the webhook may not have processed yet, so the local subscription row may
  // briefly still have stripeSubscriptionId === null. Poll the subscription
  // endpoint every 1.5s for up to 30s and stop as soon as the Stripe IDs land.
  // This makes the UI self-healing during normal webhook latency.
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "timeout">("idle");
  const pollAttemptedRef = useRef(false);
  useEffect(() => {
    if (pollAttemptedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const sessionId = params.get("session_id");
    pollAttemptedRef.current = true;
    setConfirmState("confirming");

    if (sessionId) {
      apiRequest("POST", "/api/billing/stripe/confirm-checkout", { sessionId })
        .then(async () => {
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          await refetchSubscription();
        })
        .catch((err) => console.warn("Stripe checkout confirmation is still pending:", err));
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(async () => {
      const result = await refetchSubscription();
      const subId = result.data?.subscription?.stripeSubscriptionId ?? null;
      const subStatus = result.data?.subscription?.status;
      if (subId && subStatus === "active") {
        window.clearInterval(intervalId);
        setConfirmState("idle");
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Subscription active",
          description: "Your plan is now live.",
        });
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      } else if (Date.now() - startedAt > 30_000) {
        window.clearInterval(intervalId);
        setConfirmState("timeout");
      }
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [refetchSubscription, toast]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Loading billing details...</p>
      </div>
    );
  }

  if (!billingData) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No active subscription</h2>
        <p className="text-muted-foreground mb-6">Choose a plan to get started with AEOSTARS.</p>
        <Button asChild>
          <Link href="/select-plan">View Plans</Link>
        </Button>
      </div>
    );
  }

  const { subscription: sub, planConfig, usage } = billingData;
  const limits = planConfig.limits;
  const currentPlan = sub.plan;
  const canDowngrade = currentPlan === "growth";

  const intervalLabel = sub.billingInterval === "annual" ? "Annual" : "Monthly";
  const billedAmount = sub.billingInterval === "annual"
    ? formatPence(sub.annualAmount)
    : formatPence(sub.monthlyAmount);
  const billedPeriod = `${sub.billingInterval === "annual" ? "/ year" : "/ month"}`;

  function handleCancelClick() {
    if (canDowngrade) {
      setCancelStep("offer");
    } else {
      setCancelStep("confirm");
    }
  }

  const hasStripeSub = !!sub.stripeSubscriptionId;
  const cancelAtPeriodEnd = !!sub.cancelAtPeriodEnd;

  async function handleManageBilling() {
    try {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to open billing portal", variant: "destructive" });
    }
  }

  async function handleResumeSubscription() {
    try {
      await apiRequest("POST", "/api/billing/stripe/resume", {});
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      toast({ title: "Subscription resumed", description: "Your subscription will continue at renewal." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to resume subscription", variant: "destructive" });
    }
  }

  async function handleSetAddonQuantity(addonId: number, quantity: number) {
    setCancellingAddonId(addonId);
    try {
      if (hasStripeSub) {
        await apiRequest("POST", `/api/billing/stripe/addons/${addonId}/quantity`, { quantity });
      } else {
        await apiRequest("POST", `/api/billing/addons/${addonId}/quantity`, { quantity });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({
        title: quantity === 0 ? "Add-on removed" : "Add-on quantity updated",
        description: hasStripeSub
          ? "Stripe will prorate the change on your next invoice."
          : "Your add-on has been updated.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to update quantity", variant: "destructive" });
    } finally {
      setCancellingAddonId(null);
    }
  }

  async function handleCancelAddon(addonId: number) {
    setCancellingAddonId(addonId);
    try {
      const path = hasStripeSub
        ? `/api/billing/stripe/addons/${addonId}/cancel`
        : `/api/billing/addons/${addonId}/cancel`;
      await apiRequest("POST", path, {});
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Add-on cancelled", description: "The add-on pack has been removed from your subscription." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to cancel add-on", variant: "destructive" });
    } finally {
      setCancellingAddonId(null);
    }
  }

  async function handleConfirmCancel() {
    setIsCancelling(true);
    try {
      if (hasStripeSub) {
        await apiRequest("POST", "/api/billing/stripe/cancel", {});
        await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
        toast({
          title: "Cancellation scheduled",
          description: `Your subscription will end on ${formatDate(sub.billingPeriodEnd)}. You can resume anytime before then.`,
        });
        setCancelStep("closed");
        return;
      }
      await apiRequest("POST", "/api/billing/cancel", { confirm: true });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
      toast({ title: "Subscription cancelled", description: "Your account data has been removed." });
      setCancelStep("closed");
      navigate("/select-plan");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to cancel subscription", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  }

  if (billingData.isManuallyBilled) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <PageHeading title="Billing" subtitle="Your plan and usage" headingClassName="text-2xl font-bold" subtitleClassName="text-muted-foreground text-sm mt-1" />

        <Card data-testid="card-managed-billing">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge className="bg-[#00c8ff]/15 text-[#00c8ff] border-[#00c8ff]/20 border text-sm px-3 py-0.5">
                {planConfig.displayName}
              </Badge>
              <Badge className="bg-green-500/15 text-green-400 border-green-500/20 border">Active</Badge>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Billed directly by AEOSTARS</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account is managed by your account manager and invoiced outside the app.
                  There's nothing to pay or manage here — reach out to your AEOSTARS contact for any
                  changes to your plan.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-base font-semibold mb-3">Usage This Period</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <UsageMeter label="Key Terms" icon={Tag} used={usage.trackedTerms} limit={limits.trackedTerms} />
            <UsageMeter label="Brand Profiles" icon={Globe} used={usage.brands} limit={limits.brands} />
            <UsageMeter label="Competitors" icon={Users} used={usage.competitors} limit={limits.competitors} />
            <UsageMeter label="Reports" icon={FileText} used={usage.reportsThisMonth} limit={limits.reportsPerMonth} unit=" this month" />
            <UsageMeter label="Alerts" icon={Bell} used={0} limit={limits.alertsPerMonth} unit="/month" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <PageHeading title="Billing" subtitle="Manage your plan, usage, and invoices" headingClassName="text-2xl font-bold" subtitleClassName="text-muted-foreground text-sm mt-1" />

      {confirmState === "confirming" && (
        <Card
          className="border-[#00c8ff]/30 bg-[#00c8ff]/10"
          data-testid="banner-checkout-confirming"
        >
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-[#00c8ff] animate-spin mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Confirming your payment with Stripe…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We've received your payment. Your plan will be live in a few seconds.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {confirmState === "timeout" && (
        <Card
          className="border-amber-500/30 bg-amber-500/5"
          data-testid="banner-checkout-timeout"
        >
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Payment received, but billing sync is pending</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try refreshing in a minute, or contact support if this persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-current-plan">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#00c8ff]/15 text-[#00c8ff] border-[#00c8ff]/20 border text-sm px-3 py-0.5">
                  {planConfig.displayName}
                </Badge>
                <Badge
                  className={
                    sub.status === "active"
                      ? "bg-green-500/15 text-green-400 border-green-500/20 border"
                      : "bg-red-500/15 text-red-400 border-red-500/20 border"
                  }
                >
                  {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  {intervalLabel} billing
                </Badge>
              </div>
              <p className="text-2xl font-bold">
                {billedAmount}
                <span className="text-base text-muted-foreground font-normal ml-1">{billedPeriod}</span>
              </p>
              <p className="text-sm text-muted-foreground flex items-start gap-1.5 flex-wrap">
                <Calendar className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-words">Period: {formatDate(sub.billingPeriodStart)} → {formatDate(sub.billingPeriodEnd)}</span>
              </p>
              {sub.billingInterval === "monthly" && !hasStripeSub && (
                <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Next invoice due {formatDate(sub.billingPeriodEnd)} — our team will send payment details
                </p>
              )}
              {cancelAtPeriodEnd && (
                <p className="text-xs text-amber-400/80 flex items-center gap-1.5" data-testid="text-cancel-scheduled">
                  <AlertTriangle className="h-3 w-3" />
                  Cancellation scheduled for {formatDate(sub.billingPeriodEnd)}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Button size="sm" asChild data-testid="button-upgrade-plan">
                <Link href="/select-plan">
                  {currentPlan === "starter" ? "Upgrade Plan" : "Change Plan"}
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
              {hasStripeSub && (
                <Button size="sm" variant="outline" onClick={handleManageBilling} data-testid="button-manage-billing">
                  Manage billing
                </Button>
              )}
              {cancelAtPeriodEnd ? (
                <button
                  className="text-xs text-[#00c8ff] hover:underline transition-colors"
                  onClick={handleResumeSubscription}
                  data-testid="button-resume-subscription"
                >
                  Resume subscription
                </button>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleCancelClick}
                  data-testid="button-cancel-subscription"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-3">Usage This Period</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card data-testid="card-usage-key-terms">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Key Terms</p>
                  <p className="text-xl font-bold tabular-nums">
                    {limits.trackedTerms === null ? (
                      <span className="text-green-400">Unlimited</span>
                    ) : (
                      <span className={usage.trackedTerms >= limits.trackedTerms ? "text-red-400" : usage.trackedTerms >= limits.trackedTerms * 0.8 ? "text-amber-400" : ""}>
                        {usage.trackedTerms} <span className="text-muted-foreground text-sm font-normal">of {limits.trackedTerms}</span>
                      </span>
                    )}
                  </p>
                  {limits.trackedTerms !== null && (
                    <Progress
                      value={Math.min(100, Math.round((usage.trackedTerms / limits.trackedTerms) * 100))}
                      className="mt-2 h-1.5"
                    />
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground" data-testid="text-key-terms-breakdown">
                    <span>{usage.userQuestions} questions generated</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <UsageMeter
            label="Brand Profiles"
            icon={Globe}
            used={usage.brands}
            limit={limits.brands}
          />
          <UsageMeter
            label="Competitors"
            icon={Users}
            used={usage.competitors}
            limit={limits.competitors}
          />
          <UsageMeter
            label="Reports"
            icon={FileText}
            used={usage.reportsThisMonth}
            limit={limits.reportsPerMonth}
            unit=" this month"
          />
          <UsageMeter
            label="Alerts"
            icon={Bell}
            used={0}
            limit={limits.alertsPerMonth}
            unit="/month"
          />
        </div>
      </div>

      {billingData.addons && billingData.addons.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Active Add-on Packs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {billingData.addons.map((addon: Addon) => {
              const display = ADDON_DISPLAY[addon.addonType] || { name: addon.addonType, icon: Plus, color: "text-muted-foreground", description: "" };
              const Icon = display.icon;
              const amount = addon.billingInterval === "annual"
                ? formatPence(addon.annualAmount)
                : formatPence(addon.monthlyAmount);
              const period = addon.billingInterval === "annual" ? "/year" : "/month";
              return (
                <Card key={addon.id} data-testid={`card-addon-${addon.id}`}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon className={`h-4 w-4 ${display.color}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{display.name}</p>
                          <p className="text-xs text-muted-foreground">{display.description}</p>
                          <p className="text-sm font-semibold mt-1">
                            {amount}<span className="text-xs text-muted-foreground font-normal">{period}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Added {formatDate(addon.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleSetAddonQuantity(addon.id, Math.max(0, (addon.quantity ?? 1) - 1))}
                            disabled={cancellingAddonId === addon.id}
                            data-testid={`button-decrement-addon-${addon.id}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-8 text-center text-sm font-medium" data-testid={`text-addon-quantity-${addon.id}`}>
                            {addon.quantity ?? 1}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleSetAddonQuantity(addon.id, (addon.quantity ?? 1) + 1)}
                            disabled={cancellingAddonId === addon.id}
                            data-testid={`button-increment-addon-${addon.id}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400"
                          onClick={() => handleCancelAddon(addon.id)}
                          disabled={cancellingAddonId === addon.id}
                          data-testid={`button-cancel-addon-${addon.id}`}
                        >
                          {cancellingAddonId === addon.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="mt-3">
            <Button size="sm" variant="outline" asChild data-testid="button-add-more-packs">
              <Link href="/select-plan">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add More Packs
              </Link>
            </Button>
          </div>
        </div>
      )}

      {(!billingData.addons || billingData.addons.length === 0) && (
        <div>
          <h2 className="text-base font-semibold mb-3">Add-on Packs</h2>
          <Card>
            <CardContent className="py-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-3">
                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Need more brands or competitor slots?</p>
              <Button size="sm" variant="outline" asChild data-testid="button-browse-addons">
                <Link href="/select-plan">
                  Browse Add-on Packs
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Invoice History</h2>
        <Card>
          <CardContent className="p-0">
            {invoicesLoading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No invoices yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Invoice #</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Due</th>
                      <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Description</th>
                      <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Amount</th>
                      <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border/50 last:border-0 hover-elevate" data-testid={`row-invoice-${inv.id}`}>
                        <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                        <td className="px-4 py-3 text-foreground max-w-xs truncate">{inv.description}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium">{formatPence(inv.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3">
                          {inv.stripeHostedInvoiceUrl || inv.stripeInvoicePdfUrl ? (
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {inv.stripeHostedInvoiceUrl && (
                                <Button size="sm" variant="ghost" asChild data-testid={`button-view-invoice-${inv.id}`}>
                                  <a href={inv.stripeHostedInvoiceUrl} target="_blank" rel="noreferrer">
                                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                                    View
                                  </a>
                                </Button>
                              )}
                              {inv.stripeInvoicePdfUrl && (
                                <Button size="sm" variant="ghost" asChild data-testid={`button-pdf-invoice-${inv.id}`}>
                                  <a href={inv.stripeInvoicePdfUrl} target="_blank" rel="noreferrer">
                                    <Download className="h-3.5 w-3.5 mr-1.5" />
                                    PDF
                                  </a>
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                              data-testid={`button-download-invoice-${inv.id}`}
                            >
                              <a href={`/api/billing/invoices/${inv.id}/download`} download>
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download
                              </a>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelStep === "offer"} onOpenChange={(open) => !open && setCancelStep("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before you go...</DialogTitle>
            <DialogDescription>
              We'd hate to see you leave. Would you like to switch to a lower plan instead?
            </DialogDescription>
          </DialogHeader>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-foreground">Starter Plan</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sub.billingInterval === "annual" ? "£359.88/year (£29.99/mo)" : "£38.99/month"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>10 key terms (100 prompts) tracked daily</li>
                    <li>1 brand profile, 3 competitors</li>
                    <li>AI Visibility Dashboard + Perception Mirror</li>
                  </ul>
                </div>
                <Badge className="bg-green-500/15 text-green-400 border-green-500/20 border no-default-hover-elevate no-default-active-elevate">
                  Save money
                </Badge>
              </div>
            </CardContent>
          </Card>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              disabled={isSwitchingToStarter}
              onClick={async () => {
                // If the user already has a real Stripe subscription, the
                // downgrade MUST go through Stripe so the proration + invoice
                // happen. Otherwise the existing /checkout flow is fine.
                if (hasStripeSub) {
                  setIsSwitchingToStarter(true);
                  try {
                    await apiRequest("POST", "/api/billing/stripe/change-plan", {
                      plan: "starter",
                      billingInterval: sub.billingInterval,
                    });
                    await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
                    setCancelStep("closed");
                    toast({
                      title: "Switched to Starter",
                      description: "Your plan change has been applied. The next invoice will reflect the new amount.",
                    });
                  } catch (err: any) {
                    toast({
                      title: "Error",
                      description: err?.message ?? "Failed to switch plan",
                      variant: "destructive",
                    });
                  } finally {
                    setIsSwitchingToStarter(false);
                  }
                } else {
                  setCancelStep("closed");
                  navigate(`/checkout?plan=starter&interval=${sub.billingInterval}&upgrade=true`);
                }
              }}
              data-testid="button-downgrade-to-starter"
            >
              {isSwitchingToStarter ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowDown className="mr-2 h-4 w-4" />
              )}
              Switch to Starter
            </Button>
            <Button
              variant="ghost"
              className="w-full text-red-400"
              onClick={() => setCancelStep("confirm")}
              data-testid="button-proceed-cancel"
            >
              I still want to cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelStep === "confirm"} onOpenChange={(open) => !open && setCancelStep("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Cancel subscription and delete data?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                This action is permanent and cannot be undone. The following will be permanently deleted:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>All brand profiles and competitor data</li>
                <li>All tracked key terms</li>
                <li>All AI visibility scan results</li>
                <li>Perception profiles and coverage analyses</li>
                <li>Reports and change alerts</li>
              </ul>
              <p className="font-medium text-foreground">
                Are you sure you want to proceed?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCancelStep("closed")}
              data-testid="button-keep-subscription"
            >
              Keep my subscription
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleConfirmCancel}
              disabled={isCancelling}
              data-testid="button-confirm-cancel"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancel and delete all data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
