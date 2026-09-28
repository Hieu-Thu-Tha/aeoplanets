import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DataBadge, PageHeading } from "@/components/ui/enterprise";
import { MarkdownResponse } from "@/components/markdown-response";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { VisibilityRun } from "@shared/schema";

function ModelBadge({ modelId }: { modelId: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    openai: { label: "ChatGPT", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    anthropic: { label: "Claude", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
    gemini: { label: "Gemini", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    perplexity: { label: "Perplexity", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  };
  const m = labels[modelId] || { label: modelId, color: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`${m.color} border text-xs`}>{m.label}</Badge>;
}

export default function RunDetail() {
  const params = useParams<{ id: string }>();
  const runId = parseInt(params.id || "0");

  const { data: run, isLoading } = useQuery<VisibilityRun>({
    queryKey: ["/api/visibility-runs", runId],
    queryFn: async () => {
      const res = await fetch(`/api/visibility-runs/${runId}`);
      if (!res.ok) throw new Error("Failed to load run");
      return res.json();
    },
    enabled: runId > 0,
    staleTime: 60000,
  });

  usePageMeta({
    title: run ? `Run #${run.id} — AEOSTARS` : "Visibility Run — AEOSTARS",
    description: "AI visibility run detail",
    ogType: "website",
  });

  const competitors = run && Array.isArray(run.competitorsMentioned) ? (run.competitorsMentioned as string[]) : [];

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <PageHeading title="Run Not Found" headingClassName="text-2xl font-bold" />
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="mt-0.5 flex-shrink-0">
          <Link href="/" data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <PageHeading title="Visibility Run" headingClassName="text-xl sm:text-2xl font-bold" headingTestId="text-run-heading" />
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <ModelBadge modelId={run.modelId} />
            <Badge variant="outline" className="text-xs capitalize">{run.promptType.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(run.runDate!).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              {" "}
              {new Date(run.runDate!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Prompt Sent</p>
          <div className="bg-muted/40 rounded-md p-4 text-sm font-mono break-words" data-testid="text-prompt-input">
            {run.promptText}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <DataBadge variant={run.appeared ? "appeared" : "missing"}>
          {run.appeared ? "Brand appeared" : "Not mentioned"}
        </DataBadge>
        {run.position != null && (
          <Badge variant="outline" className="text-xs">Position #{run.position}</Badge>
        )}
        {run.sentiment && (
          <DataBadge variant={run.sentiment === "positive" ? "positive" : run.sentiment === "negative" ? "negative" : "neutral"}>
            {run.sentiment}
          </DataBadge>
        )}
        {run.citationPresent && (
          <DataBadge variant="appeared">
            <ExternalLink className="h-3 w-3 mr-1" />Cited
          </DataBadge>
        )}
      </div>

      {competitors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Competitors mentioned:</span>
          {competitors.map((c) => (
            <DataBadge key={c} variant="neutral">{c}</DataBadge>
          ))}
        </div>
      )}

      <Card data-testid="card-response">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">AI Response</p>
          <div className="bg-muted/40 rounded-md p-4 text-sm leading-relaxed max-h-[600px] overflow-y-auto" data-testid="card-response-body">
            <MarkdownResponse content={run.rawResponse || "No response recorded."} testId="text-response" />
          </div>
        </CardContent>
      </Card>

      {run.trackedTermId && (
        <div className="text-sm">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/terms/${run.trackedTermId}`} data-testid="link-view-term">
              View all runs for this term
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
