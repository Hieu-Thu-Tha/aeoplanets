import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import {
  PageShell,
  SectionHeader,
  EmptyState,
  DataBadge,
} from "@/components/ui/enterprise";
import { UpgradeGate } from "@/components/ui/UpgradeGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  PieChart,
  Pie,
} from "recharts";
import {
  RefreshCw,
  BarChart2,
  AlertTriangle,
  TrendingUp,
  Globe,
  Layers,
  Target,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import type { CoverageGap } from "@shared/schema";

interface TopicCluster {
  topic: string;
  coverage: "strong" | "weak" | "competitor-owned";
  description?: string;
}

interface Recommendation {
  topic: string;
  brand: string;
  competitors: Record<string, string>;
  gapSeverity: "high" | "medium" | "low";
  recommendedAction: string;
}

function coverageColor(coverage: string): string {
  if (coverage === "strong") return "hsl(142 76% 36%)";
  if (coverage === "weak") return "hsl(0 84% 55%)";
  return "hsl(215 20% 55%)";
}

function coverageLabel(coverage: string): string {
  if (coverage === "strong") return "Strong";
  if (coverage === "weak") return "Weak";
  return "Competitor-owned";
}

function severityVariant(severity: string): "missing" | "warning" | "neutral" {
  if (severity === "high") return "missing";
  if (severity === "medium") return "warning";
  return "neutral";
}

function brandStatusVariant(status: string): "appeared" | "missing" | "warning" {
  if (status === "good") return "appeared";
  if (status === "partial") return "warning";
  return "missing";
}

function brandStatusLabel(status: string): string {
  if (status === "good") return "Good coverage";
  if (status === "partial") return "Partial";
  return "Not covered";
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-md p-3 text-sm shadow-md max-w-xs">
        <p className="font-medium text-foreground">{d.topic}</p>
        <p className="text-muted-foreground capitalize mt-1">
          Coverage: {coverageLabel(d.coverage)}
        </p>
        {d.description && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{d.description}</p>
        )}
      </div>
    );
  }
  return null;
};

export default function Coverage() {
  return (
    <UpgradeGate feature="coverageGap" featureLabel="Semantic Coverage Gap Analysis">
      <CoverageInner />
    </UpgradeGate>
  );
}

function CoverageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStartedAt, setRefreshStartedAt] = useState<string | null>(null);

  const { activeBrand: brand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();

  const brandDomain = brand?.domain
    ? brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : "Your brand";
  const competitors: string[] = (brand?.competitors || []).map((c: string) =>
    c.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  );

  const { data: coverageData, isLoading: coverageLoading } = useQuery<CoverageGap>({
    queryKey: ["/api/brands", brandId, "coverage-gaps"],
    enabled: !!brandId,
    refetchInterval: isRefreshing ? 3000 : false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/brands/${brandId}/refresh-coverage`),
    onSuccess: () => {
      toast({ title: "Coverage analysis started", description: "Scanning your brand against competitors. This takes 10-20 seconds." });
      setRefreshStartedAt(coverageData?.lastUpdated ? String(coverageData.lastUpdated) : "none");
      setIsRefreshing(true);
    },
    onError: (error: unknown) => {
      toast({
        title: isAiUsageCapError(error) ? "AI allowance reached" : "Refresh failed",
        description: getApiErrorMessage(error, "Could not start coverage analysis."),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isRefreshing && coverageData?.lastUpdated && refreshStartedAt) {
      const currentTimestamp = String(coverageData.lastUpdated);
      if (currentTimestamp !== refreshStartedAt) {
        setIsRefreshing(false);
        setRefreshStartedAt(null);
        toast({ title: "Analysis complete", description: "Coverage data has been updated." });
      }
    }
  }, [coverageData, isRefreshing, refreshStartedAt]);

  const isLoading = brandsLoading || coverageLoading;

  const topicClusters: TopicCluster[] = Array.isArray((coverageData as any)?.topicClusters)
    ? (coverageData as any).topicClusters
    : [];

  const missingTopics: string[] = Array.isArray((coverageData as any)?.missingTopics)
    ? (coverageData as any).missingTopics
    : [];

  const competitorCoverage: Record<string, string[]> = (coverageData as any)?.competitorCoverage || {};

  const recommendations: Recommendation[] = Array.isArray((coverageData as any)?.recommendations)
    ? (coverageData as any).recommendations
    : [];

  const strongCount = topicClusters.filter(c => c.coverage === "strong").length;
  const weakCount = topicClusters.filter(c => c.coverage === "weak").length;
  const competitorOwnedCount = topicClusters.filter(c => c.coverage === "competitor-owned").length;
  const highSeverityCount = recommendations.filter(r => r.gapSeverity === "high").length;

  const scatterData = topicClusters.map((cluster, i) => {
    const coverageScore = cluster.coverage === "strong" ? 80 : cluster.coverage === "weak" ? 40 : 20;
    const angle = (i / topicClusters.length) * 2 * Math.PI;
    const radius = cluster.coverage === "strong" ? 25 : cluster.coverage === "weak" ? 45 : 65;
    return {
      ...cluster,
      x: 50 + radius * Math.cos(angle) + (Math.random() * 10 - 5),
      y: 50 + radius * Math.sin(angle) + (Math.random() * 10 - 5),
      z: coverageScore,
    };
  });

  const pieData = [
    { name: "Strong", value: strongCount, fill: "hsl(142 76% 36%)" },
    { name: "Weak", value: weakCount, fill: "hsl(0 84% 55%)" },
    { name: "Competitor-owned", value: competitorOwnedCount, fill: "hsl(215 20% 55%)" },
  ].filter(d => d.value > 0);

  const competitorBarData = Object.entries(competitorCoverage).map(([domain, topics]) => ({
    name: domain,
    topics: topics.length,
  }));

  const hasClusters = topicClusters.length > 0;
  const hasRecommendations = recommendations.length > 0;
  const hasData = coverageData !== null && coverageData !== undefined;

  const actions = (
    <Button
      variant="outline"
      onClick={() => refreshMutation.mutate()}
      disabled={refreshMutation.isPending || isRefreshing || !brandId}
      data-testid="button-refresh-coverage"
    >
      <RefreshCw className={`w-4 h-4 mr-2 ${(refreshMutation.isPending || isRefreshing) ? "animate-spin" : ""}`} />
      {isRefreshing ? "Analysing..." : "Refresh Analysis"}
    </Button>
  );

  if (isLoading) {
    return (
      <PageShell
        title="Semantic Coverage Analysis"
        subtitle="Topic clusters and content gap analysis across AI models"
        actions={actions}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!hasData) {
    return (
      <PageShell
        title="Semantic Coverage Analysis"
        subtitle="Topic clusters and content gap analysis across AI models"
        actions={actions}
      >
        <EmptyState
          icon={BarChart2}
          heading="No coverage data yet"
          description="Click 'Refresh Analysis' to generate your semantic coverage gap analysis. This analyses your brand's topic coverage against competitors using AI."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Semantic Coverage Analysis"
      subtitle="Topic clusters and content gap analysis across AI models"
      actions={actions}
    >
      {coverageData?.lastUpdated && (
        <p className="text-xs text-muted-foreground -mt-2 mb-4" data-testid="text-last-updated">
          Last updated: {new Date(coverageData.lastUpdated).toLocaleString()}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="coverage-summary-metrics">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(142,76%,36%)]/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-[hsl(142,76%,36%)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="metric-strong-count">{strongCount}</p>
                <p className="text-xs text-muted-foreground">Strong topics</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(0,84%,55%)]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-[hsl(0,84%,55%)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="metric-weak-count">{weakCount}</p>
                <p className="text-xs text-muted-foreground">Weak topics</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(215,20%,55%)]/10 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5 text-[hsl(215,20%,55%)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="metric-competitor-owned">{competitorOwnedCount}</p>
                <p className="text-xs text-muted-foreground">Competitor-owned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="metric-high-severity">{highSeverityCount}</p>
                <p className="text-xs text-muted-foreground">High priority gaps</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" data-testid="card-topic-clusters">
          <CardHeader>
            <SectionHeader
              title="Topic Cluster Map"
              subtitle="Visual map of your brand's semantic coverage strength"
            />
          </CardHeader>
          <CardContent>
            {hasClusters ? (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <XAxis type="number" dataKey="x" hide domain={[0, 100]} />
                    <YAxis type="number" dataKey="y" hide domain={[0, 100]} />
                    <ZAxis type="number" dataKey="z" range={[600, 2400]} />
                    <Tooltip content={<ScatterTooltip />} cursor={false} />
                    <Scatter data={scatterData} isAnimationActive={false}>
                      {scatterData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={coverageColor(entry.coverage)}
                          fillOpacity={0.8}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>

                <div className="flex flex-wrap gap-4 mt-4 justify-center">
                  {[
                    { label: "Strong Coverage", color: "bg-[hsl(142,76%,36%)]" },
                    { label: "Weak Coverage", color: "bg-[hsl(0,84%,55%)]" },
                    { label: "Competitor-Owned", color: "bg-[hsl(215,20%,55%)]" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className={`w-3 h-3 rounded-full ${item.color} inline-block`} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No topic cluster data available.
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-coverage-breakdown">
          <CardHeader>
            <SectionHeader
              title="Coverage Breakdown"
              subtitle="Distribution of topic coverage status"
            />
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2 w-full">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: d.fill }} />
                        <span className="text-sm text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {hasClusters && (
        <Card data-testid="card-topic-details">
          <CardHeader>
            <SectionHeader
              title="Topic Coverage Detail"
              subtitle={`${topicClusters.length} topics analysed for ${brandDomain}`}
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead>Coverage Status</TableHead>
                    <TableHead className="min-w-[300px]">Analysis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topicClusters.map((cluster, i) => (
                    <TableRow key={i} data-testid={`row-cluster-${i}`}>
                      <TableCell className="font-medium text-foreground">{cluster.topic}</TableCell>
                      <TableCell>
                        <DataBadge
                          variant={
                            cluster.coverage === "strong" ? "appeared" :
                            cluster.coverage === "weak" ? "warning" : "neutral"
                          }
                          className="capitalize"
                        >
                          {coverageLabel(cluster.coverage)}
                        </DataBadge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cluster.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {hasRecommendations && (
        <Card data-testid="card-gap-table">
          <CardHeader>
            <SectionHeader
              title="Gap Analysis & Recommendations"
              subtitle="Specific topics where competitors outperform your brand, with actions to close each gap"
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead>{brandDomain}</TableHead>
                    {competitors.slice(0, 3).map(c => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                    <TableHead>Severity</TableHead>
                    <TableHead className="min-w-[280px]">Recommended Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recommendations.map((row, i) => (
                    <TableRow key={i} data-testid={`row-gap-${i}`}>
                      <TableCell className="font-medium text-foreground">{row.topic}</TableCell>
                      <TableCell>
                        <DataBadge variant={brandStatusVariant(row.brand)}>
                          {brandStatusLabel(row.brand)}
                        </DataBadge>
                      </TableCell>
                      {competitors.slice(0, 3).map(comp => {
                        const status = row.competitors?.[comp] || "—";
                        return (
                          <TableCell key={comp} className="text-sm text-muted-foreground capitalize">
                            {status}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <DataBadge variant={severityVariant(row.gapSeverity)} className="capitalize">
                          {row.gapSeverity}
                        </DataBadge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.recommendedAction}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {missingTopics.length > 0 && (
        <Card data-testid="card-missing-topics">
          <CardHeader>
            <SectionHeader
              title="Missing Content Topics"
              subtitle="Topics this brand should cover but currently has weak or no AI presence for"
            />
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {missingTopics.map((topic, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 border border-border rounded-md p-3"
                  data-testid={`item-missing-topic-${i}`}
                >
                  <ArrowRight className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{topic}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {competitorBarData.length > 0 && (
        <Card data-testid="card-competitor-coverage">
          <CardHeader>
            <SectionHeader
              title="Competitor Topic Strengths"
              subtitle="Number of strong topics per competitor identified by AI analysis"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={Math.max(200, competitorBarData.length * 50)}>
                  <BarChart data={competitorBarData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value} topics`, "Strong topics"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar dataKey="topics" fill="hsl(215 20% 55%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                {Object.entries(competitorCoverage).map(([domain, topics]) => (
                  <div key={domain}>
                    <h4 className="text-sm font-medium text-foreground mb-2">{domain}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((topic, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
