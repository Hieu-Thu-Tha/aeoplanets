import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/contexts/BrandContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/ui/enterprise/PageShell";
import { PageHeading } from "@/components/ui/enterprise/PageHeading";
import { SectionHeader } from "@/components/ui/enterprise/SectionHeader";
import {
  Loader2,
  Smartphone,
  Monitor,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Play,
  Trophy,
  Crown,
  Building2,
  Globe,
} from "lucide-react";

interface AuditItem {
  score: number | null;
  value: number | null;
  unit: string | null;
  display: string | null;
}

interface CruxItem {
  percentile: number | null;
  category: string;
  distributions: { min: number; max?: number; proportion: number }[];
}

interface DetailedAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  value: number | null;
  unit: string | null;
  display: string | null;
  scoreDisplayMode: string | null;
}

interface CategoryAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  display: string | null;
  scoreDisplayMode: string | null;
  group: string | null;
  weight: number;
}

interface StrategyData {
  performanceScore: number | null;
  overallCategory: string;
  categories: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  lab: Record<string, AuditItem | null>;
  field: Record<string, CruxItem | null>;
  performanceOpportunities: DetailedAudit[];
  performanceDiagnostics: DetailedAudit[];
  accessibilityAudits: CategoryAudit[];
  seoAudits: CategoryAudit[];
  bestPracticesAudits: CategoryAudit[];
  error?: string;
}

interface PageSpeedData {
  domain: string;
  results: Record<string, StrategyData>;
  fetchedAt: string;
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

function getScoreBg(score: number | null) {
  if (score == null) return "bg-muted/10";
  if (score >= 90) return "bg-emerald-400/10";
  if (score >= 50) return "bg-amber-400/10";
  return "bg-red-400/10";
}

function ScoreRing({ score, size = 80, label }: { score: number | null; size?: number; label: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = score != null ? circumference - (score / 100) * circumference : circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-muted/30" strokeWidth="5" />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            className={getScoreRingColor(score)}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${getScoreColor(score)}`}>{score ?? "--"}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium text-center">{label}</span>
    </div>
  );
}

function ScoreIcon({ score }: { score: number | null }) {
  if (score == null) return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
  if (score >= 0.9) return <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (score >= 0.5) return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
}

function ScoreLabel({ score }: { score: number | null }) {
  if (score == null) return <Badge variant="secondary" className="text-xs">N/A</Badge>;
  if (score >= 0.9) return <Badge variant="secondary" className="text-xs text-emerald-400">Passed</Badge>;
  if (score >= 0.5) return <Badge variant="secondary" className="text-xs text-amber-400">Needs Work</Badge>;
  return <Badge variant="secondary" className="text-xs text-red-400">Failed</Badge>;
}

function DistributionBar({ crux }: { crux: CruxItem | null }) {
  if (!crux || !crux.distributions || crux.distributions.length === 0) return null;
  const [good, mid, poor] = crux.distributions;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      <div className="bg-emerald-400 rounded-l-full" style={{ width: `${(good?.proportion || 0) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(mid?.proportion || 0) * 100}%` }} />
      <div className="bg-red-400 rounded-r-full" style={{ width: `${(poor?.proportion || 0) * 100}%` }} />
    </div>
  );
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
  fcp: "First Contentful Paint marks the time at which the first text or image is painted. A fast FCP reassures users that something is happening.",
  lcp: "Largest Contentful Paint marks the time at which the largest text or image is painted. It measures the main content loading speed users perceive.",
  cls: "Cumulative Layout Shift measures the movement of visible elements within the viewport. Low CLS means the page is visually stable as it loads.",
  tbt: "Total Blocking Time is the total amount of time between FCP and TTI where the main thread was blocked long enough to prevent input responsiveness.",
  si: "Speed Index shows how quickly the contents of a page are visibly populated. It captures how fast your page looks to load visually.",
  tti: "Time to Interactive is the time it takes for the page to become fully interactive. This means event handlers are registered and the page responds to user interactions within 50ms.",
  serverResponseTime: "Time to First Byte (TTFB) identifies the time at which your server sends a response. A low server response time means your server is fast.",
  maxFid: "Max Potential First Input Delay estimates how long users might wait before the browser can respond to their first interaction with the page.",
  inp: "Interaction to Next Paint measures the latency of every click, tap, and keyboard interaction throughout the page lifecycle. It is the new Core Web Vital replacing FID.",
  ttfb: "Time to First Byte measures the time it takes for the network to respond to a user request with the first byte of a resource. Low TTFB is critical for fast page loads.",
};

