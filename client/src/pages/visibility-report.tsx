import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import {
  PageShell,
  SectionHeader,
  FilterBar,
  DataBadge,
  EmptyState,
} from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarkdownResponse } from "@/components/markdown-response";
import { MessageSquare, Building2, ArrowLeft, TrendingUp, Tag, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VisibilityRun, UserQuestion, TrackedTerm } from "@shared/schema";

type GroupedQuestion = {
  questionId: number;
  questionText: string;
  promptType: string;
  trackedTermId: number | null;
  models: Record<string, { appeared: boolean; position: number | null; sentiment: string | null; citationPresent: boolean | null }>;
  overallSentiment: string | null;
  competitors: string[];
  searchVolume: string | null;
  searchVolumeMax: number | null;
};

// Scan engines in report column/card order. Keep in sync with the backend
// runner map (server/llm-runner.ts).
const SCAN_MODELS = [
  { id: "openai", label: "ChatGPT" },
  { id: "anthropic", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
] as const;

export default function VisibilityReport() {
  usePageMeta({
    title: "Visibility Report — AEOSTARS",
    description: "Detailed AI visibility run results across all tracked terms, models, and sentiment analysis.",
  });
  const { user } = useAuth();
  const { activeBrand: brand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();

  const urlTab = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "brand_sentiment" || t === "user_question") return t;
    return null;
  }, []);

  const [promptTypeFilter, setPromptTypeFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("30");
  const [activeTab, setActiveTab] = useState<"user_question" | "brand_sentiment">(urlTab ?? "user_question");
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [expandedTermIds, setExpandedTermIds] = useState<Set<number>>(new Set());
  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (promptTypeFilter !== "all") params.set("promptType", promptTypeFilter);
    if (dateRangeFilter !== "all") {
      const startDate = new Date(Date.now() - parseInt(dateRangeFilter) * 24 * 60 * 60 * 1000);
      params.set("startDate", startDate.toISOString());
    }
    return params.toString();
  }, [promptTypeFilter, dateRangeFilter]);

  const { data: runsRaw, isLoading: runsLoading } = useQuery<VisibilityRun[]>({
    queryKey: ["/api/brands", brandId, "visibility-runs", filterParams],
    queryFn: async () => {
      const url = `/api/brands/${brandId}/visibility-runs${filterParams ? `?${filterParams}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch visibility runs");
      return res.json();
    },
    enabled: !!brandId,
  });

  const { data: brandQuestions } = useQuery<UserQuestion[]>({
    queryKey: ["/api/brands", brandId, "user-questions"],
    enabled: !!brandId,
    staleTime: 60000,
  });

  const { data: allTrackedTerms } = useQuery<TrackedTerm[]>({
    queryKey: ["/api/tracked-terms"],
    staleTime: 30000,
  });

  const trackedTermsMap = useMemo(() => {
    const map: Record<number, TrackedTerm> = {};
    if (allTrackedTerms) {
      for (const t of allTrackedTerms) {
        if (!brandId || t.brandId === brandId) map[t.id] = t;
      }
    }
    return map;
  }, [allTrackedTerms, brandId]);

  const questionCategoryMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (brandQuestions) {
      for (const q of brandQuestions) {
        map[q.id] = q.questionCategory || "user_question";
      }
    }
    return map;
  }, [brandQuestions]);

  const questionTermMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (brandQuestions) {
      for (const q of brandQuestions) {
        if (q.trackedTermId) map[q.id] = q.trackedTermId;
      }
    }
    return map;
  }, [brandQuestions]);

  const questionVolumeMap = useMemo(() => {
    const map: Record<number, { searchVolume: string | null; searchVolumeMax: number | null }> = {};
    if (brandQuestions) {
      for (const q of brandQuestions) {
        map[q.id] = { searchVolume: q.searchVolume, searchVolumeMax: q.searchVolumeMax };
      }
    }
    return map;
  }, [brandQuestions]);

  const runs = useMemo(() => {
    const raw = runsRaw ?? [];
    const withQuestions = raw.filter(r => r.userQuestionId != null);
    return withQuestions.filter(r => {
      const cat = questionCategoryMap[r.userQuestionId!] || "user_question";
      return cat === activeTab;
    });
  }, [runsRaw, questionCategoryMap, activeTab]);

  const groupedQuestions = useMemo<GroupedQuestion[]>(() => {
    const map = new Map<number, GroupedQuestion>();
    const modelTimestamps = new Map<string, Date>();
    for (const run of runs) {
      if (!run.userQuestionId) continue;
      let group = map.get(run.userQuestionId);
      if (!group) {
        const vol = questionVolumeMap[run.userQuestionId];
        const resolvedTermId = run.trackedTermId ?? questionTermMap[run.userQuestionId] ?? null;
        group = {
          questionId: run.userQuestionId,
          questionText: run.promptText,
          promptType: run.promptType,
          trackedTermId: resolvedTermId,
          models: {},
          overallSentiment: null,
          competitors: [],
          searchVolume: vol?.searchVolume ?? null,
          searchVolumeMax: vol?.searchVolumeMax ?? null,
        };
        map.set(run.userQuestionId, group);
      }
      const tsKey = `${run.userQuestionId}:${run.modelId}`;
      const existingTs = modelTimestamps.get(tsKey);
      const runTs = new Date(run.runDate || 0);
      if (!existingTs || runTs > existingTs) {
        modelTimestamps.set(tsKey, runTs);
        group.models[run.modelId] = {
          appeared: run.appeared ?? false,
          position: run.position,
          sentiment: run.sentiment,
          citationPresent: run.citationPresent,
        };
      }
      const comps = Array.isArray(run.competitorsMentioned) ? (run.competitorsMentioned as string[]) : [];
      for (const c of comps) {
        if (!group.competitors.includes(c)) group.competitors.push(c);
      }
    }
    for (const group of map.values()) {
      const sentiments = Object.values(group.models).map(m => m.sentiment).filter(Boolean) as string[];
      if (sentiments.length > 0) {
        const pos = sentiments.filter(s => s === "positive").length;
        const neg = sentiments.filter(s => s === "negative").length;
        group.overallSentiment = pos >= neg && pos > 0 ? "positive" : neg > pos ? "negative" : "neutral";
      }
    }
    const sorted = Array.from(map.values());
    sorted.sort((a, b) => (b.searchVolumeMax ?? 0) - (a.searchVolumeMax ?? 0));
    return sorted;
  }, [runs, questionVolumeMap, questionTermMap]);

  type TermGroup = {
    termId: number;
    termText: string;
    category: string | null;
    questions: GroupedQuestion[];
    totalAppeared: number;
    totalResponses: number;
    visibilityPct: number;
    overallSentiment: string;
    competitorSet: string[];
    totalVolume: number;
  };

  const termGroups = useMemo<TermGroup[]>(() => {
    const map = new Map<number, TermGroup>();
    for (const q of groupedQuestions) {
      const termId = q.trackedTermId ?? 0;
      let group = map.get(termId);
      if (!group) {
        const term = termId ? trackedTermsMap[termId] : undefined;
        group = {
          termId,
          termText: term?.term ?? "Ungrouped Questions",
          category: term?.category ?? null,
          questions: [],
          totalAppeared: 0,
          totalResponses: 0,
          visibilityPct: 0,
          overallSentiment: "neutral",
          competitorSet: [],
          totalVolume: 0,
        };
        map.set(termId, group);
      }
      group.questions.push(q);
      const models = Object.values(q.models);
      group.totalAppeared += models.filter(m => m.appeared).length;
      group.totalResponses += models.length;
      group.totalVolume += q.searchVolumeMax ?? 0;
      for (const c of q.competitors) {
        if (!group.competitorSet.includes(c)) group.competitorSet.push(c);
      }
    }
    for (const group of map.values()) {
      group.visibilityPct = group.totalResponses > 0 ? Math.round((group.totalAppeared / group.totalResponses) * 100) : 0;
      let pos = 0, neg = 0;
      for (const q of group.questions) {
        if (q.overallSentiment === "positive") pos++;
        else if (q.overallSentiment === "negative") neg++;
      }
      group.overallSentiment = pos >= neg && pos > 0 ? "positive" : neg > pos ? "negative" : "neutral";
    }
    const sorted = Array.from(map.values());
    sorted.sort((a, b) => b.totalVolume - a.totalVolume);
    return sorted;
  }, [groupedQuestions, trackedTermsMap]);

  function toggleTermExpand(termId: number) {
    setExpandedTermIds(prev => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  const selectedGroup = useMemo(() => {
    if (selectedQuestionId == null) return null;
    return groupedQuestions.find(g => g.questionId === selectedQuestionId) ?? null;
  }, [selectedQuestionId, groupedQuestions]);

  const selectedModelResponses = useMemo(() => {
    if (selectedQuestionId == null || !runsRaw) return [];
    const matching = runsRaw.filter(r => r.userQuestionId === selectedQuestionId);
    const latestByModel = new Map<string, VisibilityRun>();
    for (const run of matching) {
      const existing = latestByModel.get(run.modelId);
      if (!existing || new Date(run.runDate || 0) > new Date(existing.runDate || 0)) {
        latestByModel.set(run.modelId, run);
      }
    }
    return Array.from(latestByModel.values());
  }, [selectedQuestionId, runsRaw]);

  const chartStats = useMemo(() => {
    const raw = runsRaw ?? [];
    const withQuestions = raw.filter(r => r.userQuestionId != null);

    const computeStats = (category: string) => {
      const catRuns = withQuestions.filter(r => {
        const cat = questionCategoryMap[r.userQuestionId!] || "user_question";
        return cat === category;
      });
      const appeared = catRuns.filter(r => r.appeared).length;
      const notAppeared = catRuns.length - appeared;
      const sentiments = catRuns.filter(r => r.sentiment).reduce(
        (acc, r) => {
          const s = r.sentiment as string;
          if (s === "positive") acc.positive++;
          else if (s === "negative") acc.negative++;
          else acc.neutral++;
          return acc;
        },
        { positive: 0, negative: 0, neutral: 0 }
      );
      return { appeared, notAppeared, total: catRuns.length, sentiments };
    };

    return {
      nonBrand: computeStats("user_question"),
      brand: computeStats("brand_sentiment"),
    };
  }, [runsRaw, questionCategoryMap]);

  const VISIBILITY_COLORS = ["hsl(142, 71%, 45%)", "hsl(0, 0%, 40%)"];
  const SENTIMENT_COLORS = ["hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)", "hsl(45, 93%, 47%)"];

  if (brandsLoading) {
    return (
      <PageShell title="Key Term Visibility Report" subtitle="Detailed AI visibility analysis">
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell title="Key Term Visibility Report" subtitle="Detailed AI visibility analysis">
        <EmptyState
          icon={MessageSquare}
          heading="No brand configured"
          description="Complete onboarding to start tracking visibility."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Key Term Visibility Report"
      subtitle="Detailed question-by-question AI visibility analysis across all models"
    >
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Dashboard
          </Button>
        </Link>
        <Link href="/brand-settings?tab=terms">
          <Button variant="ghost" size="sm" data-testid="button-manage-terms-report">
            <Tag className="h-4 w-4 mr-1.5" />
            Manage Terms
          </Button>
        </Link>
      </div>

      {(chartStats.nonBrand.total > 0 || chartStats.brand.total > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="section-visibility-charts">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-medium mb-1" data-testid="text-visibility-chart-title">Brand Visibility</h3>
              <p className="text-xs text-muted-foreground mb-3">How often your brand appears across all AI responses (both question types)</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Non-Brand Terms", data: chartStats.nonBrand, key: "nonBrand" },
                  { label: "Brand Terms", data: chartStats.brand, key: "brand" },
                ].map(({ label, data, key }) => {
                  const pieData = [
                    { name: "Appeared", value: data.appeared },
                    { name: "Not mentioned", value: data.notAppeared },
                  ].filter(d => d.value > 0);
                  const pct = data.total > 0 ? Math.round((data.appeared / data.total) * 100) : 0;
                  return (
                    <div key={key} className="text-center" data-testid={`chart-visibility-${key}`}>
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      {data.total === 0 ? (
                        <p className="text-xs text-muted-foreground py-8" data-testid={`text-visibility-nodata-${key}`}>No data</p>
                      ) : (
                        <>
                          <div className="min-h-[130px]">
                            <ResponsiveContainer width="100%" height={130}>
                              <PieChart>
                                <Pie
                                  data={pieData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={30}
                                  outerRadius={50}
                                  paddingAngle={2}
                                  dataKey="value"
                                  strokeWidth={0}
                                >
                                  {pieData.map((_, i) => (
                                    <Cell key={i} fill={VISIBILITY_COLORS[pieData[i].name === "Appeared" ? 0 : 1]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-lg font-bold" data-testid={`text-visibility-pct-${key}`}>{pct}%</p>
                          <p className="text-[10px] text-muted-foreground" data-testid={`text-visibility-count-${key}`}>{data.appeared} / {data.total} responses</p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-medium mb-1" data-testid="text-sentiment-chart-title">Sentiment Analysis</h3>
              <p className="text-xs text-muted-foreground mb-3">How AI models describe your brand across all responses</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Non-Brand Terms", data: chartStats.nonBrand, key: "nonBrand" },
                  { label: "Brand Terms", data: chartStats.brand, key: "brand" },
                ].map(({ label, data, key }) => {
                  const sentData = [
                    { name: "Positive", value: data.sentiments.positive },
                    { name: "Negative", value: data.sentiments.negative },
                    { name: "Neutral", value: data.sentiments.neutral },
                  ].filter(d => d.value > 0);
                  const sentTotal = data.sentiments.positive + data.sentiments.negative + data.sentiments.neutral;
                  return (
                    <div key={key} className="text-center" data-testid={`chart-sentiment-${key}`}>
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      {sentTotal === 0 ? (
                        <p className="text-xs text-muted-foreground py-8" data-testid={`text-sentiment-nodata-${key}`}>No data</p>
                      ) : (
                        <>
                          <div className="min-h-[130px]">
                            <ResponsiveContainer width="100%" height={130}>
                              <PieChart>
                                <Pie
                                  data={sentData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={30}
                                  outerRadius={50}
                                  paddingAngle={2}
                                  dataKey="value"
                                  strokeWidth={0}
                                >
                                  {sentData.map((entry, i) => (
                                    <Cell
                                      key={i}
                                      fill={
                                        entry.name === "Positive" ? SENTIMENT_COLORS[0]
                                          : entry.name === "Negative" ? SENTIMENT_COLORS[1]
                                          : SENTIMENT_COLORS[2]
                                      }
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 mt-1">
                            {sentData.map(d => (
                              <span key={d.name} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-sentiment-legend-${key}-${d.name.toLowerCase()}`}>
                                <span
                                  className="inline-block w-2 h-2 rounded-full"
                                  style={{ backgroundColor: d.name === "Positive" ? SENTIMENT_COLORS[0] : d.name === "Negative" ? SENTIMENT_COLORS[1] : SENTIMENT_COLORS[2] }}
                                />
                                {d.name} ({d.value})
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="px-4 sm:px-6 pt-4 pb-0 space-y-3">
            <SectionHeader
              title="Visibility Results"
              subtitle={`${termGroups.length} term${termGroups.length !== 1 ? "s" : ""}, ${groupedQuestions.length} questions matching current filters`}
            />
            <div className="flex flex-wrap items-center gap-1 border-b border-border" data-testid="tabs-visibility-category">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "user_question"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("user_question")}
                data-testid="tab-user-questions"
              >
                <MessageSquare className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Non-Brand Terms Visibility
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "brand_sentiment"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("brand_sentiment")}
                data-testid="tab-brand-sentiment"
              >
                <Building2 className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Brand Terms Visibility
              </button>
            </div>
          </div>

          <FilterBar>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-label text-muted-foreground whitespace-nowrap hidden sm:inline">Prompt Type</span>
              <Select value={promptTypeFilter} onValueChange={setPromptTypeFilter}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-prompt-type">
                  <SelectValue placeholder="Prompt Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="awareness">Awareness</SelectItem>
                  <SelectItem value="consideration">Consideration</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-label text-muted-foreground whitespace-nowrap hidden sm:inline">Date Range</span>
              <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                <SelectTrigger className="w-full sm:w-36" data-testid="select-date-range">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FilterBar>

          {runsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : termGroups.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-body">
              No results match the current filters.
            </div>
          ) : (
            <div className="divide-y divide-border" data-testid="list-term-groups">
              {termGroups.map((tg) => {
                const isExpanded = expandedTermIds.has(tg.termId);
                return (
                  <div key={tg.termId} data-testid={`term-group-${tg.termId}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 sm:px-6 py-3.5 flex items-center gap-3 hover-elevate transition-colors"
                      onClick={() => toggleTermExpand(tg.termId)}
                      data-testid={`button-expand-term-${tg.termId}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate" data-testid={`text-term-name-${tg.termId}`}>
                            {tg.termText}
                          </span>
                          {tg.category && (
                            <DataBadge variant="neutral">{tg.category}</DataBadge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span data-testid={`text-term-questions-${tg.termId}`}>{tg.questions.length} question{tg.questions.length !== 1 ? "s" : ""}</span>
                          <span className="text-border">|</span>
                          <span data-testid={`text-term-visibility-${tg.termId}`}>
                            Visibility: <span className={tg.visibilityPct >= 50 ? "text-green-500 font-medium" : tg.visibilityPct >= 25 ? "text-yellow-500 font-medium" : "text-red-400 font-medium"}>{tg.visibilityPct}%</span>
                            <span className="ml-1 text-muted-foreground/60">({tg.totalAppeared}/{tg.totalResponses})</span>
                          </span>
                          <span className="text-border">|</span>
                          <span>Sentiment: </span>
                          <DataBadge variant={tg.overallSentiment === "positive" ? "positive" : tg.overallSentiment === "negative" ? "negative" : "neutral"}>
                            {tg.overallSentiment}
                          </DataBadge>
                          {tg.competitorSet.length > 0 && (
                            <>
                              <span className="text-border hidden sm:inline">|</span>
                              <span className="hidden sm:inline">{tg.competitorSet.length} competitor{tg.competitorSet.length !== 1 ? "s" : ""} mentioned</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-border/50 bg-muted/20">
                        <Table data-testid={`table-term-questions-${tg.termId}`}>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[280px] pl-10 sm:pl-14">Question</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <TrendingUp className="h-3.5 w-3.5" />
                                  Vol.
                                </div>
                              </TableHead>
                              {SCAN_MODELS.map(({ id, label }) => (
                                <TableHead key={id} className="text-center">{label}</TableHead>
                              ))}
                              <TableHead>Sentiment</TableHead>
                              <TableHead className="min-w-[140px]">Competitors</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tg.questions.map((group) => (
                              <TableRow key={group.questionId} data-testid={`row-question-${group.questionId}`}>
                                <TableCell className="text-body text-foreground max-w-xs pl-10 sm:pl-14" title={group.questionText}>
                                  <button
                                    type="button"
                                    className="text-left hover:text-primary transition-colors underline decoration-muted-foreground/30 hover:decoration-primary cursor-pointer"
                                    onClick={() => setSelectedQuestionId(group.questionId)}
                                    data-testid={`link-question-${group.questionId}`}
                                  >
                                    {group.questionText}
                                  </button>
                                </TableCell>
                                <TableCell>
                                  <span className="text-label text-muted-foreground capitalize">
                                    {group.promptType.replace(/_/g, " ")}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  {group.searchVolume ? (
                                    <span className="text-xs font-medium text-foreground" data-testid={`text-volume-${group.questionId}`}>
                                      {group.searchVolume}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">--</span>
                                  )}
                                </TableCell>
                                {SCAN_MODELS.map(({ id: model }) => {
                                  const modelRun = group.models[model];
                                  return (
                                    <TableCell key={model} className="text-center">
                                      {modelRun ? (
                                        <DataBadge variant={modelRun.appeared ? "appeared" : "missing"} data-testid={`badge-${model}-${group.questionId}`}>
                                          {modelRun.appeared ? (modelRun.position != null ? `#${modelRun.position}` : "Yes") : "No"}
                                        </DataBadge>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground">--</span>
                                      )}
                                    </TableCell>
                                  );
                                })}
                                <TableCell>
                                  {group.overallSentiment ? (
                                    <DataBadge
                                      variant={
                                        group.overallSentiment === "positive"
                                          ? "positive"
                                          : group.overallSentiment === "negative"
                                          ? "negative"
                                          : "neutral"
                                      }
                                    >
                                      {group.overallSentiment}
                                    </DataBadge>
                                  ) : (
                                    <span className="text-body text-muted-foreground">--</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {group.competitors.length > 0
                                      ? group.competitors.map((c) => (
                                          <DataBadge key={c} variant="neutral">
                                            {c}
                                          </DataBadge>
                                        ))
                                      : <span className="text-body text-muted-foreground">--</span>
                                    }
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={selectedQuestionId != null} onOpenChange={(open) => { if (!open) setSelectedQuestionId(null); }}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto" data-testid="sheet-question-detail">
          <SheetHeader>
            <SheetTitle className="text-base leading-snug pr-6" data-testid="text-sheet-question">
              {selectedGroup?.questionText}
            </SheetTitle>
            <SheetDescription>
              <span className="capitalize">{selectedGroup?.promptType?.replace(/_/g, " ")}</span>
              {selectedGroup?.overallSentiment && (
                <> &middot; Overall sentiment: <span className="capitalize">{selectedGroup.overallSentiment}</span></>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4" data-testid="container-llm-responses">
            {SCAN_MODELS.map(({ id: modelId, label }) => {
              const run = selectedModelResponses.find(r => r.modelId === modelId);
              const modelData = selectedGroup?.models[modelId];

              return (
                <Card key={modelId} data-testid={`card-response-${modelId}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span className="text-sm font-medium text-foreground" data-testid={`text-model-label-${modelId}`}>{label}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {modelData ? (
                          <>
                            <DataBadge variant={modelData.appeared ? "appeared" : "missing"}>
                              {modelData.appeared ? "Appeared" : "Not mentioned"}
                            </DataBadge>
                            {modelData.sentiment && (
                              <DataBadge variant={modelData.sentiment === "positive" ? "positive" : modelData.sentiment === "negative" ? "negative" : "neutral"}>
                                {modelData.sentiment}
                              </DataBadge>
                            )}
                            {modelData.position != null && (
                              <DataBadge variant="neutral">#{modelData.position}</DataBadge>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
                      </div>
                    </div>
                    {run?.rawResponse ? (
                      <div className="max-h-[600px] overflow-y-auto" data-testid={`text-response-${modelId}`}>
                        <MarkdownResponse content={run.rawResponse} testId={`markdown-response-${modelId}`} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No response recorded</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedGroup && selectedGroup.competitors.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-medium text-muted-foreground">Competitors mentioned:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedGroup.competitors.map((c) => (
                  <DataBadge key={c} variant="neutral">{c}</DataBadge>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
