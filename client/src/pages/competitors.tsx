import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import {
  PageShell,
  SectionHeader,
  DataBadge,
  EmptyState,
} from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, TrendingDown, Crosshair, Layers, Loader2, ThumbsUp, ThumbsDown, Lightbulb, Search, Swords, X, AlertTriangle, Shield, MessageCircleWarning, Star, ArrowRight, Plus, Trash2, Settings2, Globe, Lock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { UpgradeGate } from "@/components/ui/UpgradeGate";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import type { VisibilityRun, Brand } from "@shared/schema";
import { chartTooltipStyle, chartColors } from "@/lib/chart-theme";

function AnimatedCounter({ target, suffix = "", delay = 0 }: { target: number; suffix?: string; delay?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 1000;
      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, delay]);
  return <>{value}{suffix}</>;
}

function highlightCompetitors(text: string, competitors: string[]): React.ReactNode[] {
  if (!competitors || competitors.length === 0) return [text];
  const pattern = new RegExp(`(${competitors.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const isMatch = competitors.some((c) => c.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      return (
        <mark key={i} className="bg-warning-muted text-warning rounded px-0.5 font-medium not-italic">
          {part}
        </mark>
      );
    }
    return part;
  });
}

function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={chartTooltipStyle} className="px-3 py-2 shadow-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm font-medium" style={{ color: entry.color || "hsl(var(--foreground))" }}>
          {entry.value} {entry.name || "mentions"}
        </p>
      ))}
    </div>
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

function WeaknessReport({ competitorName, data }: { competitorName: string; data: any }) {
  const displayName = competitorName.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  return (
    <div className="space-y-5" data-testid={`weakness-report-${displayName}`}>
      <div className="border border-border rounded-md p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <span className="text-sm font-semibold text-foreground" data-testid={`text-weakness-name-${displayName}`}>{displayName}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {data.overallSentiment && (
              <DataBadge variant={data.overallSentiment === "negative" ? "missing" : data.overallSentiment === "mixed" ? "warning" : "success"} data-testid={`badge-sentiment-${displayName}`}>
                {data.overallSentiment} sentiment
              </DataBadge>
            )}
            {data.reviewScore && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-review-score-${displayName}`}>
                <Star className="w-3 h-3 text-amber-400" />
                {data.reviewScore}
              </div>
            )}
          </div>
        </div>
        {data.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-weakness-summary-${displayName}`}>{data.summary}</p>
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
                data-testid={`card-complaint-${displayName}-${i}`}
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
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exploitable Vulnerabilities</span>
          </div>
          <div className="space-y-1.5">
            {data.vulnerabilities.map((v: string, i: number) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-primary/5 border border-primary/10" data-testid={`text-vulnerability-${displayName}-${i}`}>
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
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-warning-muted/50" data-testid={`text-churn-${displayName}-${i}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                <p className="text-sm text-foreground/90 leading-relaxed">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

interface CompetitorResult {
  name: string;
  domain: string;
  description: string;
}

function ManageCompetitors({ brand, open, onOpenChange }: { brand: Brand; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [showAddInput, setShowAddInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: billingData } = useQuery<{ subscription: { plan: string } | null; planConfig?: { limits: { competitors: number | null } } }>({
    queryKey: ["/api/billing/subscription"],
  });

  const currentPlan = billingData?.subscription?.plan || "starter";
  const competitorLimit = billingData?.planConfig?.limits?.competitors ?? null;
  const atCompetitorLimit = competitorLimit !== null && competitors.length >= competitorLimit;

  useEffect(() => {
    if (open && brand?.competitors) {
      setCompetitors([...(brand.competitors as string[])]);
      setShowAddInput(false);
      setManualUrl("");
    }
  }, [open, brand?.competitors]);

  const researchMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/brands/research-competitor-url", {
        url,
        brandName: brand.domain,
        category: brand.category,
      });
      return res.json() as Promise<CompetitorResult>;
    },
    onSuccess: (data: CompetitorResult) => {
      const normalise = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
      const isDuplicate = competitors.some((c) => normalise(c) === normalise(data.domain));
      if (isDuplicate) {
        toast({ title: "Already listed", description: `${data.name} is already in your competitor list.` });
        return;
      }
      setCompetitors((prev) => [...prev, data.domain]);
      setManualUrl("");
      setShowAddInput(false);
      toast({ title: "Competitor added", description: `${data.name} (${data.domain}) has been added.` });
    },
    onError: (err: Error) => {
      toast({ title: "Research failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedCompetitors: string[]) => {
      const res = await apiRequest("PATCH", `/api/brands/${brand.id}`, { competitors: updatedCompetitors });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brand.id, "visibility-runs"] });
      toast({ title: "Competitors updated", description: "Your competitor list has been saved." });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function handleRemove(domain: string) {
    setCompetitors((prev) => prev.filter((c) => c !== domain));
    setDeleteTarget(null);
    toast({ title: "Competitor removed", description: `${formatDomain(domain)} removed. Click Save to confirm.` });
  }

  function formatDomain(d: string) {
    return d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  }

  const hasChanges = JSON.stringify(competitors) !== JSON.stringify(brand?.competitors || []);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md overflow-y-auto" data-testid="sheet-manage-competitors">
          <SheetHeader>
            <SheetTitle>Manage Competitors</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Add, edit, or remove the competitors tracked against your brand. Changes take effect on the next scan.
              {competitorLimit !== null && (
                <span className="block mt-1 text-xs">
                  {competitors.length} / {competitorLimit} competitors used on your {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan.
                </span>
              )}
            </p>

            <div className="space-y-2">
              {competitors.map((domain) => (
                <Card key={domain} data-testid={`card-managed-competitor-${formatDomain(domain)}`}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium text-foreground truncate">{formatDomain(domain)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(domain)}
                      data-testid={`button-delete-competitor-${formatDomain(domain)}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {competitors.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">No competitors tracked yet. Add one below.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {showAddInput ? (
              <Card>
                <CardContent className="pt-4 pb-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">Add a competitor by URL</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="e.g. hubspot.com or https://competitor.com"
                      disabled={researchMutation.isPending}
                      data-testid="input-manage-competitor-url"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualUrl.trim()) {
                          e.preventDefault();
                          researchMutation.mutate(manualUrl.trim());
                        }
                      }}
                    />
                    <Button
                      onClick={() => researchMutation.mutate(manualUrl.trim())}
                      disabled={!manualUrl.trim() || researchMutation.isPending}
                      data-testid="button-research-manage-competitor"
                    >
                      {researchMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-1.5" />
                          Research
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter a website URL and our AI will research the company for you.
                  </p>
                  {!researchMutation.isPending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowAddInput(false); setManualUrl(""); }}
                      data-testid="button-cancel-manage-add"
                    >
                      Cancel
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : atCompetitorLimit ? (
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "All competitor slots in use",
                      description: `Your plan includes ${competitorLimit} competitor slots. Add a Competitor Pack or upgrade for more.`,
                    });
                  }}
                  data-testid="button-show-add-competitor"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Add competitor
                  <span className="text-xs text-muted-foreground ml-1.5">Upgrade</span>
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddInput(true)}
                data-testid="button-show-add-competitor"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add competitor
              </Button>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-manage-competitors"
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate(competitors)}
                disabled={!hasChanges || saveMutation.isPending}
                data-testid="button-save-competitors"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Competitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteTarget ? formatDomain(deleteTarget) : ""} from your tracked competitors? This won't delete any historical data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-competitor">
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleRemove(deleteTarget)} data-testid="button-confirm-delete-competitor">
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Competitors() {
  return (
    <UpgradeGate feature="competitorMap" featureLabel="Competitor AI Positioning Map">
      <CompetitorsInner />
    </UpgradeGate>
  );
}

function CompetitorsInner() {
  const { user } = useAuth();
  const [manageOpen, setManageOpen] = useState(false);

  const { activeBrand: brand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();

  const { data: runs, isLoading: runsLoading } = useQuery<VisibilityRun[]>({
    queryKey: ["/api/brands", brandId, "visibility-runs"],
    enabled: !!brandId,
  });

  const isLoading = brandsLoading || runsLoading;

  const allRuns = runs ?? [];

  const missedRuns = useMemo(() => allRuns.filter((run) => {
    if (run.appeared) return false;
    const mentioned = run.competitorsMentioned as string[];
    return Array.isArray(mentioned) && mentioned.length > 0;
  }), [allRuns]);

  const competitorStats = useMemo(() => {
    const stats: Record<string, number> = {};
    const normalise = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const brandComps = (brand?.competitors as string[] | undefined) ?? [];
    brandComps.forEach((domain) => {
      const name = normalise(domain);
      if (name && !stats[name]) stats[name] = 0;
    });
    missedRuns.forEach((run) => {
      const mentioned = run.competitorsMentioned as string[];
      mentioned.forEach((name) => {
        stats[name] = (stats[name] ?? 0) + 1;
      });
    });
    return stats;
  }, [missedRuns, brand?.competitors]);

  const sortedCompetitors = useMemo(
    () => Object.entries(competitorStats).sort((a, b) => b[1] - a[1]),
    [competitorStats]
  );

  const competitorByModel = useMemo(() => {
    const byModel: Record<string, Record<string, number>> = {};
    missedRuns.forEach((run) => {
      const mentioned = run.competitorsMentioned as string[];
      const model = run.modelId;
      if (!byModel[model]) byModel[model] = {};
      mentioned.forEach((name) => {
        byModel[model][name] = (byModel[model][name] ?? 0) + 1;
      });
    });
    return byModel;
  }, [missedRuns]);

  const competitorByPromptType = useMemo(() => {
    const byType: Record<string, Record<string, number>> = {};
    missedRuns.forEach((run) => {
      const mentioned = run.competitorsMentioned as string[];
      const pType = run.promptType;
      if (!byType[pType]) byType[pType] = {};
      mentioned.forEach((name) => {
        byType[pType][name] = (byType[pType][name] ?? 0) + 1;
      });
    });
    return byType;
  }, [missedRuns]);

  const radarData = useMemo(() => {
    const topComps = sortedCompetitors.map(([name]) => name);
    const promptTypes = ["awareness", "consideration", "commercial"];
    const labels: Record<string, string> = {
      awareness: "Awareness",
      consideration: "Consideration",
      commercial: "Commercial",
    };
    return promptTypes.map((pt) => {
      const row: Record<string, any> = { subject: labels[pt] || pt };
      topComps.forEach((comp) => {
        row[comp] = competitorByPromptType[pt]?.[comp] ?? 0;
      });
      return row;
    });
  }, [sortedCompetitors, competitorByPromptType]);

  const barChartData = useMemo(() => {
    return sortedCompetitors.map(([name, count]) => ({
      name: name.length > 16 ? name.slice(0, 14) + "..." : name,
      fullName: name,
      mentions: count,
    }));
  }, [sortedCompetitors]);

  const modelDistribution = useMemo(() => {
    const modelLabels: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", gemini: "Gemini", perplexity: "Perplexity" };
    return Object.entries(competitorByModel).map(([model, comps]) => ({
      name: modelLabels[model] || model,
      value: Object.values(comps).reduce((a, b) => a + b, 0),
    }));
  }, [competitorByModel]);

  const sentimentBreakdown = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    missedRuns.forEach((r) => {
      if (r.sentiment === "positive") counts.positive++;
      else if (r.sentiment === "negative") counts.negative++;
      else counts.neutral++;
    });
    return [
      { name: "Positive", value: counts.positive, color: "#10b981" },
      { name: "Neutral", value: counts.neutral, color: "#64748b" },
      { name: "Negative", value: counts.negative, color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [missedRuns]);

  const [showCount, setShowCount] = useState(5);
  const [detailsTab, setDetailsTab] = useState<"missed" | "weakness">("missed");
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [competitorAnalysis, setCompetitorAnalysis] = useState<any | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisFailure, setAnalysisFailure] = useState<{ message: string; quotaExhausted: boolean } | null>(null);

  const [selectedWeaknessCompetitor, setSelectedWeaknessCompetitor] = useState<string | null>(null);
  const [weaknessData, setWeaknessData] = useState<Record<string, any>>({});
  const [weaknessLoading, setWeaknessLoading] = useState<string | null>(null);
  const [weaknessFailure, setWeaknessFailure] = useState<{
    competitorName: string;
    message: string;
    quotaExhausted: boolean;
  } | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, any>>({});
  const weaknessRequestId = useRef(0);
  const analysisRequestId = useRef(0);

  const { data: cachedWeakness, isLoading: weaknessCacheLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/brands", brandId, "ai-cache", "competitor_weakness"],
    enabled: !!brandId,
    staleTime: 30 * 60 * 1000,
  });

  const { data: cachedAnalysis, isLoading: analysisCacheLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/brands", brandId, "ai-cache", "competitor_analysis"],
    enabled: !!brandId,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (cachedWeakness && Object.keys(cachedWeakness).length > 0) {
      setWeaknessData(prev => {
        const merged = { ...prev };
        for (const [key, val] of Object.entries(cachedWeakness)) {
          if (!merged[key]) merged[key] = val;
        }
        return merged;
      });
    }
  }, [cachedWeakness]);

  useEffect(() => {
    if (cachedAnalysis && Object.keys(cachedAnalysis).length > 0) {
      setAnalysisCache(cachedAnalysis);
    }
  }, [cachedAnalysis]);

  const allCompetitorNames = useMemo(() => {
    const fromRuns = sortedCompetitors.map(([name]) => name);
    const fromBrand = (brand?.competitors as string[] | undefined) ?? [];
    const normalise = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of fromRuns) {
      const key = normalise(name).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(name);
      }
    }
    for (const domain of fromBrand) {
      const key = normalise(domain).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(normalise(domain));
      }
    }
    return result;
  }, [sortedCompetitors, brand?.competitors]);

  async function fetchWeaknessAnalysis(competitorName: string, forceRefresh = false) {
    const requestId = ++weaknessRequestId.current;
    setSelectedWeaknessCompetitor(competitorName);
    setWeaknessFailure(null);

    if (!forceRefresh && weaknessData[competitorName]) {
      setWeaknessLoading(null);
      return;
    }

    const cacheKey = competitorName.toLowerCase().trim();
    if (!forceRefresh && cachedWeakness?.[cacheKey]) {
      setWeaknessData((prev) => ({ ...prev, [competitorName]: cachedWeakness[cacheKey] }));
      setWeaknessLoading(null);
      return;
    }

    setWeaknessLoading(competitorName);

    try {
      const res = await apiRequest("POST", "/api/ai/competitor-weakness", {
        competitorName,
        competitorDomain: competitorName,
        brandName: brand?.domain || "",
        brandCategory: brand?.category || "",
        brandId,
        refresh: forceRefresh,
      });
      const data = await res.json();
      setWeaknessData((prev) => ({ ...prev, [competitorName]: data }));
    } catch (error) {
      if (requestId === weaknessRequestId.current) {
        setWeaknessFailure({
          competitorName,
          message: getApiErrorMessage(error, "Could not retrieve weakness analysis."),
          quotaExhausted: isAiUsageCapError(error),
        });
      }
    } finally {
      if (requestId === weaknessRequestId.current) setWeaknessLoading(null);
    }
  }

  async function fetchCompetitorAnalysis(competitorName: string, forceRefresh = false) {
    const requestId = ++analysisRequestId.current;
    setSelectedCompetitor(competitorName);
    setAnalysisFailure(null);

    if (!forceRefresh) {
      const cacheKey = competitorName.toLowerCase().trim();
      if (analysisCache[cacheKey]) {
        setCompetitorAnalysis(analysisCache[cacheKey]);
        setAnalysisLoading(false);
        return;
      }
      if (cachedAnalysis?.[cacheKey]) {
        setCompetitorAnalysis(cachedAnalysis[cacheKey]);
        setAnalysisCache(prev => ({ ...prev, [cacheKey]: cachedAnalysis[cacheKey] }));
        setAnalysisLoading(false);
        return;
      }
    }

    setCompetitorAnalysis(null);
    setAnalysisLoading(true);

    const promptsForComp = missedRuns
      .filter((r) => (r.competitorsMentioned as string[]).some((c) => c.toLowerCase() === competitorName.toLowerCase()))
      .map((r) => r.promptText)
      .slice(0, 5);

    try {
      const res = await apiRequest("POST", "/api/ai/competitor-analysis", {
        competitorName,
        brandName: brand?.domain || "",
        brandCategory: brand?.category || "",
        missedPrompts: promptsForComp,
        brandId,
        refresh: forceRefresh,
      });
      const data = await res.json();
      setAnalysisCache(prev => ({ ...prev, [competitorName.toLowerCase().trim()]: data }));
      if (requestId === analysisRequestId.current) setCompetitorAnalysis(data);
    } catch (error) {
      if (requestId === analysisRequestId.current) {
        setAnalysisFailure({
          message: getApiErrorMessage(error, "Could not generate analysis."),
          quotaExhausted: isAiUsageCapError(error),
        });
      }
    } finally {
      if (requestId === analysisRequestId.current) setAnalysisLoading(false);
    }
  }

  if (isLoading) {
    return (
      <PageShell
        title="Competitor AI Positioning Map"
        subtitle="See where competitors appear in AI responses without you"
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-64 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell
        title="Competitor AI Positioning Map"
        subtitle="See where competitors appear in AI responses without you"
      >
        <EmptyState
          icon={Users}
          heading="No brand configured"
          description="Set up your brand first to analyse competitor AI positioning."
          action={{ label: "Set Up Your Brand", onClick: () => { window.location.href = "/onboarding"; } }}
        />
      </PageShell>
    );
  }

  if (sortedCompetitors.length === 0 && missedRuns.length === 0) {
    return (
      <PageShell
        title="Competitor AI Positioning Map"
        subtitle="See where competitors appear in AI responses without you"
      >
        <EmptyState
          icon={Users}
          heading="No competitor data yet"
          description={
            allRuns.length === 0
              ? "Run a brand scan to analyse competitor AI positioning."
              : "No competitors configured. Add competitors in Brand Settings to track their AI positioning."
          }
          action={
            allRuns.length === 0
              ? { label: "Run Scan", onClick: () => { window.location.href = "/onboarding"; } }
              : { label: "Brand Settings", onClick: () => { window.location.href = "/brand-settings"; } }
          }
        />
      </PageShell>
    );
  }

  const topCompetitors = sortedCompetitors.map(([name]) => name);
  const totalMissed = missedRuns.length;
  const uniqueCompetitors = sortedCompetitors.length;
  const topThreat = sortedCompetitors[0];
  const threatPct = allRuns.length > 0 ? Math.round((topThreat[1] / allRuns.length) * 100) : 0;

  const promptTypeLabel: Record<string, string> = {
    awareness: "Awareness",
    consideration: "Consideration",
    commercial: "Commercial",
  };
  const modelLabel: Record<string, string> = {
    openai: "ChatGPT",
    anthropic: "Claude",
    gemini: "Gemini",
    perplexity: "Perplexity",
  };

  return (
    <PageShell
      title="Competitor AI Positioning Map"
      subtitle="See where competitors appear in AI responses without you"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setManageOpen(true)}
          data-testid="button-manage-competitors"
        >
          <Settings2 className="w-4 h-4 mr-1.5" />
          Manage Competitors
        </Button>
      }
    >
      {brand && <ManageCompetitors brand={brand} open={manageOpen} onOpenChange={setManageOpen} />}
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="section-competitor-stats">
          <Card className="p-4">
            <CardContent className="p-0 text-center space-y-1">
              <TrendingDown className="h-5 w-5 text-destructive mx-auto" />
              <div className="text-2xl font-bold text-foreground">
                <AnimatedCounter target={totalMissed} delay={0} />
              </div>
              <p className="text-[11px] text-muted-foreground">Missed Prompts</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent className="p-0 text-center space-y-1">
              <Users className="h-5 w-5 text-primary mx-auto" />
              <div className="text-2xl font-bold text-foreground">
                <AnimatedCounter target={uniqueCompetitors} delay={150} />
              </div>
              <p className="text-[11px] text-muted-foreground">Unique Competitors</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent className="p-0 text-center space-y-1">
              <Crosshair className="h-5 w-5 text-warning mx-auto" />
              <div className="text-lg font-bold text-foreground truncate" title={topThreat[0]}>
                {topThreat[0]}
              </div>
              <p className="text-[11px] text-muted-foreground">Top Threat</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent className="p-0 text-center space-y-1">
              <Layers className="h-5 w-5 text-violet-400 mx-auto" />
              <div className="text-2xl font-bold text-foreground">
                <AnimatedCounter target={threatPct} delay={300} suffix="%" />
              </div>
              <p className="text-[11px] text-muted-foreground">Threat Coverage</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card data-testid="chart-competitor-frequency">
            <CardContent className="p-5">
              <SectionHeader
                title="Competitor Frequency"
                subtitle="Click any competitor to get an AI intelligence briefing"
                className="mb-4"
              />
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(260, barChartData.length * 44)}>
                  <BarChart
                    data={barChartData}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
                    onClick={(state) => {
                      if (state?.activePayload?.[0]?.payload?.fullName) {
                        fetchCompetitorAnalysis(state.activePayload[0].payload.fullName);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={110} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="mentions" radius={[0, 4, 4, 0]} animationDuration={1200} animationEasing="ease-out" className="cursor-pointer">
                      {barChartData.map((_, idx) => (
                        <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="chart-competitor-radar">
            <CardContent className="p-5">
              <SectionHeader
                title="Funnel Stage Coverage"
                subtitle="Where competitors dominate across the customer journey"
                className="mb-4"
              />
              {radarData.length > 0 && topCompetitors.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    {topCompetitors.map((comp, idx) => (
                      <Radar
                        key={comp}
                        name={comp}
                        dataKey={comp}
                        stroke={chartColors[idx % chartColors.length]}
                        fill={chartColors[idx % chartColors.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        animationDuration={1400}
                        animationEasing="ease-out"
                      />
                    ))}
                    <Tooltip content={<CustomChartTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              )}
              <div className="flex items-center justify-center gap-3 flex-wrap mt-2">
                {topCompetitors.map((comp, idx) => (
                  <div key={comp} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColors[idx % chartColors.length] }} />
                    {comp}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="chart-model-distribution">
            <CardContent className="p-5">
              <SectionHeader
                title="By AI Model"
                subtitle="Which models surface competitors most"
                className="mb-4"
              />
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={modelDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      animationDuration={1200}
                      animationEasing="ease-out"
                      strokeWidth={0}
                    >
                      {modelDistribution.map((_, idx) => (
                        <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {modelDistribution.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: chartColors[idx % chartColors.length] }} />
                    {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="chart-sentiment-distribution">
            <CardContent className="p-5">
              <SectionHeader
                title="Response Sentiment"
                subtitle="Sentiment of AI responses where competitors appear"
                className="mb-4"
              />
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sentimentBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      animationDuration={1200}
                      animationEasing="ease-out"
                      strokeWidth={0}
                    >
                      {sentimentBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {sentimentBreakdown.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card id="weaknesses">
          <CardContent className="p-5">
            <SectionHeader
              title="Competitive Intelligence"
              subtitle="Missed prompts and competitor weakness analysis"
              className="mb-4"
            />

            <div className="flex items-center gap-1 border-b border-border mb-4" data-testid="tabs-competitor-details">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  detailsTab === "missed"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
                onClick={() => setDetailsTab("missed")}
                data-testid="tab-missed-prompts"
              >
                <Crosshair className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Missed Prompts
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  detailsTab === "weakness"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
                onClick={() => setDetailsTab("weakness")}
                data-testid="tab-competitor-weakness"
              >
                <AlertTriangle className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Competitor Weakness
              </button>
            </div>

            {detailsTab === "missed" && (
              <>
                <p className="text-xs text-muted-foreground mb-3">{totalMissed} prompts where competitors appear without you</p>
                <div className="space-y-3">
                  {missedRuns.slice(0, showCount).map((run) => {
                    const mentioned = run.competitorsMentioned as string[];
                    const snippet = run.rawResponse ? run.rawResponse.slice(0, 300) : null;

                    return (
                      <div
                        key={run.id}
                        className="border border-border rounded-md p-4 space-y-3"
                        data-testid={`card-competitor-run-${run.id}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <p className="text-body text-foreground font-medium" data-testid={`text-prompt-${run.id}`}>
                              {run.promptText}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <DataBadge variant="neutral" data-testid={`badge-prompt-type-${run.id}`}>
                                {promptTypeLabel[run.promptType] ?? run.promptType}
                              </DataBadge>
                              <DataBadge variant="neutral" data-testid={`badge-model-${run.id}`}>
                                {modelLabel[run.modelId] ?? run.modelId}
                              </DataBadge>
                              <DataBadge variant="missing" data-testid={`badge-not-appeared-${run.id}`}>
                                Not appeared
                              </DataBadge>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 shrink-0" data-testid={`competitors-mentioned-${run.id}`}>
                            {mentioned.map((competitor) => (
                              <button
                                key={competitor}
                                onClick={() => fetchCompetitorAnalysis(competitor)}
                                className="cursor-pointer"
                                data-testid={`badge-competitor-${run.id}-${competitor}`}
                              >
                                <DataBadge variant="warning">
                                  {competitor}
                                </DataBadge>
                              </button>
                            ))}
                          </div>
                        </div>

                        {snippet && (
                          <div className="bg-muted/50 rounded-md p-3 text-body text-muted-foreground leading-relaxed" data-testid={`snippet-${run.id}`}>
                            {highlightCompetitors(snippet, mentioned)}
                            {run.rawResponse && run.rawResponse.length > 300 && (
                              <span className="text-xs text-muted-foreground ml-1 italic">...</span>
                            )}
                          </div>
                        )}

                        {mentioned.length > 0 && (
                          <div className="border-t border-border pt-3" data-testid={`why-appeared-${run.id}`}>
                            <p className="text-label text-muted-foreground mb-1">Why they appeared</p>
                            <p className="text-body text-muted-foreground">
                              {run.sentiment === "positive"
                                ? `AI models appear to associate ${mentioned.join(", ")} positively with this type of query. They may have stronger topical authority, more structured content, or greater citation presence for this prompt category.`
                                : `${mentioned.join(", ")} ${mentioned.length === 1 ? "was" : "were"} referenced in AI responses for this prompt. Consider creating targeted content addressing "${run.promptText}" to improve your inclusion in future responses.`}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {missedRuns.length > showCount && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCount((c) => c + 10)}
                      data-testid="button-show-more-competitors"
                    >
                      Show more ({missedRuns.length - showCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}

            {detailsTab === "weakness" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Select a competitor to research their known issues, negative reviews, and vulnerabilities using AI-powered analysis.
                </p>

                <div className="flex flex-wrap gap-2" data-testid="weakness-competitor-selector">
                  {allCompetitorNames.map((name) => (
                    <Button
                      key={name}
                      variant={selectedWeaknessCompetitor === name ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedWeaknessCompetitor(name);
                        setWeaknessFailure(null);
                        if (!weaknessData[name] && weaknessLoading !== name && !weaknessCacheLoading) {
                          fetchWeaknessAnalysis(name);
                        }
                      }}
                      disabled={weaknessLoading === name || weaknessCacheLoading}
                      data-testid={`button-weakness-${name}`}
                    >
                      {weaknessLoading === name && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                      {name}
                    </Button>
                  ))}
                </div>

                {allCompetitorNames.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    No competitors detected in AI responses yet.
                  </div>
                )}

                {weaknessLoading && (
                  <div className="flex flex-col items-center justify-center gap-3 py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Researching known issues for {weaknessLoading}...</p>
                    <p className="text-xs text-muted-foreground">Searching reviews, forums, and public feedback</p>
                  </div>
                )}

                {weaknessFailure && weaknessFailure.competitorName === selectedWeaknessCompetitor && !weaknessLoading && (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <div className="space-y-1 text-center">
                      <p className="text-sm font-medium text-foreground">
                        {weaknessFailure.quotaExhausted ? "AI allowance reached" : "Analysis failed"}
                      </p>
                      <p className="text-sm text-muted-foreground">{weaknessFailure.message}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchWeaknessAnalysis(weaknessFailure.competitorName)}
                      data-testid="button-retry-weakness"
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {selectedWeaknessCompetitor && weaknessData[selectedWeaknessCompetitor] && !weaknessLoading && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {weaknessData[selectedWeaknessCompetitor]?.cachedAt && (
                        <span className="text-xs text-muted-foreground" data-testid="text-weakness-cached-at">
                          Last analysed {formatDistanceToNow(new Date(weaknessData[selectedWeaknessCompetitor].cachedAt), { addSuffix: true })}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchWeaknessAnalysis(selectedWeaknessCompetitor!, true)}
                        data-testid="button-refresh-weakness"
                      >
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                        Refresh
                      </Button>
                    </div>
                    <WeaknessReport
                      competitorName={selectedWeaknessCompetitor}
                      data={weaknessData[selectedWeaknessCompetitor]}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selectedCompetitor} onOpenChange={(open) => { if (!open) setSelectedCompetitor(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-warning" />
              <span>{selectedCompetitor}</span>
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              AI-powered competitive intelligence briefing
            </p>
          </SheetHeader>

          {analysisLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Researching {selectedCompetitor}...</p>
            </div>
          )}

          {analysisFailure && !analysisLoading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium text-foreground">
                  {analysisFailure.quotaExhausted ? "AI allowance reached" : "Analysis failed"}
                </p>
                <p className="text-sm text-muted-foreground">{analysisFailure.message}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedCompetitor && fetchCompetitorAnalysis(selectedCompetitor)}
                data-testid="button-retry-competitor-analysis"
              >
                Retry
              </Button>
            </div>
          )}

          {competitorAnalysis && !analysisLoading && (
            <div className="space-y-6 pb-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {competitorAnalysis.cachedAt && (
                  <span className="text-xs text-muted-foreground" data-testid="text-analysis-cached-at">
                    Last analysed {formatDistanceToNow(new Date(competitorAnalysis.cachedAt), { addSuffix: true })}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedCompetitor && fetchCompetitorAnalysis(selectedCompetitor, true)}
                  data-testid="button-refresh-analysis"
                >
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                  Refresh
                </Button>
              </div>
              {competitorAnalysis.overview && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overview</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed" data-testid="text-competitor-overview">
                    {competitorAnalysis.overview}
                  </p>
                </div>
              )}

              {competitorAnalysis.strengths?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="w-3.5 h-3.5 text-success shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Their Strengths</span>
                  </div>
                  <div className="space-y-1.5">
                    {competitorAnalysis.strengths.map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-success-muted/50">
                        <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 shrink-0" />
                        <p className="text-sm text-foreground/90 leading-relaxed" data-testid={`text-competitor-strength-${i}`}>{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {competitorAnalysis.weaknesses?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weaknesses to Exploit</span>
                  </div>
                  <div className="space-y-1.5">
                    {competitorAnalysis.weaknesses.map((w: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-destructive/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                        <p className="text-sm text-foreground/90 leading-relaxed" data-testid={`text-competitor-weakness-${i}`}>{w}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {competitorAnalysis.whyAiPrefersThem && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-warning shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why AI prefers them</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed" data-testid="text-competitor-why-ai">
                    {competitorAnalysis.whyAiPrefersThem}
                  </p>
                </div>
              )}

              {competitorAnalysis.howToCompete && (
                <div className="space-y-1.5 p-3 rounded-md border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <Swords className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How to compete</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed" data-testid="text-competitor-how-to-compete">
                    {competitorAnalysis.howToCompete}
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
