import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import { PageShell, ScoreRing, EmptyState, DataBadge, SectionHeader } from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Globe,
  Loader2,
  ChevronDown,
  FileSearch,
  Info,
  Target,
  Search,
  Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ReadabilityAudit } from "@shared/schema";

interface AuditCheckDetail {
  name: string;
  status: "pass" | "fail" | "warning";
  whatIsThis?: string;
  howItShouldWork?: string;
  currentState?: string;
  whatToFix?: string;
  suggestion?: string;
  spaWarning?: string;
}

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success-muted",
    label: "Pass",
    border: "border-success/20",
  },
  fail: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Fail",
    border: "border-destructive/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning-muted",
    label: "Warning",
    border: "border-warning/20",
  },
};

function DetailSection({
  icon: Icon,
  title,
  content,
}: {
  icon: typeof Info;
  title: string;
  content: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed pl-5.5">{content}</p>
    </div>
  );
}

function extractVerdict(check: AuditCheckDetail): string {
  const name = check.name.toLowerCase();
  if (check.status === "pass") {
    if (name.includes("schema") || name.includes("canonical") || name.includes("meta")) {
      return "Detected and implemented";
    }
    if (name.includes("author") || name.includes("e-e-a-t")) return "Author signals present";
    if (name.includes("internal linking")) return "Well-structured linking found";
    if (name.includes("comparison") || name.includes("alternative")) return "Comparison content found";
    if (name.includes("performance") || name.includes("core web")) return "Performance within thresholds";
    if (name.includes("freshness")) return "Content recently updated";
    if (name.includes("social proof") || name.includes("trust")) return "Trust signals present";
    if (name.includes("crawl")) return "AI bots can access site";
    return "Implemented correctly";
  }
  if (check.status === "fail") {
    if (name.includes("schema")) return "Not detected on site";
    if (name.includes("author") || name.includes("e-e-a-t")) return "No author signals found";
    if (name.includes("internal linking")) return "Poor or missing linking structure";
    if (name.includes("comparison") || name.includes("alternative")) return "No comparison content found";
    if (name.includes("canonical")) return "Not implemented or misconfigured";
    if (name.includes("meta")) return "Missing or poorly written";
    if (name.includes("performance") || name.includes("core web")) return "Below acceptable thresholds";
    if (name.includes("freshness")) return "Content appears stale";
    if (name.includes("social proof") || name.includes("trust")) return "No trust signals found";
    if (name.includes("crawl")) return "AI bots are blocked";
    return "Not implemented";
  }
  if (name.includes("schema")) return "Partially implemented";
  if (name.includes("performance") || name.includes("core web")) return "Some metrics need attention";
  return "Needs improvement";
}

