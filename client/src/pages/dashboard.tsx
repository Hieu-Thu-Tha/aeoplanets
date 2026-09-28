import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  PageShell,
  SectionHeader,
  DataBadge,
  EmptyState,
} from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { Eye, Award, ShieldCheck, BarChart2, Tag, RefreshCw, Loader2, MessageSquare, Building2, ChevronLeft, ChevronRight, Gauge, Monitor, Smartphone, ArrowRight, UserPlus, X, Sparkles, AlertTriangle, Shield, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import type { Brand, VisibilityRun, UserQuestion } from "@shared/schema";
import type { TrackedTerm } from "@shared/schema";
import {
  chartTooltipStyle,
  defaultLineProps,
  defaultCartesianGridProps,
  defaultXAxisProps,
  defaultYAxisProps,
  chartColors,
} from "@/lib/chart-theme";

function TrialCountdownBanner({ trialEnd, isInTrial }: { trialEnd: string | null; isInTrial: boolean }) {
  if (!trialEnd) return null;

  const trialEndDate = new Date(trialEnd);
  const now = new Date();
  const isExpired = now >= trialEndDate;

  if (isExpired) {
    return (
      <div
        className="flex items-center justify-between gap-4 flex-wrap rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3"
        data-testid="banner-trial-expired"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-foreground">
            Your free trial has ended. Subscribe now to continue using all features.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/billing" data-testid="link-trial-subscribe">
            Subscribe now
          </Link>
        </Button>
      </div>
    );
  }

  if (!isInTrial) return null;

  const msLeft = trialEndDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  return (
    <div
      className="flex items-center justify-between gap-4 flex-wrap rounded-md border border-primary/20 bg-primary/5 px-4 py-3"
      data-testid="banner-trial-countdown"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-medium">{daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>{" "}
          remaining in your free trial. Explore all features before your subscription begins.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/billing" data-testid="link-trial-billing">
          Subscribe now
        </Link>
      </Button>
    </div>
  );
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function pctNum(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function AnimatedScoreCard({
  label,
  value,
  numerator,
  denominator,
  color,
  icon: Icon,
  description,
  delay = 0,
  "data-testid": testId,
}: {
  label: string;
  value: number;
  numerator: number;
  denominator: number;
  color: string;
  icon: typeof Eye;
  description: string;
  delay?: number;
  "data-testid"?: string;
}) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setHasStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!hasStarted) return;
    const duration = 1200;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [hasStarted, value]);

  const size = 96;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * animatedValue) / 100;

  return (
    <Card className="p-4 sm:p-5" data-testid={testId}>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: hasStarted ? "none" : undefined }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-foreground">{animatedValue}%</span>
            </div>
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 shrink-0">
                <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              </div>
              <span className="text-label text-muted-foreground">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">{description}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{numerator}</span>
              <span>/</span>
              <span>{denominator}</span>
              <span>runs</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildTrendData(runs: VisibilityRun[]) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const toDayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const byDayKey: Record<string, { total: number; appeared: number }> = {};
  let earliest: Date | null = null;

  for (const run of runs) {
    if (!run.runDate) continue;
    const d = new Date(run.runDate);
    if (!earliest || d < earliest) earliest = d;
    const dayKey = toDayKey(d);
    if (!byDayKey[dayKey]) byDayKey[dayKey] = { total: 0, appeared: 0 };
    byDayKey[dayKey].total += 1;
    if (run.appeared) byDayKey[dayKey].appeared += 1;
  }

  if (!earliest) return [];

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const startDate = earliest < thirtyDaysAgo ? thirtyDaysAgo : new Date(earliest);
  startDate.setHours(0, 0, 0, 0);

  const result: { date: string; shareOfVoice: number | null }[] = [];
  const cursor = new Date(startDate);

  while (cursor <= now) {
    const dayKey = toDayKey(cursor);
    const label = cursor.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const entry = byDayKey[dayKey];

    result.push({
      date: label,
      shareOfVoice: entry && entry.total > 0
        ? Math.round((entry.appeared / entry.total) * 100)
        : null,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div style={chartTooltipStyle} className="px-3 py-2 shadow-sm">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground">
        {value != null ? `${value}% Share of Voice` : "No data"}
      </p>
    </div>
  );
}

const FUNNEL_STAGES = [
  {
    key: "awareness",
    label: "Awareness",
    promptTypes: ["awareness"],
    description: "Educational & discovery",
    color: "#06b6d4",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    textColor: "text-cyan-400",
  },
  {
    key: "consideration",
    label: "Consideration",
    promptTypes: ["consideration"],
    description: "Comparison & evaluation",
    color: "#8b5cf6",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-400",
  },
  {
    key: "commercial",
    label: "Commercial",
    promptTypes: ["commercial"],
    description: "Purchase & recommendation",
    color: "#10b981",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
  },
];

function StagePieChart({ appeared, total, color, size = 100 }: { appeared: number; total: number; color: string; size?: number }) {
  const missed = total - appeared;
  const data = total > 0
    ? [
        { name: "Appeared", value: appeared },
        { name: "Missed", value: missed },
      ]
    : [{ name: "Empty", value: 1 }];
  const rate = total > 0 ? Math.round((appeared / total) * 100) : 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx={size / 2}
          cy={size / 2}
          innerRadius={size * 0.32}
          outerRadius={size * 0.46}
          paddingAngle={total > 0 ? 2 : 0}
          dataKey="value"
          strokeWidth={0}
        >
          {total > 0 ? (
            <>
              <Cell fill={color} />
              <Cell fill="hsl(var(--muted))" />
            </>
          ) : (
            <Cell fill="hsl(var(--muted))" />
          )}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-foreground">{rate}%</span>
      </div>
    </div>
  );
}

