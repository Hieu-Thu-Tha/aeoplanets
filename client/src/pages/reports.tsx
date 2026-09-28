import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  PageShell,
  SectionHeader,
  EmptyState,
  DataBadge,
} from "@/components/ui/enterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { UpgradeGate } from "@/components/ui/UpgradeGate";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileText,
  BarChart2,
  Target,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  Sparkles,
  PieChart,
  Users,
  BookOpen,
} from "lucide-react";
import type { Brand, Report } from "@shared/schema";

const REPORT_TYPES = [
  {
    type: "executive" as const,
    title: "Executive Snapshot",
    description: "AI-powered executive briefing with visual charts, competitor positioning analysis, and progress tracking metrics. Powered by Gemini AI.",
    icon: PieChart,
    highlights: [
      "Visual scorecards & bar charts for all metrics",
      "Competitor prominence pie chart",
      "Perception score gauges (positioning, authority, proof, differentiation)",
      "AI-generated strategic actions with priority levels",
      "Model-by-model visibility breakdown",
      "Competitor positioning analysis",
    ],
    generatingMessage: "AI is analysing your visibility data, scoring competitors, and building visual charts...",
    estimatedTime: "30-60 seconds",
  },
  {
    type: "marketing" as const,
    title: "Marketing Action Report",
    description: "Complete DIY guide with one page per action — includes exact content examples, key phrases to use, implementation steps, and a content calendar. All specific to your brand.",
    icon: Target,
    highlights: [
      "One dedicated page per action item",
      "Real content examples ready to use (not templates)",
      "Exact key phrases to include in your content",
      "Step-by-step implementation instructions",
      "Competitor comparison page blueprints",
      "FAQ strategy with schema markup guide",
      "3-month content calendar",
    ],
    generatingMessage: "AI is crafting personalised action plans with real content examples for your brand...",
    estimatedTime: "45-90 seconds",
  },
  {
    type: "competitive" as const,
    title: "Competitive Intelligence",
    description: "Visual competitor prominence charts, detailed AI strategy analysis for each competitor, differentiation opportunities, and threat assessment.",
    icon: Users,
    highlights: [
      "Competitor prominence bar & pie charts",
      "Per-competitor AI strategy analysis",
      "Key phrases competitors own in AI responses",
      "Specific differentiation opportunities with implementation",
      "AI claims competitors repeat across models",
      "Threat assessment & urgency analysis",
    ],
    generatingMessage: "AI is analysing competitor strategies and mapping differentiation opportunities...",
    estimatedTime: "30-60 seconds",
  },
];

function GeneratingOverlay({ config }: { config: typeof REPORT_TYPES[number] }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md bg-background/90 backdrop-blur-sm" data-testid="overlay-generating">
      <div className="flex flex-col items-center gap-4 px-6 text-center max-w-sm">
        <div className="relative">
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Generating with AI</p>
          <p className="text-xs text-muted-foreground">{config.generatingMessage}</p>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-1.5 rounded-full animate-pulse" style={{ width: "60%" }} />
        </div>
        <p className="text-xs text-muted-foreground">Estimated: {config.estimatedTime}</p>
      </div>
    </div>
  );
}