const METRIC_LABELS: Record<string, string> = {
  fcp: "First Contentful Paint",
  lcp: "Largest Contentful Paint",
  cls: "Cumulative Layout Shift",
  tbt: "Total Blocking Time",
  si: "Speed Index",
  tti: "Time to Interactive",
  serverResponseTime: "Server Response Time (TTFB)",
  maxFid: "Max Potential FID",
};

function CollapsibleSection({ title, count, children, defaultOpen = false }: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 hover-elevate rounded-md px-2"
        data-testid={`button-toggle-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function AuditRow({ audit }: { audit: DetailedAudit | CategoryAudit }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0" data-testid={`audit-${audit.id}`}>
      <ScoreIcon score={audit.score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{audit.title}</span>
          {audit.display && (
            <Badge variant="secondary" className="text-xs">{audit.display}</Badge>
          )}
          <ScoreLabel score={audit.score} />
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{audit.description}</p>
      </div>
    </div>
  );
}

function MetricRow({ metricKey, audit, crux }: {
  metricKey: string;
  audit: AuditItem | null;
  crux: CruxItem | null;
}) {
  const label = METRIC_LABELS[metricKey] || metricKey;
  const description = METRIC_DESCRIPTIONS[metricKey] || "";
  const cat = crux?.category || (audit?.score != null ? (audit.score >= 0.9 ? "fast" : audit.score >= 0.5 ? "average" : "slow") : "unknown");

  return (
    <div className="py-3 border-b border-border/50 last:border-0" data-testid={`metric-${metricKey}`}>
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cat === "fast" ? "bg-emerald-400" : cat === "average" ? "bg-amber-400" : cat === "slow" ? "bg-red-400" : "bg-muted"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <div className="flex items-center gap-2">
              {audit?.display && (
                <span className="text-sm font-semibold text-foreground">{audit.display}</span>
              )}
              {crux && crux.percentile != null && (
                <Badge variant="secondary" className="text-xs">
                  p75: {metricKey === "cls" ? (crux.percentile / 100).toFixed(2) : `${(crux.percentile / 1000).toFixed(1)}s`}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          {crux && (
            <div className="mt-2">
              <DistributionBar crux={crux} />
              <div className="flex justify-between gap-2 mt-1">
                <span className="text-[10px] text-emerald-400">Good {crux.distributions?.[0] ? `${Math.round(crux.distributions[0].proportion * 100)}%` : ""}</span>
                <span className="text-[10px] text-amber-400">Needs Work {crux.distributions?.[1] ? `${Math.round(crux.distributions[1].proportion * 100)}%` : ""}</span>
                <span className="text-[10px] text-red-400">Poor {crux.distributions?.[2] ? `${Math.round(crux.distributions[2].proportion * 100)}%` : ""}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldMetricRow({ label, crux, description }: { label: string; crux: CruxItem | null; description: string }) {
  if (!crux) return null;
  const cat = crux.category;
  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cat === "fast" || cat === "good" ? "bg-emerald-400" : cat === "average" || cat === "needs_improvement" ? "bg-amber-400" : "bg-red-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {crux.percentile != null && (
              <Badge variant="secondary" className="text-xs">
                p75: {label.includes("CLS") ? (crux.percentile / 100).toFixed(2) : `${(crux.percentile / 1000).toFixed(1)}s`}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          <div className="mt-2">
            <DistributionBar crux={crux} />
            <div className="flex justify-between gap-2 mt-1">
              <span className="text-[10px] text-emerald-400">Good {crux.distributions?.[0] ? `${Math.round(crux.distributions[0].proportion * 100)}%` : ""}</span>
              <span className="text-[10px] text-amber-400">Needs Work {crux.distributions?.[1] ? `${Math.round(crux.distributions[1].proportion * 100)}%` : ""}</span>
              <span className="text-[10px] text-red-400">Poor {crux.distributions?.[2] ? `${Math.round(crux.distributions[2].proportion * 100)}%` : ""}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyView({ data }: { data: StrategyData }) {
  const cats = data.categories;
  const lab = data.lab || {};
  const field = data.field || {};
  const opportunities = (data.performanceOpportunities || []).filter((a: DetailedAudit) => a.score !== null && a.score < 1);
  const diagnostics = (data.performanceDiagnostics || []).filter((a: DetailedAudit) => a.score !== null && a.score < 1);
  const accessibilityFailing = (data.accessibilityAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score < 1);
  const accessibilityPassing = (data.accessibilityAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score >= 1);
  const seoFailing = (data.seoAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score < 1);
  const seoPassing = (data.seoAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score >= 1);
  const bpFailing = (data.bestPracticesAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score < 1);
  const bpPassing = (data.bestPracticesAudits || []).filter((a: CategoryAudit) => a.score !== null && a.score >= 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ScoreRing score={cats?.performance ?? data.performanceScore} label="Performance" />
        <ScoreRing score={cats?.accessibility ?? null} label="Accessibility" />
        <ScoreRing score={cats?.bestPractices ?? null} label="Best Practices" />
        <ScoreRing score={cats?.seo ?? null} label="SEO" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Core Web Vitals</h3>
          <div className="divide-y divide-border/50">
            <MetricRow metricKey="lcp" audit={lab.lcp} crux={field.lcp} />
            <MetricRow metricKey="fcp" audit={lab.fcp} crux={field.fcp} />
            <MetricRow metricKey="cls" audit={lab.cls} crux={field.cls} />
            <MetricRow metricKey="tbt" audit={lab.tbt} crux={null} />
            <MetricRow metricKey="si" audit={lab.si} crux={null} />
            <MetricRow metricKey="tti" audit={lab.tti} crux={null} />
            <MetricRow metricKey="serverResponseTime" audit={lab.serverResponseTime} crux={null} />
            <MetricRow metricKey="maxFid" audit={lab.maxFid} crux={null} />
          </div>
        </CardContent>
      </Card>

      {(field.inp || field.ttfb) && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Field Data (Real User Metrics)</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Chrome User Experience Report (CrUX) data from real users visiting this site. The 75th percentile (p75) value is shown.
            </p>
            <div className="divide-y divide-border/50">
              <FieldMetricRow label="Interaction to Next Paint (INP)" crux={field.inp || null} description={METRIC_DESCRIPTIONS.inp} />
              <FieldMetricRow label="Time to First Byte (TTFB)" crux={field.ttfb || null} description={METRIC_DESCRIPTIONS.ttfb} />
              <FieldMetricRow label="Largest Contentful Paint" crux={field.lcp || null} description="Real-user LCP measurements showing how quickly the main content loads for actual visitors." />
              <FieldMetricRow label="First Contentful Paint" crux={field.fcp || null} description="Real-user FCP measurements showing how quickly the first content appears for actual visitors." />
              <FieldMetricRow label="Cumulative Layout Shift" crux={field.cls || null} description="Real-user CLS measurements showing visual stability experienced by actual visitors." />
            </div>
          </CardContent>
        </Card>
      )}

      {opportunities.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <CollapsibleSection title="Performance Opportunities" count={opportunities.length} defaultOpen={true}>
              <p className="text-xs text-muted-foreground mb-3">
                These suggestions can help your page load faster. They do not directly affect the Performance score, but improving them often leads to better user experience.
              </p>
              {opportunities.map((audit) => (
                <AuditRow key={audit.id} audit={audit} />
              ))}
            </CollapsibleSection>
          </CardContent>
        </Card>
      )}

      {diagnostics.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <CollapsibleSection title="Performance Diagnostics" count={diagnostics.length} defaultOpen={false}>
              <p className="text-xs text-muted-foreground mb-3">
                More information about the performance of your application. These diagnostics provide insight into areas that may benefit from optimisation.
              </p>
              {diagnostics.map((audit) => (
                <AuditRow key={audit.id} audit={audit} />
              ))}
            </CollapsibleSection>
          </CardContent>
        </Card>
      )}

      {(accessibilityFailing.length > 0 || accessibilityPassing.length > 0) && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Accessibility</h3>
              <Badge variant="secondary" className={`text-xs ${getScoreColor(cats?.accessibility ?? null)}`}>
                {cats?.accessibility ?? "--"}/100
              </Badge>
            </div>
            {accessibilityFailing.length > 0 && (
              <CollapsibleSection title="Issues to Fix" count={accessibilityFailing.length} defaultOpen={true}>
                {accessibilityFailing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
            {accessibilityPassing.length > 0 && (
              <CollapsibleSection title="Passed Audits" count={accessibilityPassing.length} defaultOpen={false}>
                {accessibilityPassing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
          </CardContent>
        </Card>
      )}

      {(seoFailing.length > 0 || seoPassing.length > 0) && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground">SEO</h3>
              <Badge variant="secondary" className={`text-xs ${getScoreColor(cats?.seo ?? null)}`}>
                {cats?.seo ?? "--"}/100
              </Badge>
            </div>
            {seoFailing.length > 0 && (
              <CollapsibleSection title="Issues to Fix" count={seoFailing.length} defaultOpen={true}>
                {seoFailing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
            {seoPassing.length > 0 && (
              <CollapsibleSection title="Passed Audits" count={seoPassing.length} defaultOpen={false}>
                {seoPassing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
          </CardContent>
        </Card>
      )}

      {(bpFailing.length > 0 || bpPassing.length > 0) && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Best Practices</h3>
              <Badge variant="secondary" className={`text-xs ${getScoreColor(cats?.bestPractices ?? null)}`}>
                {cats?.bestPractices ?? "--"}/100
              </Badge>
            </div>
            {bpFailing.length > 0 && (
              <CollapsibleSection title="Issues to Fix" count={bpFailing.length} defaultOpen={true}>
                {bpFailing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
            {bpPassing.length > 0 && (
              <CollapsibleSection title="Passed Audits" count={bpPassing.length} defaultOpen={false}>
                {bpPassing.map((audit) => (
                  <AuditRow key={audit.id} audit={audit} />
                ))}
              </CollapsibleSection>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface BenchmarkScores {
  mobile: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  desktop: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
}

interface BenchmarkEntry {
  domain: string;
  scores: BenchmarkScores;
  data: PageSpeedData;
}

interface BenchmarkData {
  brand: BenchmarkEntry;
  competitors: BenchmarkEntry[];
  aiSummary: string;
  generatedAt: string;
}

function ScoreCell({ score, isBest }: { score: number | null; isBest: boolean }) {
  return (
    <div className={`text-center py-1.5 px-2 rounded ${isBest ? "bg-emerald-400/10" : ""}`}>
      <span className={`text-sm font-semibold ${getScoreColor(score)}`}>
        {score ?? "--"}
      </span>
      {isBest && score != null && (
        <Crown className="inline-block ml-1 h-3 w-3 text-emerald-400" />
      )}
    </div>
  );
}

function BenchmarkTable({ benchmark, strategy }: { benchmark: BenchmarkData; strategy: "mobile" | "desktop" }) {
  const categories = ["performance", "accessibility", "bestPractices", "seo"] as const;
  const categoryLabels = { performance: "Performance", accessibility: "Accessibility", bestPractices: "Best Practices", seo: "SEO" };

  const allEntries = [
    { domain: benchmark.brand.domain, scores: benchmark.brand.scores, isBrand: true },
    ...benchmark.competitors.map(c => ({ domain: c.domain, scores: c.scores, isBrand: false })),
  ];

  function getBest(category: typeof categories[number]) {
    let best: number | null = null;
    let bestDomain = "";
    for (const entry of allEntries) {
      const val = entry.scores[strategy][category];
      if (val != null && (best === null || val > best)) {
        best = val;
        bestDomain = entry.domain;
      }
    }
    return bestDomain;
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          {strategy === "mobile" ? "Mobile" : "Desktop"} Benchmark Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`table-benchmark-${strategy}`}>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Site</th>
                {categories.map(cat => (
                  <th key={cat} className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">{categoryLabels[cat]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allEntries.map(entry => (
                <tr key={entry.domain} className={`border-b border-border/50 ${entry.isBrand ? "bg-primary/5" : ""}`}>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {entry.isBrand ? <Building2 className="h-3.5 w-3.5 text-primary shrink-0" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className={`text-sm truncate max-w-[160px] ${entry.isBrand ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {entry.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </span>
                      {entry.isBrand && <Badge variant="secondary" className="text-[10px]">You</Badge>}
                    </div>
                  </td>
                  {categories.map(cat => (
                    <td key={cat}>
                      <ScoreCell score={entry.scores[strategy][cat]} isBest={getBest(cat) === entry.domain} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BenchmarkSection({ benchmark }: { benchmark: BenchmarkData }) {
  const generatedDate = new Date(benchmark.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-6" data-testid="section-benchmark">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BenchmarkTable benchmark={benchmark} strategy="mobile" />
        <BenchmarkTable benchmark={benchmark} strategy="desktop" />
      </div>

      {benchmark.aiSummary && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              AI Performance Analysis
            </h3>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line" data-testid="text-ai-summary">
              {benchmark.aiSummary}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-4">Generated {generatedDate} by Gemini 3.1</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SiteDetailView({ psData, domain }: { psData: PageSpeedData; domain: string }) {
  const mobile = psData.results?.mobile;
  const desktop = psData.results?.desktop;
  const hasMobile = mobile && !mobile.error;
  const hasDesktop = desktop && !desktop.error;

  if (!hasMobile && !hasDesktop) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No data available for {domain}.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {hasMobile && hasDesktop ? (
        <Tabs defaultValue="mobile">
          <TabsList className="mb-6">
            <TabsTrigger value="mobile" data-testid={`tab-detail-mobile-${domain}`}>
              <Smartphone className="mr-2 h-3.5 w-3.5" />
              Mobile
            </TabsTrigger>
            <TabsTrigger value="desktop" data-testid={`tab-detail-desktop-${domain}`}>
              <Monitor className="mr-2 h-3.5 w-3.5" />
              Desktop
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mobile">
            <StrategyView data={mobile as StrategyData} />
          </TabsContent>
          <TabsContent value="desktop">
            <StrategyView data={desktop as StrategyData} />
          </TabsContent>
        </Tabs>
      ) : hasMobile ? (
        <StrategyView data={mobile as StrategyData} />
      ) : (
        <StrategyView data={desktop as StrategyData} />
      )}
    </div>
  );
}

interface JobStatus {
  status: "idle" | "running" | "complete" | "error" | "started" | "already_running";
  progress?: number;
  step?: string;
  currentDomain?: string | null;
  completedDomains?: string[];
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.max(progress, 3)}%` }}
      />
    </div>
  );
}

export default function WebVitalsPage() {
  usePageMeta({ title: "Core Web Vitals | AEOSTARS", description: "Comprehensive performance, accessibility, SEO, and best practices analysis" });
  const { activeBrandId, activeBrand } = useBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const pollingBrandRef = useRef<number | null>(null);
  const hasCheckedOnMount = useRef(false);

  const { data: brandPsData, isLoading } = useQuery<PageSpeedData>({
    queryKey: ["/api/brands", activeBrandId, "pagespeed"],
    enabled: !!activeBrandId,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const { data: benchmarkData } = useQuery<BenchmarkData | null>({
    queryKey: ["/api/brands", activeBrandId, "pagespeed-benchmark"],
    enabled: !!activeBrandId,
    staleTime: 5 * 1000,
    retry: 1,
  });

  const competitors = (activeBrand?.competitors as string[]) || [];

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollingBrandRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (pollingBrandRef.current && pollingBrandRef.current !== activeBrandId) {
      stopPolling();
      setJobStatus({ status: "idle" });
      hasCheckedOnMount.current = false;
    }
  }, [activeBrandId, stopPolling]);

  const startPolling = useCallback((brandId: number) => {
    stopPolling();
    pollingBrandRef.current = brandId;
    let attempts = 0;
    const maxAttempts = 200;

    pollIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current || pollingBrandRef.current !== brandId) {
        stopPolling();
        return;
      }
      attempts++;
      if (attempts > maxAttempts) {
        if (mountedRef.current) {
          toast({ title: "Report timed out", description: "The report is taking longer than expected. It will appear when ready.", variant: "destructive" });
          setJobStatus({ status: "idle" });
        }
        stopPolling();
        return;
      }

      try {
        const res = await fetch(`/api/brands/${brandId}/pagespeed-benchmark/status`);
        if (!res.ok) return;
        const status: JobStatus = await res.json();
        if (!mountedRef.current || pollingBrandRef.current !== brandId) return;

        setJobStatus(status);

        if (status.status === "running" && (status.completedDomains?.length ?? 0) > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "pagespeed-benchmark"] });
          queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "pagespeed"] });
        }

        if (status.status === "complete") {
          stopPolling();
          await queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "pagespeed-benchmark"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "pagespeed"] });
          if (mountedRef.current) {
            toast({ title: "Benchmark report ready", description: `Compared your brand against ${competitors.length} competitor${competitors.length !== 1 ? "s" : ""}` });
            setJobStatus({ status: "idle" });
          }
        } else if (status.status === "error") {
          stopPolling();
          if (mountedRef.current) {
            toast({ title: "Report generation failed", description: status.step || "Something went wrong. Please try again.", variant: "destructive" });
            setJobStatus({ status: "idle" });
          }
        }
      } catch {
      }
    }, 3000);
  }, [stopPolling, queryClient, toast, competitors.length]);

  useEffect(() => {
    if (!activeBrandId || hasCheckedOnMount.current) return;
    hasCheckedOnMount.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/brands/${activeBrandId}/pagespeed-benchmark/status`);
        if (!res.ok) return;
        const status: JobStatus = await res.json();
        if (!mountedRef.current) return;
        if (status.status === "running" || status.status === "started" || status.status === "already_running") {
          setJobStatus(status);
          startPolling(activeBrandId);
        }
      } catch {
      }
    })();
  }, [activeBrandId, startPolling]);

  const handleGenerateReport = async () => {
    if (!activeBrandId) return;
    const brandDomainName = activeBrand?.domain || "your brand";
    setJobStatus({ status: "running", progress: 0, step: `Fetching insights for ${brandDomainName}...`, currentDomain: brandDomainName, completedDomains: [] });
    try {
      const res = await fetch(`/api/brands/${activeBrandId}/pagespeed-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message || `Failed: ${res.status}`);
      }
      const result = await res.json();
      if (result.status === "started" || result.status === "already_running") {
        startPolling(activeBrandId);
      }
    } catch (e: any) {
      toast({ title: "Could not start report", description: e?.message || "Please try again", variant: "destructive" });
      setJobStatus({ status: "idle" });
    }
  };

  const isRunning = jobStatus.status === "running" || jobStatus.status === "started" || jobStatus.status === "already_running" || pollingBrandRef.current !== null;

  if (!activeBrandId) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>Select a brand to view Core Web Vitals.</p>
        </div>
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <SectionHeader title="Core Web Vitals" subtitle="Comprehensive site performance analysis" />
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading performance data...</span>
        </div>
      </PageShell>
    );
  }

  const brandDomain = activeBrand?.domain || "";
  const benchmarkDate = benchmarkData?.generatedAt ? new Date(benchmarkData.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const isPartial = !!(benchmarkData as any)?.partial;

  const siteTabEntries: { key: string; label: string; domain: string; data: PageSpeedData | null; isBrand: boolean }[] = [
    { key: "brand", label: brandDomain.replace(/^https?:\/\//, '').replace(/\/$/, '') || "My Brand", domain: brandDomain, data: brandPsData || null, isBrand: true },
  ];

  if (benchmarkData) {
    for (const comp of benchmarkData.competitors) {
      const cleanDomain = comp.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      siteTabEntries.push({
        key: `comp-${cleanDomain}`,
        label: cleanDomain,
        domain: comp.domain,
        data: comp.data as PageSpeedData,
        isBrand: false,
      });
    }
  }

  const completedDomains = jobStatus.completedDomains || [];
  const currentDomain = jobStatus.currentDomain;
  const allDomains = [brandDomain, ...competitors];

  return (
    <PageShell>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <PageHeading
              title="Core Web Vitals"
              subtitle={`Analyse your site performance against ${competitors.length > 0 ? `${competitors.length} competitor${competitors.length !== 1 ? "s" : ""}` : "competitors"}`}
              headingClassName="text-xl font-semibold text-foreground tracking-tight"
              headingTestId="text-page-title"
              subtitleClassName="text-sm text-muted-foreground mt-1"
            />
            {benchmarkDate && !isRunning && !isPartial && (
              <p className="text-xs text-muted-foreground/60 mt-1">Last report: {benchmarkDate}</p>
            )}
          </div>
          <Button
            onClick={handleGenerateReport}
            disabled={isRunning}
            data-testid="button-generate-benchmark"
          >
            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Generate Report
          </Button>
        </div>

        {isRunning && (
          <Card className="mt-4 border-primary/20" data-testid="card-progress">
            <CardContent className="py-5 px-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground">Generating Report</p>
                </div>
                {jobStatus.progress != null && (
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{jobStatus.progress}%</span>
                )}
              </div>
              <ProgressBar progress={jobStatus.progress ?? 0} />

              <div className="mt-4 space-y-1.5">
                {allDomains.map((domain) => {
                  const isCompleted = completedDomains.includes(domain);
                  const isCurrent = currentDomain === domain;
                  const isPending = !isCompleted && !isCurrent;
                  return (
                    <div key={domain} className="flex items-center gap-2.5" data-testid={`progress-domain-${domain}`}>
                      {isCompleted ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                      )}
                      <span className={`text-xs ${isCompleted ? "text-muted-foreground" : isCurrent ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>
                        {isCurrent ? `Fetching insights for ${domain}...` : isPending ? domain : `${domain}`}
                      </span>
                      {isCompleted && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-emerald-600 border-emerald-500/30">Done</Badge>
                      )}
                    </div>
                  );
                })}
                {jobStatus.step?.includes("AI analysis") && (
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    <span className="text-xs text-foreground font-medium">Generating AI analysis...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {benchmarkData && !isPartial && (
        <div className="mb-8">
          <BenchmarkSection benchmark={benchmarkData} />
        </div>
      )}

      <Tabs defaultValue="brand">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          {siteTabEntries.map(entry => (
            <TabsTrigger key={entry.key} value={entry.key} data-testid={`tab-site-${entry.key}`}>
              {entry.isBrand ? <Building2 className="mr-1.5 h-3.5 w-3.5" /> : <Globe className="mr-1.5 h-3.5 w-3.5" />}
              <span className="truncate max-w-[120px]">{entry.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {siteTabEntries.map(entry => (
          <TabsContent key={entry.key} value={entry.key}>
            {entry.data ? (
              <SiteDetailView psData={entry.data} domain={entry.domain} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {isRunning && currentDomain === entry.domain
                      ? `Fetching insights for ${entry.domain}...`
                      : isRunning
                        ? "Waiting to analyse this site..."
                        : entry.isBrand
                          ? "No data yet. Click Generate Report to run a full analysis."
                          : "Click Generate Report to analyse this competitor."}
                  </p>
                  {isRunning && (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mt-3" />
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