function computeStageData(runs: VisibilityRun[]) {
  return FUNNEL_STAGES.map((stage) => {
    const stageRuns = runs.filter((r) => stage.promptTypes.includes(r.promptType));
    const total = stageRuns.length;
    const appeared = stageRuns.filter((r) => r.appeared).length;
    const rate = total > 0 ? Math.round((appeared / total) * 100) : 0;
    const positive = stageRuns.filter((r) => r.sentiment === "positive").length;
    const neutral = stageRuns.filter((r) => r.sentiment === "neutral").length;
    const negative = stageRuns.filter((r) => r.sentiment === "negative").length;
    return { ...stage, total, appeared, rate, positive, neutral, negative };
  });
}

function SentimentBar({ positive, neutral, negative, total }: { positive: number; neutral: number; negative: number; total: number }) {
  if (total === 0) return <span className="text-[10px] text-muted-foreground">No data</span>;
  const pPos = Math.round((positive / total) * 100);
  const pNeu = Math.round((neutral / total) * 100);
  const pNeg = Math.round((negative / total) * 100);
  return (
    <div className="w-full space-y-1">
      <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px">
        {pPos > 0 && <div className="bg-emerald-500 rounded-full" style={{ width: `${pPos}%` }} />}
        {pNeu > 0 && <div className="bg-slate-400 rounded-full" style={{ width: `${pNeu}%` }} />}
        {pNeg > 0 && <div className="bg-red-400 rounded-full" style={{ width: `${pNeg}%` }} />}
      </div>
      <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <span className="text-emerald-400">{pPos}%</span>
        <span className="text-slate-400">{pNeu}%</span>
        <span className="text-red-400">{pNeg}%</span>
      </div>
    </div>
  );
}

