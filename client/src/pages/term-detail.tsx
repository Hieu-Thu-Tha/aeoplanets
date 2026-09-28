import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownResponse } from "@/components/markdown-response";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Eye, EyeOff, Clock, Bot, CheckCircle, XCircle, ExternalLink, MessageSquare } from "lucide-react";
import { PageShell, PageHeading, DataBadge, SectionHeader } from "@/components/ui/enterprise";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { VisibilityRun, TrackedTerm } from "@shared/schema";

type UserQuestion = {
  id: number;
  trackedTermId: number;
  userId: string;
  question: string;
  questionType: string;
  questionCategory: string;
  isActive: boolean;
  createdAt: string;
};

const QUESTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  awareness: { label: "Awareness", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  consideration: { label: "Consideration", color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  commercial: { label: "Commercial", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
};

function ModelIcon({ modelId }: { modelId: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    openai: { label: "ChatGPT", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    anthropic: { label: "Claude", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
    gemini: { label: "Gemini", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    perplexity: { label: "Perplexity", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  };
  const m = labels[modelId] || { label: modelId, color: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`${m.color} border text-xs`}>{m.label}</Badge>;
}

function ResponseCard({ run }: { run: VisibilityRun }) {
  const competitors = Array.isArray(run.competitorsMentioned) ? (run.competitorsMentioned as string[]) : [];

  return (
    <Card data-testid={`card-response-${run.modelId}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ModelIcon modelId={run.modelId} />
            <span className="text-xs text-muted-foreground">
              {new Date(run.runDate!).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              {" "}
              {new Date(run.runDate!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        {competitors.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Competitors mentioned:</span>
            {competitors.map((c) => (
              <DataBadge key={c} variant="neutral">{c}</DataBadge>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">AI Response</p>
          <div className="bg-muted/40 rounded-md p-4 text-sm leading-relaxed max-h-[400px] overflow-y-auto" data-testid={`card-response-${run.modelId}-body`}>
            <MarkdownResponse content={run.rawResponse || "No response recorded."} testId={`text-response-${run.modelId}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TermDetail() {
  const params = useParams<{ id: string }>();
  const termId = parseInt(params.id || "0");
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightQuestionId = searchParams.get("q") ? parseInt(searchParams.get("q")!) : null;
  const scrolledRef = useRef(false);

  const { data: terms = [] } = useQuery<TrackedTerm[]>({
    queryKey: ["/api/tracked-terms"],
    staleTime: 30000,
  });

  const term = terms.find(t => t.id === termId);

  const { data: questions = [], isLoading: questionsLoading } = useQuery<UserQuestion[]>({
    queryKey: ["/api/tracked-terms", termId, "questions"],
    enabled: termId > 0,
    staleTime: 15000,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery<VisibilityRun[]>({
    queryKey: ["/api/tracked-terms", termId, "runs"],
    queryFn: async () => {
      const res = await fetch(`/api/tracked-terms/${termId}/runs`);
      if (!res.ok) throw new Error("Failed to load runs");
      return res.json();
    },
    enabled: termId > 0,
    staleTime: 30000,
  });

  useEffect(() => {
    if (highlightQuestionId && !runsLoading && !questionsLoading && !scrolledRef.current) {
      scrolledRef.current = true;
      setTimeout(() => {
        const el = document.getElementById(`question-${highlightQuestionId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-2", "ring-primary/50", "rounded-lg");
          setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-lg"), 3000);
        }
      }, 200);
    }
  }, [highlightQuestionId, runsLoading, questionsLoading]);

  usePageMeta({
    title: term ? `"${term.term}" — Key Terms — AEOSTARS` : "Key Term Detail — AEOSTARS",
    description: term ? `AI visibility analysis for: ${term.term}` : "Term detail view",
    ogType: "website",
  });

  const questionRuns = new Map<number, VisibilityRun[]>();
  const promptRuns: VisibilityRun[] = [];

  for (const run of runs) {
    const uqId = run.userQuestionId;
    if (uqId) {
      if (!questionRuns.has(uqId)) questionRuns.set(uqId, []);
      questionRuns.get(uqId)!.push(run);
    } else {
      promptRuns.push(run);
    }
  }

  const totalRuns = runs.length;
  const appearedCount = runs.filter(r => r.appeared).length;
  const lastRunDate = runs.length > 0 ? new Date(runs[0].runDate!) : null;

  if (!term && !runsLoading) {
    return (
      <PageShell title="Term Not Found" subtitle="This tracked term could not be found.">
        <Button variant="outline" size="sm" asChild>
          <Link href="/terms">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Key Terms
          </Link>
        </Button>
      </PageShell>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="mt-0.5 flex-shrink-0">
          <Link href="/terms" data-testid="button-back-terms">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <PageHeading
            title={term ? `"${term.term}"` : <Skeleton className="h-7 w-64" />}
            titleText={term?.term}
            headingClassName="text-xl sm:text-2xl font-bold break-words"
            headingTestId="text-term-heading"
          />
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {term?.category && (
              <Badge variant="outline" className="text-xs">{term.category}</Badge>
            )}
            {term && (
              <Badge variant="outline" className={`text-xs ${term.isActive ? "bg-green-500/15 text-green-400 border-green-500/20" : "text-muted-foreground"}`}>
                {term.isActive ? "Active" : "Paused"}
              </Badge>
            )}
            {lastRunDate && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last scanned {lastRunDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Brand Statement</p>
          <div className="bg-muted/40 rounded-md p-4 text-sm font-mono break-words" data-testid="text-prompt-input">
            {term?.term || "Loading..."}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            AI generates user questions from this statement. Those questions are monitored across ChatGPT, Claude, Gemini, and Perplexity.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          title="User Questions & Results"
          subtitle={`${questions.length} question${questions.length !== 1 ? "s" : ""} monitored across 4 AI models`}
        />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {totalRuns} total runs</span>
          <span className="flex items-center gap-1">
            {appearedCount > 0 ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5" />}
            {appearedCount} appeared
          </span>
        </div>
      </div>

      {(runsLoading || questionsLoading) ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : questions.length === 0 && promptRuns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No visibility runs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Results will appear here after questions are generated and the next scan completes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {questions.map((q) => {
            const qRuns = questionRuns.get(q.id) || [];
            const latestByModel = new Map<string, VisibilityRun>();
            for (const run of qRuns) {
              if (!latestByModel.has(run.modelId)) {
                latestByModel.set(run.modelId, run);
              }
            }
            const modelOrder = ["openai", "anthropic", "gemini", "perplexity"];
            const latestRuns = modelOrder.filter(m => latestByModel.has(m)).map(m => latestByModel.get(m)!);

            return (
              <div key={q.id} id={`question-${q.id}`} className="space-y-3 transition-all duration-500" data-testid={`section-question-${q.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">{q.question}</p>
                  {q.questionType && QUESTION_TYPE_LABELS[q.questionType] && (
                    <Badge variant="outline" className={`text-[10px] border ${QUESTION_TYPE_LABELS[q.questionType].color}`}>
                      {QUESTION_TYPE_LABELS[q.questionType].label}
                    </Badge>
                  )}
                  {!q.isActive && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Paused</Badge>
                  )}
                </div>
                {latestRuns.length > 0 ? (
                  <div className="space-y-3 pl-6">
                    {latestRuns.map(run => (
                      <ResponseCard key={run.id} run={run} />
                    ))}
                  </div>
                ) : (
                  <div className="pl-6">
                    <p className="text-xs text-muted-foreground py-2">
                      No results yet. This question will be queried in the next daily scan.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {promptRuns.length > 0 && (
            <>
              <SectionHeader
                title="Prompt-Based Results"
                subtitle={`${promptRuns.length} runs from prompt builder`}
              />
              {(() => {
                const latestByModel = new Map<string, VisibilityRun>();
                for (const run of promptRuns) {
                  if (!latestByModel.has(run.modelId)) {
                    latestByModel.set(run.modelId, run);
                  }
                }
                const modelOrder = ["openai", "anthropic", "gemini", "perplexity"];
                return modelOrder
                  .filter(m => latestByModel.has(m))
                  .map(m => <ResponseCard key={latestByModel.get(m)!.id} run={latestByModel.get(m)!} />);
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
