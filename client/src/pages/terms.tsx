import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pause, Play, Tag, Loader2, ChevronDown, ChevronUp, ChevronRight, MessageSquare, RefreshCw, Sparkles, Building2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/ui/UpgradeModal";
import { useToast } from "@/hooks/use-toast";
import { useBrand } from "@/contexts/BrandContext";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { getApiErrorMessage, isAiUsageCapError } from "@/lib/apiError";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "wouter";
import { PageHeading } from "@/components/ui/enterprise";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

type TrackedTerm = {
  id: number;
  userId: string;
  brandId: number | null;
  term: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function Terms({ embedded = false }: { embedded?: boolean }) {
  const { limits, usage, plan, isLoading: subLoading } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"user_question" | "brand_sentiment">("user_question");
  const [showForm, setShowForm] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<Set<number>>(new Set());
  const [addQuestionTermId, setAddQuestionTermId] = useState<number | null>(null);
  const [newQuestion, setNewQuestion] = useState("");

  usePageMeta({
    title: embedded ? "Brand Settings — AEOSTARS" : "Key Terms — AEOSTARS",
    description: embedded ? "Manage your brand profile and tracked key terms." : "Manage brand statements and the AI-generated user questions we monitor.",
    ogType: "website",
  });

  const { activeBrandId } = useBrand();

  const { data: allTerms = [], isLoading } = useQuery<TrackedTerm[]>({
    queryKey: ["/api/tracked-terms"],
    staleTime: 30000,
  });

  const terms = useMemo(() => {
    if (!activeBrandId) return allTerms;
    return allTerms.filter(t => t.brandId === activeBrandId);
  }, [allTerms, activeBrandId]);

  const createMutation = useMutation({
    mutationFn: async (data: { term: string; category?: string; brandId?: number }) => {
      const res = await apiRequest("POST", "/api/tracked-terms", data);
      return res.json();
    },
    onSuccess: (term) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms", term.id, "questions"] });
      setNewTerm("");
      setNewCategory("");
      setShowForm(false);
      setExpandedTerms(prev => new Set([...prev, term.id]));
      const qCount = term.questionsGenerated || 0;
      toast({
        title: "Term added",
        description: qCount > 0
          ? `${qCount} questions generated successfully.`
          : "Term created. Questions will be generated on next scan.",
      });
    },
    onError: (err: any) => {
      if (err?.response?.status === 403 || err?.message?.includes("limit")) {
        setUpgradeOpen(true);
      } else {
        toast({ title: "Error", description: err?.message ?? "Failed to add term", variant: "destructive" });
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/tracked-terms/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tracked-terms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      toast({ title: "Term deleted" });
    },
  });

  const regenerateQuestionsMutation = useMutation({
    mutationFn: async (termId: number) => {
      const res = await apiRequest("POST", `/api/tracked-terms/${termId}/generate-questions`);
      return res.json();
    },
    onSuccess: (_, termId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms", termId, "questions"] });
      toast({ title: "Questions regenerated", description: "New user questions and brand sentiment questions have been added." });
    },
    onError: (error: unknown) => {
      toast({
        title: isAiUsageCapError(error) ? "AI allowance reached" : "Question regeneration failed",
        description: getApiErrorMessage(error, "Failed to regenerate questions."),
        variant: "destructive",
      });
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async ({ termId, question }: { termId: number; question: string }) => {
      const res = await apiRequest("POST", `/api/tracked-terms/${termId}/questions`, { question, questionCategory: activeTab });
      return res.json();
    },
    onSuccess: (_, { termId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms", termId, "questions"] });
      setNewQuestion("");
      setAddQuestionTermId(null);
      toast({ title: "Question added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add question", variant: "destructive" });
    },
  });

  const toggleQuestionMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/user-questions/${id}`, { isActive }),
    onSuccess: () => {
      terms.forEach(t => {
        queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms", t.id, "questions"] });
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/user-questions/${id}`),
    onSuccess: () => {
      terms.forEach(t => {
        queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms", t.id, "questions"] });
      });
      toast({ title: "Question deleted" });
    },
  });

  function handleAdd() {
    if (!newTerm.trim()) return;
    const termLimit = limits.trackedTerms;
    const activeCount = usage?.trackedTerms ?? 0;
    if (termLimit !== null && activeCount >= termLimit) {
      setUpgradeOpen(true);
      return;
    }
    createMutation.mutate({
      term: newTerm.trim(),
      category: newCategory.trim() || undefined,
      brandId: activeBrandId ?? undefined,
    });
  }

  function toggleExpand(termId: number) {
    setExpandedTerms(prev => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  }

  const termLimit = limits.trackedTerms;
  const activeCount = usage?.trackedTerms ?? terms.filter(t => t.isActive).length;
  const atLimit = termLimit !== null && activeCount >= termLimit;

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!embedded && (
          <PageHeading
            title="Key Terms"
            subtitle="Define what your brand does. AI generates questions real users would ask to find you."
            headingClassName="text-2xl font-bold"
            headingTestId="text-terms-heading"
            subtitleClassName="text-muted-foreground text-sm mt-1"
          />
        )}
        <div className="flex items-center gap-3 ml-auto">
          {!subLoading && termLimit !== null && (
            <div className="text-sm text-muted-foreground">
              <span className={atLimit ? "text-red-400 font-medium" : ""}>{activeCount}</span>
              <span> / {termLimit} terms used</span>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => {
              if (atLimit) {
                setUpgradeOpen(true);
              } else {
                setShowForm((v) => !v);
              }
            }}
            data-testid="button-add-term"
          >
            {showForm ? (
              <>
                <ChevronUp className="mr-1.5 h-4 w-4" /> Close
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" /> Add Term
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border" data-testid="tabs-question-category">
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

      {activeTab === "user_question" && (
        <p className="text-xs text-muted-foreground">
          Generic questions real people ask AI — your brand should appear in the answer without being named.
        </p>
      )}
      {activeTab === "brand_sentiment" && (
        <p className="text-xs text-muted-foreground">
          Questions that directly reference your brand — testing whether AI models know about and recommend you.
        </p>
      )}

      {showForm && (
        <Card data-testid="card-add-term">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="term-input">Brand statement *</Label>
              <Input
                id="term-input"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder='e.g. "best project management tools for remote teams"'
                className="font-mono text-sm"
                data-testid="input-term"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <p className="text-xs text-muted-foreground">
                Describe what your brand does. AI will generate both user questions and brand sentiment questions automatically.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-input">Category <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="category-input"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Brand, Commercial, Competitor, Category"
                data-testid="input-category"
              />
            </div>
            {termLimit !== null && (
              <p className="text-xs text-muted-foreground">
                You can add {Math.max(0, termLimit - activeCount)} more term{termLimit - activeCount !== 1 ? "s" : ""} on your {plan.charAt(0).toUpperCase() + plan.slice(1)} plan.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!newTerm.trim() || createMutation.isPending}
                data-testid="button-submit-term"
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Add Term & Generate Questions
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">Loading terms...</CardContent>
        </Card>
      ) : terms.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Tag className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">No tracked terms yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a brand statement describing what you do. AI will generate the user questions we monitor across all 3 LLMs.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="button-add-first-term"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first term
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {terms.map((term) => (
            <TermRow
              key={term.id}
              term={term}
              activeTab={activeTab}
              isExpanded={expandedTerms.has(term.id)}
              onToggleExpand={() => toggleExpand(term.id)}
              onToggleActive={() => toggleMutation.mutate({ id: term.id, isActive: !term.isActive })}
              onDelete={() => setDeleteConfirmId(term.id)}
              onRegenerate={() => regenerateQuestionsMutation.mutate(term.id)}
              isRegenerating={regenerateQuestionsMutation.isPending}
              addQuestionTermId={addQuestionTermId}
              onStartAddQuestion={() => { setAddQuestionTermId(term.id); setNewQuestion(""); }}
              newQuestion={newQuestion}
              onNewQuestionChange={setNewQuestion}
              onAddQuestion={() => {
                if (newQuestion.trim()) {
                  addQuestionMutation.mutate({ termId: term.id, question: newQuestion.trim() });
                }
              }}
              onCancelAddQuestion={() => { setAddQuestionTermId(null); setNewQuestion(""); }}
              isAddingQuestion={addQuestionMutation.isPending}
              onToggleQuestion={(id, isActive) => toggleQuestionMutation.mutate({ id, isActive })}
              onDeleteQuestion={(id) => setDeleteQuestionId(id)}
              togglePending={toggleMutation.isPending}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Each active question is queried daily across ChatGPT, Claude Haiku 4.5, and Gemini 2.0. Results appear in your dashboard within 24 hours.
      </p>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this term?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the brand statement, all its user questions, and associated visibility data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
                setDeleteConfirmId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteQuestionId !== null} onOpenChange={() => setDeleteQuestionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this user question and its visibility history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteQuestionId) deleteQuestionMutation.mutate(deleteQuestionId);
                setDeleteQuestionId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        featureLabel="key terms"
        currentLimit={limits.trackedTerms ?? undefined}
        growthLimit={50}
      />
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {content}
    </div>
  );
}

function TermRow({
  term,
  activeTab,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  onRegenerate,
  isRegenerating,
  addQuestionTermId,
  onStartAddQuestion,
  newQuestion,
  onNewQuestionChange,
  onAddQuestion,
  onCancelAddQuestion,
  isAddingQuestion,
  onToggleQuestion,
  onDeleteQuestion,
  togglePending,
}: {
  term: TrackedTerm;
  activeTab: "user_question" | "brand_sentiment";
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  addQuestionTermId: number | null;
  onStartAddQuestion: () => void;
  newQuestion: string;
  onNewQuestionChange: (v: string) => void;
  onAddQuestion: () => void;
  onCancelAddQuestion: () => void;
  isAddingQuestion: boolean;
  onToggleQuestion: (id: number, isActive: boolean) => void;
  onDeleteQuestion: (id: number) => void;
  togglePending: boolean;
}) {
  const { data: allQuestions = [], isLoading: questionsLoading } = useQuery<UserQuestion[]>({
    queryKey: ["/api/tracked-terms", term.id, "questions"],
    enabled: isExpanded,
    staleTime: 15000,
  });

  const questions = allQuestions.filter(q => (q.questionCategory || "user_question") === activeTab);
  const activeQCount = questions.filter(q => q.isActive).length;

  const tabLabel = activeTab === "user_question" ? "Non-Brand Terms Visibility" : "Brand Terms Visibility";
  const tabIcon = activeTab === "user_question" ? MessageSquare : Building2;
  const TabIcon = tabIcon;

  return (
    <Card data-testid={`card-term-${term.id}`}>
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover-elevate"
          onClick={onToggleExpand}
          data-testid={`row-term-${term.id}`}
        >
          <div className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium break-words ${!term.isActive ? "text-muted-foreground line-through" : ""}`}>
                {term.term}
              </p>
              {term.category && (
                <Badge variant="outline" className="text-xs">{term.category}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <TabIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isExpanded ? `${activeQCount} active ${tabLabel.toLowerCase()}` : `Click to see ${tabLabel.toLowerCase()}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {term.isActive ? (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/20 border text-xs">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Paused</Badge>
            )}
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {new Date(term.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              onClick={onToggleActive}
              disabled={togglePending}
              title={term.isActive ? "Pause term" : "Resume term"}
              data-testid={`button-toggle-term-${term.id}`}
            >
              {term.isActive ? (
                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              data-testid={`button-delete-term-${term.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-border/50 bg-muted/30">
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tabLabel} — sent to ChatGPT, Claude Haiku 4.5, Gemini 2.0 daily
                </h4>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onStartAddQuestion}
                    data-testid={`button-add-question-${term.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    data-testid={`button-regenerate-${term.id}`}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Regenerate
                  </Button>
                </div>
              </div>

              {addQuestionTermId === term.id && (
                <div className="flex items-center gap-2 py-1">
                  <Input
                    value={newQuestion}
                    onChange={(e) => onNewQuestionChange(e.target.value)}
                    placeholder={activeTab === "brand_sentiment" ? "Enter a brand-specific question..." : "Enter a question users might ask AI..."}
                    className="text-sm flex-1"
                    data-testid={`input-new-question-${term.id}`}
                    onKeyDown={(e) => e.key === "Enter" && onAddQuestion()}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={onAddQuestion}
                    disabled={!newQuestion.trim() || isAddingQuestion}
                    data-testid={`button-submit-question-${term.id}`}
                  >
                    {isAddingQuestion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onCancelAddQuestion}>
                    Cancel
                  </Button>
                </div>
              )}

              {questionsLoading ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Loading questions...</div>
              ) : questions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  <Sparkles className="h-4 w-4 mx-auto mb-1 text-muted-foreground/50" />
                  {activeTab === "brand_sentiment"
                    ? "Brand sentiment questions are being generated by AI..."
                    : "Questions are being generated by AI..."}
                </div>
              ) : (
                <div className="space-y-1">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-md group"
                      data-testid={`row-question-${q.id}`}
                    >
                      {activeTab === "brand_sentiment" ? (
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <Link href={`/terms/${term.id}`} className="flex-1 min-w-0">
                        <span className={`text-sm break-words cursor-pointer hover:text-primary transition-colors ${!q.isActive ? "text-muted-foreground line-through" : ""}`}>
                          {q.question}
                        </span>
                      </Link>
                      {q.questionType && QUESTION_TYPE_LABELS[q.questionType] && (
                        <Badge variant="outline" className={`text-[10px] shrink-0 border ${QUESTION_TYPE_LABELS[q.questionType].color}`}>
                          {QUESTION_TYPE_LABELS[q.questionType].label}
                        </Badge>
                      )}
                      {!q.isActive && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">Paused</Badge>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0 invisible group-hover:visible">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => onToggleQuestion(q.id, !q.isActive)}
                          title={q.isActive ? "Pause question" : "Resume question"}
                          data-testid={`button-toggle-question-${q.id}`}
                        >
                          {q.isActive ? (
                            <Pause className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Play className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => onDeleteQuestion(q.id)}
                          data-testid={`button-delete-question-${q.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