function ChecklistItem({ check, index }: { check: AuditCheckDetail; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[check.status];
  const StatusIcon = config.icon;
  const verdict = extractVerdict(check);

  const hasDetails = check.whatIsThis || check.howItShouldWork || check.currentState || check.whatToFix;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={`rounded-md border ${isOpen ? config.border : "border-border/50"} bg-card transition-colors`}
        data-testid={`audit-check-${index}`}
      >
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center gap-4 p-4 text-left hover-elevate rounded-md"
            data-testid={`button-toggle-check-${index}`}
          >
            <div
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${config.bg}`}
            >
              <StatusIcon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-sm font-medium text-foreground"
                  data-testid={`check-name-${index}`}
                >
                  {check.name}
                </span>
                <DataBadge
                  variant={
                    check.status === "pass"
                      ? "appeared"
                      : check.status === "fail"
                        ? "missing"
                        : "warning"
                  }
                >
                  {config.label}
                </DataBadge>
              </div>
              <p className={`text-xs mt-1 ${config.color}`} data-testid={`check-verdict-${index}`}>
                {verdict}
              </p>
            </div>
            {hasDetails && (
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            )}
          </button>
        </CollapsibleTrigger>

        {hasDetails && (
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border/30 mt-0 pt-4 ml-6 sm:ml-12 mr-2">
              {check.spaWarning && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/90 leading-relaxed">{check.spaWarning}</p>
                </div>
              )}
              {check.whatIsThis && (
                <DetailSection icon={Info} title="What is this?" content={check.whatIsThis} />
              )}
              {check.howItShouldWork && (
                <DetailSection
                  icon={Target}
                  title="How it should work"
                  content={check.howItShouldWork}
                />
              )}
              {check.currentState && (
                <DetailSection
                  icon={Search}
                  title="Where you are today"
                  content={check.currentState}
                />
              )}
              {check.whatToFix && (
                <DetailSection
                  icon={Wrench}
                  title={check.status === "pass" ? "What you're doing well" : "What to fix"}
                  content={check.whatToFix}
                />
              )}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

function ScoreSummary({ score }: { score: number }) {
  const label =
    score >= 70
      ? "Good — your site is well-structured for AI comprehension."
      : score >= 40
        ? "Needs improvement — several signals are missing that AI models rely on."
        : "Poor — major technical gaps detected. Address these to improve AI inclusion.";

  const variant = score >= 70 ? "appeared" : score >= 40 ? "warning" : "missing";

  return (
    <Card data-testid="score-summary-card">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreRing value={score} size={160} strokeWidth={14} />
          <div className="space-y-3 text-center sm:text-left">
            <div>
              <p className="text-label text-muted-foreground uppercase tracking-wide">
                Technical Brand Score
              </p>
              <p className="text-display text-foreground" data-testid="audit-score-value">
                {score}
                <span className="text-heading text-muted-foreground"> / 100</span>
              </p>
            </div>
            <DataBadge variant={variant}>
              {score >= 70 ? "Good" : score >= 40 ? "Needs Improvement" : "Poor"}
            </DataBadge>
            <p
              className="text-body text-muted-foreground max-w-sm"
              data-testid="audit-score-label"
            >
              {label}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Audit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAuditing, setIsAuditing] = useState(false);

  const { activeBrand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();
  const brandDomain = activeBrand?.domain;

  const { data: audit, isLoading: auditLoading } = useQuery<ReadabilityAudit | null>({
    queryKey: ["/api/brands", brandId, "readability-audit"],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/readability-audit`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!brandId,
  });

  async function runAudit() {
    if (!brandId) return;
    setIsAuditing(true);
    try {
      const res = await apiRequest("POST", `/api/brands/${brandId}/audit`);
      const data = await res.json();
      await queryClient.invalidateQueries({
        queryKey: ["/api/brands", brandId, "readability-audit"],
      });

      if (data.success) {
        toast({
          title: "Audit complete",
          description: "Your technical brand audit results are ready.",
        });
      } else {
        toast({
          title: "Audit completed with issues",
          description:
            data.error || "Could not fully audit your site. Check the results below.",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      toast({
        title: isAiUsageCapError(error) ? "AI allowance reached" : "Audit failed",
        description: getApiErrorMessage(error, "Something went wrong"),
        variant: "destructive",
      });
    } finally {
      setIsAuditing(false);
    }
  }

  const isLoading = brandsLoading || auditLoading;
  const checks: AuditCheckDetail[] = Array.isArray((audit as any)?.checks)
    ? (audit as any).checks
    : [];

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;

  const actions = (
    <Button onClick={runAudit} disabled={isAuditing || !brandId} data-testid="button-run-audit">
      {isAuditing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Analysing site...
        </>
      ) : (
        <>
          <Play className="w-4 h-4 mr-2" />
          Run AI Audit
        </>
      )}
    </Button>
  );

  if (isLoading) {
    return (
      <PageShell
        title="Technical Brand Audit"
        subtitle="AI-powered technical assessment of your site's structure, schema, and AI visibility signals"
        actions={actions}
      >
        <Skeleton className="h-52 w-full rounded-md" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!brandId) {
    return (
      <PageShell
        title="Technical Brand Audit"
        subtitle="AI-powered technical assessment of your site's structure, schema, and AI visibility signals"
      >
        <EmptyState
          icon={FileSearch}
          heading="No brand set up"
          description="Complete onboarding to set up your brand before running an audit."
          action={{
            label: "Set Up Brand",
            onClick: () => {
              window.location.href = "/onboarding";
            },
          }}
        />
      </PageShell>
    );
  }

  if (isAuditing) {
    return (
      <PageShell
        title="Technical Brand Audit"
        subtitle="AI-powered technical assessment of your site's structure, schema, and AI visibility signals"
      >
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center" data-testid="audit-loading-animation">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Globe className="w-12 h-12 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3
                  className="text-lg font-semibold"
                  data-testid="text-audit-progress"
                >
                  Running AI-powered audit...
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Fetching robots.txt, ai.txt, llms.txt and Core Web Vitals data directly,
                  then using AI with Google Search grounding to research {brandDomain} across
                  12 technical signals. This typically takes 45-90 seconds.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!audit) {
    return (
      <PageShell
        title="Technical Brand Audit"
        subtitle="AI-powered technical assessment of your site's structure, schema, and AI visibility signals"
        actions={actions}
      >
        <EmptyState
          icon={FileSearch}
          heading="No audit data yet"
          description="Run an AI-powered audit to assess your site's technical signals. Each check uses live Google Search grounding to research your actual website and provide specific, actionable findings."
          action={{
            label: "Run AI Audit",
            onClick: runAudit,
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Technical Brand Audit"
      subtitle="AI-powered technical assessment of your site's structure, schema, and AI visibility signals"
      actions={actions}
    >
      <ScoreSummary score={(audit as any).score ?? 0} />

      <Card data-testid="audit-stats-card">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1" data-testid="stat-pass-count">
              <span className="text-label text-muted-foreground uppercase tracking-wide">
                Passing
              </span>
              <span className="text-display text-success">{passCount}</span>
            </div>
            <div className="flex flex-col gap-1" data-testid="stat-fail-count">
              <span className="text-label text-muted-foreground uppercase tracking-wide">
                Failing
              </span>
              <span className="text-display text-destructive">{failCount}</span>
            </div>
            <div className="flex flex-col gap-1" data-testid="stat-warning-count">
              <span className="text-label text-muted-foreground uppercase tracking-wide">
                Warnings
              </span>
              <span className="text-display text-warning">{warningCount}</span>
            </div>
            {(audit as any).lastUpdated && (
              <div
                className="flex flex-col gap-1 ml-auto"
                data-testid="stat-last-updated"
              >
                <span className="text-label text-muted-foreground uppercase tracking-wide">
                  Last Run
                </span>
                <span className="text-body text-foreground">
                  {new Date((audit as any).lastUpdated).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SectionHeader
        title="Technical Audit Checklist"
        subtitle="Click any check to see what it means, your current state, and specific actions to take"
      />

      {checks.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          heading="Checklist not available"
          description="The audit did not return any checklist items. Try running the audit again."
        />
      ) : (
        <div className="space-y-2" data-testid="checklist-container">
          {checks.map((check, i) => (
            <ChecklistItem key={check.name} check={check} index={i} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
