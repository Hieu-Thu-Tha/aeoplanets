import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import { MarkdownResponse } from "@/components/markdown-response";
import { PageShell, ScoreRing, SectionHeader, DataBadge, EmptyState } from "@/components/ui/enterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Eye, RefreshCw, AlertTriangle, Users, TrendingUp, CheckCircle, ThumbsUp, ThumbsDown, ChevronDown, Loader2, Lightbulb, Info, Target, MessageCircleWarning, Shield, TrendingDown, Star, ArrowRight, Search, Gauge, Monitor, Smartphone, Tag } from "lucide-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Brand, PerceptionProfile } from "@shared/schema";

const scoreLabels = [
  { key: "positioningScore", label: "Positioning Clarity", description: "How clearly AI describes your market position" },
  { key: "authorityScore", label: "Authority Depth", description: "Depth of expertise and credibility AI perceives" },
  { key: "proofScore", label: "Proof Strength", description: "Evidence and testimonials AI associates with you" },
  { key: "differentiationScore", label: "Differentiation Clarity", description: "How uniquely AI distinguishes you from competitors" },
] as const;

function ConfusionMarkerItem({ marker, index, brandName, brandId, cachedExplanation }: { marker: string; index: number; brandName: string; brandId?: number; cachedExplanation?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(cachedExplanation || null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (cachedExplanation && !explanation) {
      setExplanation(cachedExplanation);
    }
  }, [cachedExplanation]);

  async function fetchExplanation() {
    if (isLoading) return;
    if (explanation && !failed) return;
    setIsLoading(true);
    setFailed(false);
    setExplanation(null);
    try {
      const res = await apiRequest("POST", "/api/ai/explain-confusion", {
        marker,
        brandName,
        brandId,
      });
      const data = await res.json();
      setExplanation(data.explanation || "No explanation available.");
    } catch {
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handleToggle(open: boolean) {
    setIsOpen(open);
    if (open && !explanation) {
      fetchExplanation();
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <div
        className={`rounded-md border ${isOpen ? "border-warning/30" : "border-border/50"} bg-card transition-colors`}
        data-testid={`item-confusion-${index}`}
      >
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-start gap-3 p-4 text-left hover-elevate rounded-md"
            data-testid={`button-toggle-confusion-${index}`}
          >
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="flex-1 text-sm text-foreground leading-relaxed">{marker}</p>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t border-border/30 pt-4 ml-4 sm:ml-7 mr-2">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Getting AI review...</span>
              </div>
            ) : failed ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">Could not generate an explanation.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); fetchExplanation(); }}
                  data-testid={`button-retry-confusion-${index}`}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            ) : explanation ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      What this means & what good looks like
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed pl-5.5" data-testid={`text-confusion-explanation-${index}`}>
                    {explanation}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function severityColor(severity: string) {
  if (severity === "high") return "text-red-400";
  if (severity === "medium") return "text-amber-400";
  return "text-slate-400";
}

function severityBg(severity: string) {
  if (severity === "high") return "bg-red-500/10 border-red-500/20";
  if (severity === "medium") return "bg-amber-500/10 border-amber-500/20";
  return "bg-slate-500/10 border-slate-500/20";
}

function BrandWeaknessAnalysis({ brand }: { brand: Brand }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{ message: string; quotaExhausted: boolean } | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const displayName = brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const cacheKey = displayName.toLowerCase().trim();

  const { data: cachedWeakness } = useQuery<Record<string, any>>({
    queryKey: ["/api/brands", brand.id, "ai-cache", "competitor_weakness"],
    enabled: !!brand.id,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (cachedWeakness && !initialLoaded) {
      const cached = cachedWeakness[cacheKey];
      if (cached) {
        setData(cached);
      }
      setInitialLoaded(true);
    }
  }, [cachedWeakness, cacheKey, initialLoaded]);

  async function fetchAnalysis(forceRefresh = false) {
    setLoading(true);
    setFailure(null);
    try {
      const res = await apiRequest("POST", "/api/ai/competitor-weakness", {
        competitorName: displayName,
        competitorDomain: brand.domain,
        brandName: displayName,
        brandCategory: brand.category || "",
        brandId: brand.id,
        refresh: forceRefresh,
      });
      const result = await res.json();
      setData(result);
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brand.id, "ai-cache", "competitor_weakness"] });
    } catch (error) {
      setFailure({
        message: getApiErrorMessage(error, "Failed to analyse brand weaknesses. Please try again."),
        quotaExhausted: isAiUsageCapError(error),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card data-testid="card-brand-weakness">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <SectionHeader
          title="Known Brand Weaknesses"
          subtitle="Real complaints, negative reviews, and vulnerabilities found across review sites"
        />
        {!data && !loading && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAnalysis()}
            data-testid="button-run-brand-weakness"
          >
            <Search className="w-4 h-4 mr-2" />
            Research Weaknesses
          </Button>
        )}
        {data && !loading && (
          <div className="flex items-center gap-3 flex-wrap">
            {data.cachedAt && (
              <span className="text-xs text-muted-foreground" data-testid="text-brand-weakness-cached-at">
                Last analysed {formatDistanceToNow(new Date(data.cachedAt), { addSuffix: true })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAnalysis(true)}
              data-testid="button-refresh-brand-weakness"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!data && !loading && !failure && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <MessageCircleWarning className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Run an AI-powered analysis to discover what real customers are saying about your brand across review platforms, forums, and public feedback.
            </p>
            <Button onClick={() => fetchAnalysis()} data-testid="button-start-brand-weakness">
              <Search className="w-4 h-4 mr-2" />
              Research Brand Weaknesses
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Researching public feedback for {displayName}...</p>
            <p className="text-xs text-muted-foreground">Searching review sites, forums, and public feedback — this can take up to 90 seconds</p>
          </div>
        )}

        {failure && !loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle className="w-6 h-6 text-muted-foreground/50" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-foreground">
                {failure.quotaExhausted ? "AI allowance reached" : "Analysis failed"}
              </p>
              <p className="text-sm text-muted-foreground">{failure.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchAnalysis()} data-testid="button-retry-brand-weakness">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">
            <div className="border border-border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <span className="text-sm font-semibold text-foreground" data-testid="text-brand-weakness-name">{displayName}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {data.overallSentiment && (
                    <DataBadge variant={data.overallSentiment === "negative" ? "missing" : data.overallSentiment === "mixed" ? "warning" : "success"} data-testid="badge-brand-sentiment">
                      {data.overallSentiment} sentiment
                    </DataBadge>
                  )}
                  {data.reviewScore && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-brand-review-score">
                      <Star className="w-3 h-3 text-amber-400" />
                      {data.reviewScore}
                    </div>
                  )}
                </div>
              </div>
              {data.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-brand-weakness-summary">{data.summary}</p>
              )}
            </div>

            {data.complaints?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MessageCircleWarning className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Complaints and Issues</span>
                </div>
                <div className="space-y-2">
                  {[...data.complaints].sort((a: any, b: any) => {
                    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                  }).map((c: any, i: number) => (
                    <div
                      key={i}
                      className={`border rounded-md p-3 space-y-1.5 ${severityBg(c.severity)}`}
                      data-testid={`card-brand-complaint-${i}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold uppercase ${severityColor(c.severity)}`}>{c.severity}</span>
                          <span className="text-sm font-medium text-foreground">{c.category}</span>
                        </div>
                        {c.source && (
                          <span className="text-[10px] text-muted-foreground">{c.source}</span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed">{c.detail}</p>
                      {c.frequency && (
                        <p className="text-xs text-muted-foreground">{c.frequency}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.vulnerabilities?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vulnerabilities to Address</span>
                </div>
                <div className="space-y-1.5">
                  {data.vulnerabilities.map((v: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-primary/5 border border-primary/10" data-testid={`text-brand-vulnerability-${i}`}>
                      <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm text-foreground/90 leading-relaxed">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.customerChurnReasons?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why Customers Leave</span>
                </div>
                <div className="space-y-1.5">
                  {data.customerChurnReasons.map((reason: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-warning-muted/50" data-testid={`text-brand-churn-${i}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                      <p className="text-sm text-foreground/90 leading-relaxed">{reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfusionMarkersSection({ markers, brandName, brandId }: { markers: string[]; brandName: string; brandId?: number }) {
  const { data: cachedExplanations } = useQuery<Record<string, any>>({
    queryKey: ["/api/brands", brandId, "ai-cache", "confusion_explanation"],
    queryFn: () => fetch(`/api/brands/${brandId}/ai-cache/confusion_explanation`).then(r => r.json()),
    enabled: !!brandId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card data-testid="card-confusion-markers">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <SectionHeader
          title="Confusion Markers"
          subtitle="Click any marker to get an AI review of what it means and what good looks like"
        />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {markers.map((marker, i) => {
            const cached = cachedExplanations?.[marker]?.explanation;
            return (
              <ConfusionMarkerItem key={i} marker={marker} index={i} brandName={brandName} brandId={brandId} cachedExplanation={cached} />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Perception() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { activeBrand: brand, isLoading: brandsLoading } = useBrand();

  const { data: profile, isLoading: profileLoading } = useQuery<PerceptionProfile | null>({
    queryKey: ["/api/brands", brand?.id, "perception"],
    enabled: !!brand?.id,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/brands/${brand?.id}/refresh-perception`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brand?.id, "perception"] });
    },
    onError: (error: unknown) => {
      toast({
        title: isAiUsageCapError(error) ? "AI allowance reached" : "Refresh failed",
        description: getApiErrorMessage(error, "Could not refresh perception analysis."),
        variant: "destructive",
      });
    },
  });

  const isLoading = brandsLoading || profileLoading;

  if (isLoading) {
    return (
      <PageShell title="AI Perception Mirror" subtitle="How AI models perceive and describe your brand">
        <div className="flex items-center justify-center py-24">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell title="AI Perception Mirror" subtitle="How AI models perceive and describe your brand">
        <EmptyState
          icon={Eye}
          heading="No brand configured"
          description="Set up your brand first to generate your AI perception profile."
          action={{ label: "Set Up Brand", onClick: () => { window.location.href = "/onboarding"; } }}
        />
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell
        title="AI Perception Mirror"
        subtitle="How AI models perceive and describe your brand"
        actions={
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-perception"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Analysing..." : "Generate Analysis"}
          </Button>
        }
      >
        <EmptyState
          icon={Eye}
          heading="No perception data yet"
          description="Run a perception analysis to see how AI models perceive your brand."
        />
      </PageShell>
    );
  }

  const confusionMarkers = profile.confusionMarkers ?? [];
  const strengths = profile.strengths ?? [];
  const weaknesses = profile.weaknesses ?? [];
  const topImprovements = profile.topImprovements ?? [];

  return (
    <PageShell
      title="AI Perception Mirror"
      subtitle="How AI models perceive and describe your brand"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/brand-settings?tab=terms">
            <Button variant="ghost" data-testid="button-manage-terms-perception">
              <Tag className="h-4 w-4 mr-1.5" />
              Manage Terms
            </Button>
          </Link>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            variant="outline"
            data-testid="button-refresh-perception"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Refreshing..." : "Refresh Analysis"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-positioning-summary">
          <CardHeader>
            <CardTitle className="text-heading">AI Positioning Summary</CardTitle>
            <p className="text-body text-muted-foreground">What AI models say about your brand unprompted</p>
          </CardHeader>
          <CardContent>
            <MarkdownResponse
              content={profile.summary || "No summary available yet."}
              testId="text-summary"
              className="text-body text-foreground leading-relaxed"
            />

            {(profile.inferredAudience || profile.marketTier) && (
              <div className="mt-6 space-y-3 pt-4 border-t border-border">
                {profile.inferredAudience && (
                  <div className="flex items-start gap-3" data-testid="text-inferred-audience">
                    <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-label text-muted-foreground">Inferred Audience</p>
                      <p className="text-body text-foreground">{profile.inferredAudience}</p>
                    </div>
                  </div>
                )}
                {profile.marketTier && (
                  <div className="flex items-start gap-3" data-testid="text-market-tier">
                    <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-label text-muted-foreground">Market Tier</p>
                      <p className="text-body text-foreground">{profile.marketTier}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-score-gauges">
          <CardHeader>
            <CardTitle className="text-heading">Perception Scores</CardTitle>
            <p className="text-body text-muted-foreground">Composite scores across all AI models</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {scoreLabels.map(({ key, label, description }) => {
                const value = profile[key] ?? 0;
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center gap-3"
                    data-testid={`score-${key}`}
                  >
                    <ScoreRing value={value} size={100} strokeWidth={8} />
                    <div className="text-center">
                      <p className="text-label text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-strength-signals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <SectionHeader
              title="Strength Signals"
              subtitle="Positive attributes AI consistently associates with your brand"
            />
          </CardHeader>
          <CardContent>
            {strengths.length === 0 ? (
              <p className="text-body text-muted-foreground">No strength signals identified yet.</p>
            ) : (
              <div className="space-y-2">
                {strengths.map((strength, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-md bg-success-muted/50"
                    data-testid={`item-strength-${i}`}
                  >
                    <ThumbsUp className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground leading-relaxed">{strength}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-weakness-signals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <SectionHeader
              title="Weakness Signals"
              subtitle="Areas where AI perception indicates gaps or uncertainty"
            />
          </CardHeader>
          <CardContent>
            {weaknesses.length === 0 ? (
              <p className="text-body text-muted-foreground">No weakness signals identified yet.</p>
            ) : (
              <div className="space-y-2">
                {weaknesses.map((weakness, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-md bg-destructive/10"
                    data-testid={`item-weakness-${i}`}
                  >
                    <ThumbsDown className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground leading-relaxed">{weakness}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div id="weaknesses">
        <BrandWeaknessAnalysis key={brand.id} brand={brand} />
      </div>

      {confusionMarkers.length > 0 && (
        <ConfusionMarkersSection markers={confusionMarkers} brandName={brand.domain} brandId={brand.id} />
      )}

      <Card data-testid="card-top-improvements">
        <CardHeader>
          <SectionHeader
            title="Top 5 Improvements to Increase AI Inclusion"
            subtitle="Actionable steps to improve how AI models represent your brand"
          />
        </CardHeader>
        <CardContent>
          {topImprovements.length === 0 ? (
            <p className="text-body text-muted-foreground">No improvement recommendations available yet.</p>
          ) : (
            <ol className="space-y-4">
              {topImprovements.slice(0, 5).map((improvement, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4"
                  data-testid={`item-improvement-${i}`}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-label font-semibold">
                    {i + 1}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-body text-foreground">{improvement}</p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-1 invisible" aria-hidden />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