function FunnelColumn({ stageData, title, icon: Icon, subtitle }: {
  stageData: ReturnType<typeof computeStageData>;
  title: string;
  icon: typeof MessageSquare;
  subtitle: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col items-center">
        {stageData.map((stage, idx) => {
          const funnelWidths = [100, 78, 56];
          return (
            <div key={stage.key} className="w-full flex flex-col items-center" data-testid={`funnel-${title.toLowerCase().replace(/\s/g, "-")}-${stage.key}`}>
              <div
                className={`relative border ${stage.borderColor} ${stage.bgColor} px-3 py-2.5 transition-all`}
                style={{
                  width: `${funnelWidths[idx]}%`,
                  clipPath: idx < stageData.length - 1
                    ? "polygon(0 0, 100% 0, 95% 100%, 5% 100%)"
                    : "polygon(5% 0, 95% 0, 90% 100%, 10% 100%)",
                }}
              >
                <div className="text-center relative z-10">
                  <p className={`text-xs font-semibold ${stage.textColor}`}>{stage.label}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className="text-lg font-bold text-foreground">{stage.rate}%</span>
                    <span className="text-[10px] text-muted-foreground">SoV</span>
                  </div>
                  <div className="mt-1 px-2">
                    <SentimentBar positive={stage.positive} neutral={stage.neutral} negative={stage.negative} total={stage.total} />
                  </div>
                </div>
              </div>
              {idx < stageData.length - 1 && (
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[5px] border-t-border/30 my-0.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AIFunnelAnalysis({ runs, questionCategoryMap }: { runs: VisibilityRun[]; questionCategoryMap: Record<number, string> }) {
  const userQuestionRuns = runs.filter(r => {
    if (!r.userQuestionId) return false;
    return (questionCategoryMap[r.userQuestionId] || "user_question") === "user_question";
  });
  const brandSentimentRuns = runs.filter(r => {
    if (!r.userQuestionId) return false;
    return (questionCategoryMap[r.userQuestionId] || "user_question") === "brand_sentiment";
  });

  const uqStages = computeStageData(userQuestionRuns);
  const bsStages = computeStageData(brandSentimentRuns);

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <SectionHeader
            title="AI Funnel Analysis"
            subtitle="Share of Voice and sentiment across the customer journey"
            className="mb-6"
          />
          <div className="flex items-center justify-center h-40 text-muted-foreground text-body">
            No run data available yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-funnel-analysis">
      <CardContent className="p-4 sm:p-6">
        <SectionHeader
          title="AI Funnel Analysis"
          subtitle="Share of Voice and sentiment across the customer journey"
          className="mb-4"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground">Awareness</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Early-stage questions where users explore a topic or problem without knowing specific solutions. e.g. "What is marketing automation?" or "How do companies manage email campaigns?"
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground">Consideration</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mid-funnel questions where users compare options and evaluate solutions. e.g. "Best marketing automation platforms for B2B" or "HubSpot vs Mailchimp for small businesses."
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground">Commercial</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bottom-of-funnel questions with buying intent where users are ready to act. e.g. "Is [Brand] worth it for [use case]?" or "Which [category] tool has the best ROI?"
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Positive
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            Neutral
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            Negative
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FunnelColumn
            stageData={uqStages}
            title="Non-Brand Terms Visibility"
            icon={MessageSquare}
            subtitle="Generic queries — brand appears without being named"
          />
          <FunnelColumn
            stageData={bsStages}
            title="Brand Terms Visibility"
            icon={Building2}
            subtitle="Direct brand queries — testing AI awareness"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function computeCompetitorStageData(runs: VisibilityRun[], competitor: string) {
  return FUNNEL_STAGES.map((stage) => {
    const stageRuns = runs.filter((r) => stage.promptTypes.includes(r.promptType));
    const total = stageRuns.length;
    const mentioned = stageRuns.filter((r) => {
      const comps = Array.isArray(r.competitorsMentioned) ? (r.competitorsMentioned as string[]) : [];
      return comps.some(c => c.toLowerCase() === competitor.toLowerCase());
    }).length;
    const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0;
    return { ...stage, total, appeared: mentioned, rate };
  });
}

function CompetitorMiniFunnel({ name, stageData }: {
  name: string;
  stageData: ReturnType<typeof computeCompetitorStageData>;
}) {
  const displayName = name.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  return (
    <div className="flex flex-col items-center w-full" data-testid={`competitor-funnel-${displayName}`}>
      <p className="text-xs font-semibold text-foreground mb-2 truncate w-full text-center" title={displayName}>
        {displayName}
      </p>
      <div className="flex flex-col items-center w-full">
        {stageData.map((stage, idx) => {
          const funnelWidths = [100, 78, 56];
          return (
            <div key={stage.key} className="w-full flex flex-col items-center">
              <div
                className={`relative border ${stage.borderColor} ${stage.bgColor} px-2 py-1.5 transition-all`}
                style={{
                  width: `${funnelWidths[idx]}%`,
                  clipPath: idx < stageData.length - 1
                    ? "polygon(0 0, 100% 0, 95% 100%, 5% 100%)"
                    : "polygon(5% 0, 95% 0, 90% 100%, 10% 100%)",
                }}
              >
                <div className="text-center relative z-10">
                  <p className={`text-[10px] font-medium ${stage.textColor}`} data-testid={`text-competitor-stage-${displayName}-${stage.key}`}>{stage.label}</p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className="text-sm font-bold text-foreground" data-testid={`text-competitor-rate-${displayName}-${stage.key}`}>{stage.rate}%</span>
                  </div>
                </div>
              </div>
              {idx < stageData.length - 1 && (
                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[3px] border-t-border/30 my-px" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground" data-testid={`text-competitor-runs-${displayName}`}>
        {stageData[0].total > 0 ? `${stageData[0].total} runs` : "No data"}
      </div>
    </div>
  );
}

interface PageSpeedAudit {
  score: number | null;
  value: number | null;
  unit: string | null;
  display: string | null;
}
interface PageSpeedCrux {
  percentile: number | null;
  category: string;
  distributions: { min: number; max?: number; proportion: number }[];
}
interface StrategyResult {
  performanceScore: number | null;
  overallCategory: string;
  lab: Record<string, PageSpeedAudit | null>;
  field: Record<string, PageSpeedCrux | null>;
  error?: string;
}
interface PageSpeedData {
  domain: string;
  results: Record<string, StrategyResult>;
  fetchedAt: string;
}

function getCategoryColor(cat: string) {
  if (cat === "fast" || cat === "good") return "text-emerald-400";
  if (cat === "average" || cat === "needs_improvement") return "text-amber-400";
  return "text-red-400";
}

function getCategoryBg(cat: string) {
  if (cat === "fast" || cat === "good") return "bg-emerald-400/10";
  if (cat === "average" || cat === "needs_improvement") return "bg-amber-400/10";
  return "bg-red-400/10";
}

function getScoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 90) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function getScoreRingColor(score: number | null) {
  if (score == null) return "stroke-muted";
  if (score >= 90) return "stroke-emerald-400";
  if (score >= 50) return "stroke-amber-400";
  return "stroke-red-400";
}

function PerformanceScoreRing({ score }: { score: number | null }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = score != null ? circumference - (score / 100) * circumference : circumference;
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" className="stroke-muted/30" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius} fill="none"
          className={getScoreRingColor(score)}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-bold ${getScoreColor(score)}`} data-testid="text-perf-score">
          {score != null ? score : "--"}
        </span>
      </div>
    </div>
  );
}

function MetricItem({ label, audit, crux, description }: {
  label: string;
  audit: PageSpeedAudit | null;
  crux: PageSpeedCrux | null;
  description: string;
}) {
  const cat = crux?.category || (audit?.score != null ? (audit.score >= 0.9 ? "fast" : audit.score >= 0.5 ? "average" : "slow") : "unknown");
  const catLabel = cat === "fast" ? "Good" : cat === "average" ? "Needs Work" : cat === "slow" ? "Poor" : "--";

  return (
    <div className="flex items-center gap-4 py-3" data-testid={`cwv-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${cat === "fast" ? "bg-emerald-400" : cat === "average" ? "bg-amber-400" : cat === "slow" ? "bg-red-400" : "bg-muted"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground">{audit?.display || "--"}</div>
        {crux && crux.percentile != null && (
          <div className={`text-xs ${getCategoryColor(cat)}`}>
            p75: {label === "CLS" ? (crux.percentile / 100).toFixed(2) : `${(crux.percentile / 1000).toFixed(1)}s`}
          </div>
        )}
        {!crux && (
          <div className={`text-xs ${getCategoryColor(cat)}`}>{catLabel}</div>
        )}
      </div>
    </div>
  );
}

function DistributionBar({ crux }: { crux: PageSpeedCrux | null }) {
  if (!crux || !crux.distributions || crux.distributions.length === 0) return null;
  const [good, mid, poor] = crux.distributions;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px" data-testid="bar-distribution">
      <div className="bg-emerald-400 rounded-l-full" style={{ width: `${(good?.proportion || 0) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(mid?.proportion || 0) * 100}%` }} />
      <div className="bg-red-400 rounded-r-full" style={{ width: `${(poor?.proportion || 0) * 100}%` }} />
    </div>
  );
}

function CoreWebVitalsSection({ brandId }: { brandId: number }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<PageSpeedData>({
    queryKey: ["/api/brands", brandId, "pagespeed"],
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/pagespeed?refresh=true`);
      const freshData = await res.json();
      queryClient.setQueryData(["/api/brands", brandId, "pagespeed"], freshData);
    } catch (err) {
      refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="card-core-web-vitals">
        <CardContent className="p-4 sm:p-6">
          <SectionHeader title="Core Web Vitals" subtitle="Site performance metrics from Google PageSpeed Insights" />
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading performance data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.results) {
    return (
      <Card data-testid="card-core-web-vitals">
        <CardContent className="p-4 sm:p-6">
          <SectionHeader title="Core Web Vitals" subtitle="Site performance metrics from Google PageSpeed Insights" />
          <div className="flex items-center justify-between py-4 gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">Unable to load performance data. Ensure your brand has a domain configured.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-cwv-retry">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStrategy(strategy: StrategyResult) {
    const lab = strategy.lab;
    const field = strategy.field;

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="shrink-0">
            <PerformanceScoreRing score={strategy.performanceScore} />
            <div className="text-center mt-2">
              <span className={`text-xs font-medium ${getScoreColor(strategy.performanceScore)}`}>
                Performance
              </span>
            </div>
          </div>

          <div className="flex-1 w-full">
            <div className="divide-y divide-border">
              <MetricItem
                label="LCP"
                audit={lab?.lcp || null}
                crux={field?.lcp || null}
                description="Largest Contentful Paint"
              />
              <MetricItem
                label="FCP"
                audit={lab?.fcp || null}
                crux={field?.fcp || null}
                description="First Contentful Paint"
              />
              <MetricItem
                label="CLS"
                audit={lab?.cls || null}
                crux={field?.cls || null}
                description="Cumulative Layout Shift"
              />
              <MetricItem
                label="TBT"
                audit={lab?.tbt || null}
                crux={null}
                description="Total Blocking Time"
              />
            </div>
          </div>
        </div>

        {field?.lcp && (
          <div className="space-y-3 pt-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Field Data (Real Users)</div>
            <div className="space-y-2">
              {[
                { label: "LCP", crux: field.lcp },
                { label: "FCP", crux: field.fcp },
                { label: "CLS", crux: field.cls },
                { label: "TTFB", crux: field.ttfb },
              ].filter(m => m.crux).map(m => (
                <div key={m.label}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <span className={`text-xs font-medium ${getCategoryColor(m.crux!.category)}`}>
                      {m.crux!.category === "fast" ? "Good" : m.crux!.category === "average" ? "Needs Work" : "Poor"}
                    </span>
                  </div>
                  <DistributionBar crux={m.crux!} />
                  <div className="flex justify-between gap-2 mt-0.5">
                    <span className="text-[10px] text-emerald-400/70">{Math.round((m.crux!.distributions[0]?.proportion || 0) * 100)}% good</span>
                    <span className="text-[10px] text-red-400/70">{Math.round((m.crux!.distributions[2]?.proportion || 0) * 100)}% poor</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {strategy.overallCategory && strategy.overallCategory !== "unknown" && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground">Overall:</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getCategoryBg(strategy.overallCategory)} ${getCategoryColor(strategy.overallCategory)}`}>
              {strategy.overallCategory === "fast" ? "Fast" : strategy.overallCategory === "average" ? "Average" : "Slow"}
            </span>
          </div>
        )}
      </div>
    );
  }

  const mobile = data.results.mobile;
  const desktop = data.results.desktop;
  const hasMobile = mobile && !mobile.error;
  const hasDesktop = desktop && !desktop.error;

  return (
    <Card data-testid="card-core-web-vitals">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <SectionHeader
            title="Core Web Vitals"
            subtitle={`Performance metrics for ${data.domain}`}
          />
          <Button variant="outline" size="sm" asChild data-testid="button-pagespeed-report">
            <Link href="/web-vitals">
              <ArrowRight className="mr-2 h-3.5 w-3.5" />
              Full Report
            </Link>
          </Button>
        </div>

        {hasMobile && hasDesktop ? (
          <Tabs defaultValue="mobile">
            <TabsList className="mb-4">
              <TabsTrigger value="mobile" data-testid="tab-cwv-mobile">
                <Smartphone className="mr-2 h-3.5 w-3.5" />
                Mobile
              </TabsTrigger>
              <TabsTrigger value="desktop" data-testid="tab-cwv-desktop">
                <Monitor className="mr-2 h-3.5 w-3.5" />
                Desktop
              </TabsTrigger>
            </TabsList>
            <TabsContent value="mobile">
              {renderStrategy(mobile as StrategyResult)}
            </TabsContent>
            <TabsContent value="desktop">
              {renderStrategy(desktop as StrategyResult)}
            </TabsContent>
          </Tabs>
        ) : hasMobile ? (
          renderStrategy(mobile as StrategyResult)
        ) : hasDesktop ? (
          renderStrategy(desktop as StrategyResult)
        ) : (
          <p className="text-sm text-muted-foreground py-4">No performance data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorFunnels({ runs, competitors }: { runs: VisibilityRun[]; competitors: string[] }) {
  const PAGE_SIZE = 6;
  const [page, setPage] = useState(0);

  const competitorData = useMemo(() => {
    return competitors.map(comp => ({
      name: comp,
      stageData: computeCompetitorStageData(runs, comp),
    }));
  }, [runs, competitors]);

  const totalPages = Math.ceil(competitorData.length / PAGE_SIZE);
  const pagedData = competitorData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const itemsOnPage = pagedData.length;

  if (competitors.length === 0) return null;

  return (
    <Card data-testid="card-competitor-funnels">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <SectionHeader
            title="Competitor AI Funnels"
            subtitle="How often each competitor appears across funnel stages in AI responses"
          />
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                data-testid="button-competitor-scroll-left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                data-testid="button-competitor-scroll-right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          {FUNNEL_STAGES.map(stage => (
            <div key={stage.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.label}
            </div>
          ))}
        </div>

        <div
          className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        >
          {pagedData.map(({ name, stageData }) => (
            <CompetitorMiniFunnel key={name} name={name} stageData={stageData} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatVolume(min: number, max: number): string {
  const fmt = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return n.toLocaleString();
  };
  return `${fmt(min)}-${fmt(max)}`;
}

function VisibilityRunsSummary({
  runs,
  questionCategoryMap,
  brandQuestions,
  runsLoading,
}: {
  runs: VisibilityRun[];
  questionCategoryMap: Record<number, string>;
  brandQuestions: UserQuestion[];
  runsLoading: boolean;
}) {
  const summaryData = useMemo(() => {
    const userQuestionRuns = runs.filter(r => {
      const cat = r.userQuestionId ? (questionCategoryMap[r.userQuestionId] || "user_question") : "user_question";
      return cat === "user_question";
    });
    const brandSentimentRuns = runs.filter(r => {
      const cat = r.userQuestionId ? (questionCategoryMap[r.userQuestionId] || "user_question") : "user_question";
      return cat === "brand_sentiment";
    });

    const volumeByQuestion: Record<number, { min: number; max: number }> = {};
    for (const q of brandQuestions) {
      if (q.searchVolumeMin != null && q.searchVolumeMax != null) {
        volumeByQuestion[q.id] = { min: q.searchVolumeMin, max: q.searchVolumeMax };
      }
    }

    function computeStats(subset: VisibilityRun[], cat: string) {
      const questionIds = new Set(subset.filter(r => r.userQuestionId).map(r => r.userQuestionId!));
      const appeared = subset.filter(r => r.appeared).length;
      const total = subset.length;
      const sentiments = subset.map(r => r.sentiment).filter(Boolean) as string[];
      const pos = sentiments.filter(s => s === "positive").length;
      const neg = sentiments.filter(s => s === "negative").length;
      const neutral = sentiments.filter(s => s === "neutral").length;
      const dominant = pos >= neg && pos > 0 ? "positive" : neg > pos ? "negative" : sentiments.length > 0 ? "neutral" : null;

      let totalVolumeMin = 0;
      let totalVolumeMax = 0;
      let hasVolume = false;
      for (const qId of questionIds) {
        const vol = volumeByQuestion[qId];
        if (vol) {
          totalVolumeMin += vol.min;
          totalVolumeMax += vol.max;
          hasVolume = true;
        }
      }

      return {
        questions: questionIds.size,
        totalRuns: total,
        appearances: appeared,
        appearanceRate: total > 0 ? Math.round((appeared / total) * 100) : 0,
        sentiment: dominant,
        sentimentBreakdown: { positive: pos, negative: neg, neutral },
        estSearches: hasVolume ? formatVolume(totalVolumeMin, totalVolumeMax) : null,
      };
    }

    return {
      nonBrand: computeStats(userQuestionRuns, "user_question"),
      brand: computeStats(brandSentimentRuns, "brand_sentiment"),
    };
  }, [runs, questionCategoryMap, brandQuestions]);

  if (runsLoading) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rows = [
    { label: "Non-Brand Terms Visibility", desc: "Generic questions (no brand mention)", stats: summaryData.nonBrand, tab: "user_question" as const },
    { label: "Brand Terms Visibility", desc: "Questions mentioning your brand", stats: summaryData.brand, tab: "brand_sentiment" as const },
  ];

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionHeader
            title="Visibility Run Summary"
            subtitle="AI appearance and sentiment across your tracked terms"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/brand-settings?tab=terms">
              <Button variant="ghost" size="sm" data-testid="button-manage-terms-dashboard">
                <Tag className="h-4 w-4 mr-1.5" />
                Manage Terms
              </Button>
            </Link>
            <Link href="/visibility-report">
              <Button variant="outline" size="sm" data-testid="button-view-full-report">
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Full Report
              </Button>
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table data-testid="table-visibility-summary">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Category</TableHead>
                <TableHead className="text-center">Questions</TableHead>
                <TableHead className="text-center">Total Runs</TableHead>
                <TableHead className="text-center">Appearances</TableHead>
                <TableHead className="text-center">Appearance Rate</TableHead>
                <TableHead className="text-center">Sentiment</TableHead>
                <TableHead className="text-center">Est. Searches/mo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ label, desc, stats, tab }) => (
                <TableRow key={tab} data-testid={`row-summary-${tab}`}>
                  <TableCell>
                    <div>
                      <span className="text-body font-medium text-foreground">{label}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-body font-medium text-foreground" data-testid={`text-questions-${tab}`}>
                      {stats.questions}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-body text-muted-foreground">{stats.totalRuns}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-body font-medium text-foreground" data-testid={`text-appearances-${tab}`}>
                      {stats.appearances}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <DataBadge
                      variant={stats.appearanceRate >= 50 ? "appeared" : stats.appearanceRate > 0 ? "neutral" : "missing"}
                      data-testid={`badge-rate-${tab}`}
                    >
                      {stats.appearanceRate}%
                    </DataBadge>
                  </TableCell>
                  <TableCell className="text-center">
                    {stats.sentiment ? (
                      <DataBadge
                        variant={stats.sentiment === "positive" ? "positive" : stats.sentiment === "negative" ? "negative" : "neutral"}
                      >
                        {stats.sentiment}
                      </DataBadge>
                    ) : (
                      <span className="text-body text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {stats.estSearches ? (
                      <span className="text-xs font-medium text-foreground" data-testid={`text-searches-${tab}`}>
                        {stats.estSearches}
                      </span>
                    ) : (
                      <span className="text-body text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/visibility-report?tab=${tab}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-details-${tab}`}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface DiscoveredCompetitor {
  name: string;
  domain?: string;
  mentionCount: number;
  lastSeen: string;
}

function DiscoveredCompetitorsSection({ brand }: { brand: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { limits, usage } = useSubscription();

  const discovered: DiscoveredCompetitor[] = useMemo(() => {
    const raw = brand.discoveredCompetitors;
    if (!Array.isArray(raw)) return [];
    const competitors = (brand.competitors || []) as string[];
    const competitorBases = new Set(
      competitors.map((c: string) =>
        c.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('.')[0]
      )
    );
    return (raw as DiscoveredCompetitor[]).filter(d => {
      const nameLower = d.name.toLowerCase().trim();
      const nameBase = nameLower.replace(/\.(com|org|net|co|io|ai|co\.uk|com\.au)$/i, '');
      return !competitorBases.has(nameLower) && !competitorBases.has(nameBase);
    });
  }, [brand.discoveredCompetitors, brand.competitors]);

  const currentCompetitors = brand.competitors ?? [];
  const competitorLimit = limits.competitors;
  const atLimit = competitorLimit !== null && currentCompetitors.length >= competitorLimit;

  const addMutation = useMutation({
    mutationFn: async (comp: DiscoveredCompetitor) => {
      const researchRes = await apiRequest("POST", "/api/brands/research-competitor-url", {
        url: comp.domain || comp.name,
        brandName: brand.companyName || brand.domain || "",
        category: brand.category || "",
      });
      if (!researchRes.ok) {
        const data = await researchRes.json();
        throw new Error(data.message || "Failed to research competitor");
      }
      const researched = await researchRes.json() as { name: string; domain: string; description: string };
      const domain = researched.domain?.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "");

      const isDuplicate = currentCompetitors.some(
        (c: string) => c.toLowerCase() === domain.toLowerCase()
      );
      if (isDuplicate) {
        throw new Error(`${domain} is already in your competitor list.`);
      }

      const newList = [...currentCompetitors, domain];
      const patchRes = await apiRequest("PATCH", `/api/brands/${brand.id}`, {
        competitors: newList,
      });
      if (!patchRes.ok) {
        const data = await patchRes.json();
        throw new Error(data.message || "Failed to add competitor");
      }

      await apiRequest("POST", `/api/brands/${brand.id}/dismiss-discovered`, {
        name: comp.name,
      });

      return { name: researched.name || domain, domain };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Competitor added", description: `${data.name} has been added to your tracked competitors.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add", description: err?.message || "Could not add competitor.", variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/brands/${brand.id}/dismiss-discovered`, { name });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not dismiss competitor.", variant: "destructive" });
    },
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brands/${brand.id}/extract-discovered`, {});
      if (!res.ok) throw new Error("Failed to extract");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Discovery complete", description: "Checked AI responses for competitor mentions." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not discover competitors from AI responses.", variant: "destructive" });
    },
  });

  if (discovered.length === 0) {
    return (
      <Card data-testid="section-discovered-competitors-empty">
        <CardContent className="p-4 sm:p-6">
          <SectionHeader
            title="Discovered Competitors"
            subtitle="Find brands mentioned alongside yours in AI responses"
            className="mb-4"
          />
          <Button
            variant="outline"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            data-testid="button-discover-competitors"
          >
            {extractMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning AI responses...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Discover Competitors from AI Responses</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="section-discovered-competitors">
      <CardContent className="p-4 sm:p-6">
        <SectionHeader
          title="Discovered Competitors"
          subtitle="Brands mentioned alongside yours in AI responses — add them to track or dismiss"
          className="mb-4"
        />
        <div className="flex flex-wrap gap-2">
          {discovered.map((comp) => {
            const isAdding = addMutation.isPending && addMutation.variables?.name === comp.name;
            const isDismissing = dismissMutation.isPending && dismissMutation.variables === comp.name;

            return (
              <div key={comp.name} className="flex items-center gap-1" data-testid={`discovered-competitor-${comp.name}`}>
                <Badge
                  variant="outline"
                  className={`cursor-pointer ${atLimit ? "opacity-60" : ""}`}
                  onClick={() => {
                    if (atLimit) {
                      toast({ title: "Competitor limit reached", description: "Upgrade your plan or add a Competitor Pack to track more competitors.", variant: "destructive" });
                      return;
                    }
                    if (!isAdding) addMutation.mutate(comp);
                  }}
                  data-testid={`button-add-discovered-${comp.name}`}
                >
                  {isAdding ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <UserPlus className="h-3 w-3 mr-1" />
                  )}
                  {comp.name}
                  <span className="ml-1 text-muted-foreground">({comp.mentionCount})</span>
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    if (!isDismissing) dismissMutation.mutate(comp.name);
                  }}
                  disabled={isDismissing}
                  data-testid={`button-dismiss-discovered-${comp.name}`}
                >
                  {isDismissing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { subscription, trialEnd, isInTrial } = useSubscription();

  const { activeBrand: brand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();

  const { data: allTrackedTerms } = useQuery<TrackedTerm[]>({
    queryKey: ["/api/tracked-terms"],
    enabled: !!user,
    staleTime: 30000,
  });

  const trackedTerms = useMemo(() => {
    if (!allTrackedTerms) return undefined;
    if (!brandId) return allTrackedTerms;
    return allTrackedTerms.filter(t => t.brandId === brandId);
  }, [allTrackedTerms, brandId]);

  const { data: allRuns, isLoading: runsLoading } = useQuery<VisibilityRun[]>({
    queryKey: ["/api/brands", brandId, "visibility-runs", "all"],
    queryFn: async () => {
      const url = `/api/brands/${brandId}/visibility-runs`;
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

  const questionCategoryMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (brandQuestions) {
      for (const q of brandQuestions) {
        map[q.id] = q.questionCategory || "user_question";
      }
    }
    return map;
  }, [brandQuestions]);

  const { data: weaknessSummary } = useQuery<{ brandWeaknessCount: number; competitorWeaknessCount: number }>({
    queryKey: ["/api/brands", brandId, "weakness-summary"],
    enabled: !!brandId,
    staleTime: 5 * 60 * 1000,
  });

  const rescanMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/brands/${brandId}/scan`);
    },
    onSuccess: () => {
      toast({ title: "Rescan started", description: "All user questions are being re-processed across ChatGPT, Claude, Gemini, and Perplexity. This may take a few minutes." });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
    onError: (error: unknown) => {
      toast({
        title: isAiUsageCapError(error) ? "AI allowance reached" : "Rescan failed",
        description: getApiErrorMessage(error, "Could not start the rescan. Please try again."),
        variant: "destructive",
      });
    },
  });

  const generateTermsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brands/${brandId}/generate-terms`);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });

      if (data.created && data.created.length > 0) {
        const termIds = data.created.map((t: { id: number; term: string }) => t.id);
        toast({
          title: `${data.count} key terms created`,
          description: "Generating questions for your terms now...",
        });

        try {
          await apiRequest("POST", "/api/tracked-terms/generate-questions-bulk", {
            termIds,
            brandId,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "user-questions"] });
          toast({
            title: "Questions generated",
            description: "Your key terms and questions are ready. Starting a scan now.",
          });

          try {
            await apiRequest("POST", `/api/brands/${brandId}/scan`);
            queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
            toast({ title: "Scan started", description: "Your AI visibility scan is now running." });
          } catch {
            toast({ title: "Scan could not be started", description: "Please try running a scan manually.", variant: "destructive" });
          }
        } catch {
          toast({
            title: "Question generation failed",
            description: "Terms were created but questions could not be generated. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "No terms generated",
          description: "Please add terms manually from the Terms page.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to generate terms",
        description: "Could not auto-generate key terms. Please add them manually.",
        variant: "destructive",
      });
    },
  });

  const generateQuestionsMutation = useMutation({
    mutationFn: async () => {
      const activeTermIds = (allTrackedTerms || []).filter(t => t.brandId === brandId && t.isActive).map(t => t.id);
      const res = await apiRequest("POST", "/api/tracked-terms/generate-questions-bulk", {
        termIds: activeTermIds,
        brandId,
      });
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "user-questions"] });
      toast({
        title: "Questions generated",
        description: "Questions have been created for your key terms. Starting a scan now.",
      });
      try {
        await apiRequest("POST", `/api/brands/${brandId}/scan`);
        queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
        toast({ title: "Scan started", description: "Your AI visibility scan is now running." });
      } catch {
        toast({ title: "Scan could not be started", description: "Please try running a scan manually.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({
        title: "Question generation failed",
        description: "Could not generate questions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const questionOnlyRuns = useMemo(() => (allRuns ?? []).filter(r => r.userQuestionId != null), [allRuns]);

  const trendData = useMemo(() => buildTrendData(questionOnlyRuns), [questionOnlyRuns]);

  const totalRuns = questionOnlyRuns.length;
  const appearedRuns = questionOnlyRuns.filter((r) => r.appeared).length;
  const commercialRuns = questionOnlyRuns.filter((r) => r.promptType === "commercial");
  const commercialAppeared = commercialRuns.filter((r) => r.appeared).length;
  const categoryRuns = questionOnlyRuns.filter((r) => r.promptType === "consideration");
  const categoryAppeared = categoryRuns.filter((r) => r.appeared).length;

  const shareOfVoice = pct(appearedRuns, totalRuns);
  const commercialScore = pct(commercialAppeared, commercialRuns.length);
  const categoryScore = pct(categoryAppeared, categoryRuns.length);

  if (brandsLoading) {
    return (
      <PageShell title="Dashboard" subtitle="AI Visibility Overview">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <CardContent className="p-0 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell title="Dashboard" subtitle="AI Visibility Overview">
        <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />
        <EmptyState
          icon={BarChart2}
          heading="No brand configured yet"
          description="Complete onboarding to set up your brand and start tracking your AI visibility."
          action={{ label: "Set Up Your Brand", onClick: () => navigate("/onboarding") }}
        />
      </PageShell>
    );
  }

  const hasActiveTerms = trackedTerms && trackedTerms.filter(t => t.isActive).length > 0;
  const termsLoaded = trackedTerms !== undefined;

  if (termsLoaded && !hasActiveTerms) {
    return (
      <PageShell title="Dashboard" subtitle={`AI Visibility Overview — ${brand.domain}`}>
        <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />
        <div className="rounded-md border border-border bg-muted/30 px-4 sm:px-8 py-14 text-center max-w-xl mx-auto mt-8 space-y-4">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto">
            <Tag className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Add key terms to start tracking</h2>
          <p className="text-sm text-muted-foreground">
            Define the search queries you want to monitor across ChatGPT, Claude, Gemini, and Perplexity. For example: "best [your category] software for [your audience]". Results appear within 24 hours.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={() => generateTermsMutation.mutate()}
              disabled={generateTermsMutation.isPending}
              data-testid="button-generate-terms"
            >
              {generateTermsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {generateTermsMutation.isPending ? "Generating..." : "Auto-Generate Terms & Questions"}
            </Button>
            <Button variant="outline" asChild data-testid="link-add-terms-manual">
              <Link href="/terms">
                <Tag className="mr-2 h-4 w-4" />
                Add Manually
              </Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  const hasQuestions = brandQuestions && brandQuestions.length > 0;
  const questionsLoaded = brandQuestions !== undefined;

  if (hasActiveTerms && questionsLoaded && !hasQuestions) {
    return (
      <PageShell title="Dashboard" subtitle={`AI Visibility Overview — ${brand.domain}`}>
        <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />
        <div className="rounded-md border border-border bg-muted/30 px-4 sm:px-8 py-14 text-center max-w-xl mx-auto mt-8 space-y-4">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Questions need to be generated</h2>
          <p className="text-sm text-muted-foreground">
            Your key terms are set up, but questions haven't been generated yet. Generate questions to start tracking your AI visibility.
          </p>
          <Button
            onClick={() => generateQuestionsMutation.mutate()}
            disabled={generateQuestionsMutation.isPending}
            data-testid="button-generate-questions"
          >
            {generateQuestionsMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {generateQuestionsMutation.isPending ? "Generating..." : "Generate Questions & Start Scan"}
          </Button>
        </div>
      </PageShell>
    );
  }

  const scanFailed = !runsLoading && brand.scanStatus === "completed" && (!allRuns || allRuns.length === 0);
  const scanIdle = brand.scanStatus === "idle";
  const scanRunning = !!brand.scanStatus?.startsWith("running");
  const hasRunData = allRuns && allRuns.length > 0;

  if ((scanIdle && !hasRunData) || scanRunning || (!hasRunData && !scanFailed && !runsLoading)) {
    return (
      <PageShell
        title="Dashboard"
        subtitle={`AI Visibility Overview — ${brand.domain}`}
      >
        <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />
        <EmptyState
          icon={Eye}
          heading={scanRunning ? "Scan in progress..." : "No scan data yet"}
          description={
            scanRunning
              ? "Your AI visibility scan is currently running. Check back in a few minutes."
              : "Run a scan from the onboarding page to start collecting visibility data."
          }
          action={
            !scanRunning
              ? { label: "Go to Onboarding", onClick: () => navigate("/onboarding") }
              : undefined
          }
        />
      </PageShell>
    );
  }

  if (scanFailed) {
    return (
      <PageShell
        title="Dashboard"
        subtitle={`AI Visibility Overview — ${brand.domain}`}
      >
        <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />
        <div className="rounded-md border border-border bg-muted/30 px-4 sm:px-8 py-14 text-center max-w-xl mx-auto mt-8 space-y-4">
          <div className="w-12 h-12 rounded-md bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6 text-destructive" data-testid="icon-scan-failed" />
          </div>
          <h2 className="text-lg font-semibold" data-testid="heading-scan-failed">Scan completed with errors</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-scan-failed-description">
            Your last scan finished but wasn't able to collect visibility results from AI models. This can happen due to temporary API issues. Try running the scan again.
          </p>
          {user?.accountType !== "admin_provisioned" && (
            <Button
              onClick={() => rescanMutation.mutate()}
              disabled={rescanMutation.isPending || scanRunning}
              data-testid="button-retry-scan"
            >
              {rescanMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {rescanMutation.isPending ? "Starting scan..." : "Retry Scan"}
            </Button>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Dashboard"
      subtitle={`AI Visibility Overview — ${brand.domain}`}
      data-testid="page-dashboard"
    >
      <TrialCountdownBanner trialEnd={trialEnd} isInTrial={isInTrial} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div />
        {user?.accountType !== "admin_provisioned" && (
          <Button
            variant="outline"
            onClick={() => rescanMutation.mutate()}
            disabled={rescanMutation.isPending || !!brand.scanStatus?.startsWith("running")}
            data-testid="button-rescan"
          >
            {rescanMutation.isPending || brand.scanStatus?.startsWith("running") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {brand.scanStatus?.startsWith("running") ? "Scanning..." : "Rescan All Questions"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="section-score-cards">
        <AnimatedScoreCard
          icon={Eye}
          label="AI Share of Voice"
          value={pctNum(appearedRuns, totalRuns)}
          numerator={appearedRuns}
          denominator={totalRuns}
          color={chartColors[0]}
          description="Question runs returning your brand"
          delay={0}
          data-testid="metric-share-of-voice"
        />
        <AnimatedScoreCard
          icon={ShieldCheck}
          label="Commercial Score"
          value={pctNum(commercialAppeared, commercialRuns.length)}
          numerator={commercialAppeared}
          denominator={commercialRuns.length}
          color={chartColors[1]}
          description="Commercial intent questions"
          delay={200}
          data-testid="metric-commercial-score"
        />
        <AnimatedScoreCard
          icon={Award}
          label="Category Authority"
          value={pctNum(categoryAppeared, categoryRuns.length)}
          numerator={categoryAppeared}
          denominator={categoryRuns.length}
          color={chartColors[2]}
          description="Category comparison questions"
          delay={400}
          data-testid="metric-category-score"
        />
      </div>

      {(weaknessSummary?.brandWeaknessCount || weaknessSummary?.competitorWeaknessCount) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="section-weakness-counters">
          <Card
            className="p-4 hover-elevate cursor-pointer"
            data-testid="card-brand-weakness-counter"
            onClick={() => {
              navigate("/perception");
              setTimeout(() => {
                document.getElementById("weaknesses")?.scrollIntoView({ behavior: "smooth" });
              }, 300);
            }}
          >
            <CardContent className="p-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-red-500/10 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-label text-muted-foreground">Known Brand Weaknesses</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-brand-weakness-count">
                    {weaknessSummary.brandWeaknessCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Complaints and vulnerabilities found</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card
            className="p-4 hover-elevate cursor-pointer"
            data-testid="card-competitor-weakness-counter"
            onClick={() => {
              navigate("/competitors");
              setTimeout(() => {
                document.getElementById("weaknesses")?.scrollIntoView({ behavior: "smooth" });
              }, 300);
            }}
          >
            <CardContent className="p-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-500/10 shrink-0">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-label text-muted-foreground">Known Competitor Weaknesses</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-competitor-weakness-count">
                    {weaknessSummary.competitorWeaknessCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Exploitable across all competitors</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <CoreWebVitalsSection brandId={brand.id} />

      <AIFunnelAnalysis runs={questionOnlyRuns} questionCategoryMap={questionCategoryMap} />

      <CompetitorFunnels runs={questionOnlyRuns} competitors={brand.competitors ?? []} />

      <DiscoveredCompetitorsSection brand={brand} />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <SectionHeader
            title="30-Day Share of Voice Trend"
            subtitle="Daily AI visibility percentage across all user questions and models"
            className="mb-6"
          />
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-body">
              Not enough data for trend chart yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...defaultCartesianGridProps} />
                <XAxis dataKey="date" {...defaultXAxisProps} />
                <YAxis
                  {...defaultYAxisProps}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="shareOfVoice"
                  stroke={chartColors[0]}
                  connectNulls
                  {...defaultLineProps}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <VisibilityRunsSummary
        runs={questionOnlyRuns}
        questionCategoryMap={questionCategoryMap}
        brandQuestions={brandQuestions ?? []}
        runsLoading={runsLoading}
      />
    </PageShell>
  );
}