function ReportTypeCard({
  config,
  brandId,
  existingReports,
  onGenerate,
  isGenerating,
}: {
  config: typeof REPORT_TYPES[number];
  brandId: number;
  existingReports: Report[];
  onGenerate: (type: string) => void;
  isGenerating: boolean;
}) {
  const Icon = config.icon;
  const reportsOfType = existingReports
    .filter((r) => r.reportType === config.type)
    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  const latest = reportsOfType[0];

  function handleDownload(report: Report) {
    window.open(`/api/brands/${brandId}/reports/${report.id}/download`, "_blank");
  }

  return (
    <Card className="relative overflow-visible" data-testid={`card-report-${config.type}`}>
      {isGenerating && <GeneratingOverlay config={config} />}
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-heading">{config.title}</CardTitle>
              <DataBadge variant="appeared">AI-Powered</DataBadge>
            </div>
            <p className="text-body text-muted-foreground">{config.description}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="space-y-1.5">
          {config.highlights.map((item) => (
            <li key={item} className="flex items-center gap-2 text-body text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <Button
            onClick={() => onGenerate(config.type)}
            disabled={isGenerating}
            data-testid={`button-generate-${config.type}`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating with AI...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>

          {latest && (
            <Button
              variant="outline"
              onClick={() => handleDownload(latest)}
              data-testid={`button-download-${config.type}`}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Latest PDF
            </Button>
          )}
        </div>

        {reportsOfType.length > 0 && (
          <div className="space-y-2">
            <p className="text-label text-muted-foreground">Generated reports</p>
            <div className="space-y-1.5">
              {reportsOfType.slice(0, 3).map((report) => (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/40"
                  data-testid={`row-report-${report.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-body text-foreground">
                      {new Date(report.createdAt!).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DataBadge variant="appeared">Ready</DataBadge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDownload(report)}
                      data-testid={`button-download-report-${report.id}`}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { activeBrand: brand, activeBrandId: brandId, isLoading: brandsLoading } = useBrand();

  const { data: reports = [], isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/brands", brandId, "reports"],
    enabled: !!brandId,
  });

  const [generatingType, setGeneratingType] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (reportType: string) => {
      if (!brandId) throw new Error("No brand");
      return await apiRequest("POST", `/api/brands/${brandId}/reports/generate`, { reportType });
    },
    onSuccess: (_data, reportType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "reports"] });
      const labels: Record<string, string> = {
        executive: "Executive Snapshot",
        marketing: "Marketing Action Report",
        competitive: "Competitive Intelligence",
      };
      toast({
        title: "Report generated",
        description: `Your ${labels[reportType] || reportType} is ready to download.`,
      });
      setGeneratingType(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Generation failed",
        description: err.message,
        variant: "destructive",
      });
      setGeneratingType(null);
    },
  });

  function handleGenerate(reportType: string) {
    setGeneratingType(reportType);
    generateMutation.mutate(reportType);
  }

  const isLoading = brandsLoading || reportsLoading;

  if (isLoading) {
    return (
      <PageShell title="Reports" subtitle="AI-powered intelligence reports with visual charts and actionable insights">
        <div className="grid grid-cols-1 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell title="Reports" subtitle="AI-powered intelligence reports with visual charts and actionable insights">
        <EmptyState
          icon={FileText}
          heading="No brand configured"
          description="Complete the onboarding to set up your brand before generating reports."
          action={{ label: "Go to Onboarding", onClick: () => setLocation("/onboarding") }}
        />
      </PageShell>
    );
  }

  if (brand.scanStatus !== "completed") {
    return (
      <PageShell title="Reports" subtitle="AI-powered intelligence reports with visual charts and actionable insights">
        <EmptyState
          icon={FileText}
          heading="Scan required"
          description="Run a full brand scan before generating reports."
          action={{ label: "Go to Dashboard", onClick: () => setLocation("/dashboard") }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Reports" subtitle="AI-powered intelligence reports with visual charts and actionable insights">
      <SectionHeader
        title="Report Library"
        subtitle={`${reports.length} report${reports.length !== 1 ? "s" : ""} generated for ${brand.domain}`}
      />

      <div className="rounded-md border border-border bg-muted/30 p-4 mb-6" data-testid="info-ai-reports">
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-foreground font-medium">AI-Generated Reports</p>
            <p className="text-xs text-muted-foreground">
              Reports are generated using advanced AI analysis of your visibility data, perception scores, coverage gaps, and competitor intelligence. Each report includes visual charts and personalised recommendations specific to {brand.domain}.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6" data-testid="reports-grid">
        {REPORT_TYPES.map((config) => {
          const card = (
            <ReportTypeCard
              key={config.type}
              config={config}
              brandId={brand.id}
              existingReports={reports}
              onGenerate={handleGenerate}
              isGenerating={generatingType === config.type && generateMutation.isPending}
            />
          );
          if (config.type === "marketing" || config.type === "competitive") {
            return (
              <UpgradeGate
                key={config.type}
                feature="coverageGap"
                featureLabel={config.title}
              >
                {card}
              </UpgradeGate>
            );
          }
          return card;
        })}
      </div>
    </PageShell>
  );
}
