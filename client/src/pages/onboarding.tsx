import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Loader2, CheckCircle2, Circle, Sparkles, Globe, ArrowRight, RotateCcw, AlertCircle, MapPin, Search, Trash2, MessageSquare, UserPlus, Users, Building2, Mail, Shield, ChevronDown, ChevronUp, Check, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useBrand } from "@/contexts/BrandContext";
import { PageHeading } from "@/components/ui/enterprise";

interface ResearchResult {
  brandName: string;
  domain: string;
  category: string | null;
  problemStatement: string | null;
  targetAudience: string | null;
  brandPositioning: string | null;
  products: string | null;
  differentiators: string | null;
  brandTone: string | null;
  suggestedTerms: string[];
}

interface CompetitorResult {
  name: string;
  domain: string;
  description: string;
}

const urlSchema = z.object({
  url: z.string().min(1, "Please enter your website address").refine(
    (val) => {
      try {
        const withProtocol = val.startsWith("http") ? val : `https://${val}`;
        const parsed = new URL(withProtocol);
        const hostname = parsed.hostname.toLowerCase();
        if (!hostname.includes(".")) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    "Please enter a valid website address including a domain extension (e.g. .com, .co.uk)"
  ),
});

type UrlFormValues = z.infer<typeof urlSchema>;

type Stage = "url" | "researching" | "review" | "territory" | "finding-competitors" | "competitors" | "invite-team" | "generating-questions" | "questions" | "scanning";

const SCAN_STEPS = [
  { key: "scanning", label: "Scanning AI models..." },
  { key: "analysing", label: "Analysing narrative..." },
  { key: "comparing", label: "Comparing competitors..." },
];

const RESEARCH_STEPS = [
  { key: "visiting", label: "Searching for your website..." },
  { key: "analysing", label: "Analysing your brand..." },
  { key: "terms", label: "Generating search terms..." },
];

const COMPETITOR_STEPS = [
  { key: "searching", label: "Searching for competitors..." },
  { key: "analysing", label: "Analysing their offerings..." },
  { key: "comparing", label: "Comparing to your brand..." },
];

const QUESTION_STEPS = [
  { key: "analysing", label: "Analysing your brand statements..." },
  { key: "generating", label: "Generating user questions..." },
  { key: "preparing", label: "Preparing your monitoring..." },
];

interface ScanStatusResponse {
  scanStatus: string;
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { limits } = useSubscription();
  const { setActiveBrandId } = useBrand();
  const competitorLimit = limits.competitors ?? Infinity;

  const [stage, setStage] = useState<Stage>("url");
  const [researchData, setResearchData] = useState<ResearchResult | null>(null);
  const [researchStepIndex, setResearchStepIndex] = useState(0);

  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editProblem, setEditProblem] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [editPositioning, setEditPositioning] = useState("");
  const [editProducts, setEditProducts] = useState("");
  const [editDifferentiators, setEditDifferentiators] = useState("");
  const [editBrandTone, setEditBrandTone] = useState("");

  const [territoryType, setTerritoryType] = useState<"global" | "regional">("global");
  const [locationInput, setLocationInput] = useState("");

  const [foundCompetitors, setFoundCompetitors] = useState<CompetitorResult[]>([]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<number>>(new Set());
  const [competitorStepIndex, setCompetitorStepIndex] = useState(0);
  const [manualCompUrl, setManualCompUrl] = useState("");
  const [showManualAdd, setShowManualAdd] = useState(false);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [questionStepIndex, setQuestionStepIndex] = useState(0);
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<number, { termText: string; questions: Array<{ id: number; question: string; isActive: boolean; questionCategory: string }> }>>({});
  const [createdTermIds, setCreatedTermIds] = useState<number[]>([]);
  const restoredRef = useRef(false);

  const urlForm = useForm<UrlFormValues>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: "" },
  });

  const saveProgress = useCallback((step: Stage, data?: Record<string, unknown>) => {
    const saveable: Stage[] = ["review", "territory", "competitors"];
    if (!saveable.includes(step)) return;
    const payload: Record<string, unknown> = {
      researchData,
      editCompanyName, editCategory, editProblem, editAudience,
      editPositioning, editProducts, editDifferentiators, editBrandTone,
      territoryType, locationInput,
      foundCompetitors,
      selectedCompetitors: Array.from(selectedCompetitors),
      ...data,
    };
    fetch("/api/auth/onboarding-progress", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ step, data: payload }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }).catch(() => {});
  }, [researchData, editCompanyName, editCategory, editProblem, editAudience, editPositioning, editProducts, editDifferentiators, editBrandTone, territoryType, locationInput, foundCompetitors, selectedCompetitors]);

  const clearProgress = useCallback(() => {
    fetch("/api/auth/onboarding-progress", {
      method: "DELETE",
      credentials: "include",
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (restoredRef.current || !user) return;
    restoredRef.current = true;
    const savedStep = user.onboardingStep as Stage | null;
    const savedData = user.onboardingData as Record<string, unknown> | null;
    if (!savedStep || !savedData) return;
    const saveable: Stage[] = ["review", "territory", "competitors"];
    if (!saveable.includes(savedStep)) return;

    if (savedData.researchData) setResearchData(savedData.researchData as ResearchResult);
    if (savedData.editCompanyName != null) setEditCompanyName(savedData.editCompanyName as string);
    if (savedData.editCategory != null) setEditCategory(savedData.editCategory as string);
    if (savedData.editProblem != null) setEditProblem(savedData.editProblem as string);
    if (savedData.editAudience != null) setEditAudience(savedData.editAudience as string);
    if (savedData.editPositioning != null) setEditPositioning(savedData.editPositioning as string);
    if (savedData.editProducts != null) setEditProducts(savedData.editProducts as string);
    if (savedData.editDifferentiators != null) setEditDifferentiators(savedData.editDifferentiators as string);
    if (savedData.editBrandTone != null) setEditBrandTone(savedData.editBrandTone as string);
    if (savedData.territoryType != null) setTerritoryType(savedData.territoryType as "global" | "regional");
    if (savedData.locationInput != null) setLocationInput(savedData.locationInput as string);
    if (savedData.foundCompetitors) setFoundCompetitors(savedData.foundCompetitors as CompetitorResult[]);
    if (savedData.selectedCompetitors) setSelectedCompetitors(new Set(savedData.selectedCompetitors as number[]));

    setStage(savedStep);
    toast({ title: "Resuming where you left off", description: "Your onboarding progress has been restored." });
  }, [user, toast]);

  useEffect(() => {
    if (stage === "competitors" && restoredRef.current) {
      saveProgress("competitors");
    }
  }, [selectedCompetitors, foundCompetitors, stage, saveProgress]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const saveable: Stage[] = ["review", "territory"];
    if (!saveable.includes(stage)) return;
    const timer = setTimeout(() => saveProgress(stage), 1000);
    return () => clearTimeout(timer);
  }, [stage, editCompanyName, editCategory, editProblem, editAudience, editPositioning, editProducts, editDifferentiators, editBrandTone, territoryType, locationInput, saveProgress]);

  const { data: scanStatus } = useQuery<ScanStatusResponse>({
    queryKey: ["/api/brands", brandId, "scan-status"],
    enabled: stage === "scanning" && brandId !== null,
    refetchInterval: stage === "scanning" ? 5000 : false,
  });

  useEffect(() => {
    if (stage !== "researching") return;
    const interval = setInterval(() => {
      setResearchStepIndex((prev) => (prev < RESEARCH_STEPS.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== "finding-competitors") return;
    const interval = setInterval(() => {
      setCompetitorStepIndex((prev) => (prev < COMPETITOR_STEPS.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== "generating-questions") return;
    const interval = setInterval(() => {
      setQuestionStepIndex((prev) => (prev < QUESTION_STEPS.length - 1 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== "scanning") return;
    const interval = setInterval(() => {
      setScanStepIndex((prev) => (prev < SCAN_STEPS.length - 1 ? prev + 1 : prev));
    }, 3500);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (scanStatus?.scanStatus === "completed") {
      // Navigate first, then refetch brands and auto-switch to the new brand
      // after the refetch completes (avoids race with BrandContext sync effect)
      qc.refetchQueries({ queryKey: ["/api/brands"] })
        .then(() => {
          if (brandId != null) {
            setActiveBrandId(brandId);
          }
        })
        .catch((e) => {
          console.error("Failed to refetch brands after scan completion:", e);
        })
        .finally(() => setLocation("/"));
    }
  }, [scanStatus, qc, setLocation, brandId, setActiveBrandId]);

  const researchMutation = useMutation({
    mutationFn: async (url: string) => {
      const withProtocol = url.startsWith("http") ? url : `https://${url}`;
      const parsed = new URL(withProtocol);
      const normalised = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}`.replace(/\/$/, "") || `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
      const res = await apiRequest("POST", "/api/brands/research", { url: normalised });
      return res.json() as Promise<ResearchResult>;
    },
    onSuccess: (data) => {
      setResearchData(data);
      setEditCompanyName(data.brandName ?? "");
      setEditCategory(data.category ?? "");
      setEditProblem(data.problemStatement ?? "");
      setEditAudience(data.targetAudience ?? "");
      setEditPositioning(data.brandPositioning ?? "");
      setEditProducts(data.products ?? "");
      setEditDifferentiators(data.differentiators ?? "");
      setEditBrandTone(data.brandTone ?? "");
      setStage("review");
      saveProgress("review", {
        researchData: data,
        editCompanyName: data.brandName ?? "",
        editCategory: data.category ?? "",
        editProblem: data.problemStatement ?? "",
        editAudience: data.targetAudience ?? "",
        editPositioning: data.brandPositioning ?? "",
        editProducts: data.products ?? "",
        editDifferentiators: data.differentiators ?? "",
        editBrandTone: data.brandTone ?? "",
      });
    },
    onError: (err: Error) => {
      setStage("url");
      setResearchData(null);
      toast({
        title: "Research failed",
        description: err.message || "Could not analyse that website. Please check the URL and try again.",
        variant: "destructive",
      });
    },
  });

  const competitorMutation = useMutation({
    mutationFn: async () => {
      if (!researchData) throw new Error("No research data");
      const res = await apiRequest("POST", "/api/brands/research-competitors", {
        brandName: editCompanyName || researchData.brandName,
        domain: researchData.domain,
        category: editCategory || researchData.category,
        problemStatement: editProblem || researchData.problemStatement,
        targetAudience: editAudience || researchData.targetAudience,
        brandPositioning: editPositioning || researchData.brandPositioning,
        products: editProducts || researchData.products,
        differentiators: editDifferentiators || researchData.differentiators,
        territory: territoryType,
        location: territoryType === "regional" ? locationInput : undefined,
      });
      return res.json() as Promise<{ competitors: CompetitorResult[] }>;
    },
    onSuccess: (data) => {
      setFoundCompetitors(data.competitors);
      const limitedSelection = new Set(data.competitors.map((_, i) => i).filter(i => i < competitorLimit));
      setSelectedCompetitors(limitedSelection);
      setStage("competitors");
      saveProgress("competitors", {
        foundCompetitors: data.competitors,
        selectedCompetitors: Array.from(limitedSelection),
      });
    },
    onError: (err: Error) => {
      setStage("territory");
      toast({
        title: "Competitor research failed",
        description: err.message || "Could not find competitors. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createBrandMutation = useMutation({
    mutationFn: async () => {
      if (!researchData) throw new Error("No research data");
      const domain = researchData.domain.startsWith("http") ? researchData.domain : `https://${researchData.domain}`;
      const chosenCompetitors = foundCompetitors
        .filter((_, i) => selectedCompetitors.has(i))
        .map((c) => c.domain);
      const res = await apiRequest("POST", "/api/brands", {
        domain,
        companyName: editCompanyName || null,
        competitors: chosenCompetitors,
        category: editCategory,
        problemStatement: editProblem,
        targetAudience: editAudience,
        brandPositioning: editPositioning,
        territory: territoryType,
        location: territoryType === "regional" ? locationInput : null,
        products: editProducts || null,
        differentiators: editDifferentiators || null,
        brandTone: editBrandTone || null,
        skipFallbackTerms: true,
      });
      return res.json();
    },
    onSuccess: async (brand) => {
      clearProgress();
      setBrandId(brand.id);
      let termIds: number[] = [];
      let termTextMap = new Map<number, string>();

      if (researchData?.suggestedTerms && researchData.suggestedTerms.length > 0) {
        try {
          const bulkRes = await apiRequest("POST", "/api/tracked-terms/bulk", {
            terms: researchData.suggestedTerms,
            brandId: brand.id,
          });
          const bulkData = await bulkRes.json();
          const createdTerms: Array<{ id: number; term: string }> = bulkData.created || [];
          termIds = createdTerms.map((t) => t.id);
          setCreatedTermIds(termIds);
          qc.invalidateQueries({ queryKey: ["/api/tracked-terms"] });

          for (const ct of createdTerms) {
            termTextMap.set(ct.id, ct.term);
          }
        } catch (e) {
          console.error("Failed to create tracked terms from research:", e);
        }
      }

      if (termIds.length === 0) {
        try {
          const fallbackRes = await apiRequest("POST", `/api/brands/${brand.id}/generate-terms`);
          const fallbackData = await fallbackRes.json();
          const fallbackTerms: Array<{ id: number; term: string }> = fallbackData.created || [];
          termIds = fallbackTerms.map((t) => t.id);
          setCreatedTermIds(termIds);
          qc.invalidateQueries({ queryKey: ["/api/tracked-terms"] });

          for (const ct of fallbackTerms) {
            termTextMap.set(ct.id, ct.term);
          }

          if (termIds.length > 0) {
            toast({
              title: "Key terms generated",
              description: `We auto-generated ${termIds.length} key terms based on your brand profile. You can customize them later.`,
            });
          }
        } catch (e) {
          console.error("Failed to generate fallback terms:", e);
          toast({
            title: "Could not generate key terms",
            description: "Brand was created but key terms could not be generated. You can add them manually from the Terms page.",
            variant: "destructive",
          });
        }
      }

      if (termIds.length > 0) {
        setStage("generating-questions");
        setQuestionStepIndex(0);
        try {
          const qRes = await apiRequest("POST", "/api/tracked-terms/generate-questions-bulk", {
            termIds,
            brandId: brand.id,
          });
          const qData = await qRes.json();

          const questionsMap: Record<number, { termText: string; questions: Array<{ id: number; question: string; isActive: boolean; questionCategory: string }> }> = {};
          for (const termId of termIds) {
            const termText = termTextMap.get(termId) || "Unknown term";
            const qs = qData.results?.[termId] || [];
            questionsMap[termId] = {
              termText,
              questions: qs.map((q: any) => ({ id: q.id, question: q.question, isActive: q.isActive ?? true, questionCategory: q.questionCategory || "user_question" })),
            };
          }
          setGeneratedQuestions(questionsMap);
          setStage("questions");
        } catch (e) {
          console.error("Failed to generate questions:", e);
          toast({
            title: "Question generation failed",
            description: "Your key terms were created but questions could not be generated. You can retry from the Dashboard.",
            variant: "destructive",
          });
          try {
            await apiRequest("POST", `/api/brands/${brand.id}/scan`, {});
            setStage("scanning");
            setScanStepIndex(0);
          } catch {
            toast({ title: "Scan failed to start", variant: "destructive" });
          }
        }
      } else {
        toast({
          title: "Brand created without key terms",
          description: "We couldn't generate key terms automatically. You can generate them from the Dashboard or add them manually from the Terms page.",
          variant: "destructive",
        });
        qc.refetchQueries({ queryKey: ["/api/brands"] })
          .catch((e) => {
            console.error("Failed to refetch brands after brand creation:", e);
          })
          .finally(() => setLocation("/"));
      }
    },
    onError: (err: Error) => {
      const isUpgradeRequired = err.message.includes("Brand limit") || err.message.includes("upgradeRequired");
      if (isUpgradeRequired) {
        toast({
          title: "All brand slots in use",
          description: "You can add an Extra Brand pack or upgrade your plan to create more brands.",
        });
        setLocation("/billing");
      } else {
        toast({
          title: "Failed to create brand",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  function onUrlSubmit(data: UrlFormValues) {
    setStage("researching");
    setResearchStepIndex(0);
    researchMutation.mutate(data.url);
  }

  function onFindCompetitors() {
    if (territoryType === "regional" && !locationInput.trim()) {
      toast({
        title: "Location required",
        description: "Please enter your location or switch to Global / Online.",
        variant: "destructive",
      });
      return;
    }
    saveProgress("territory");
    setStage("finding-competitors");
    setCompetitorStepIndex(0);
    competitorMutation.mutate();
  }

  const addCompetitorUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/brands/research-competitor-url", {
        url,
        brandName: researchData?.brandName,
        category: editCategory,
      });
      return res.json();
    },
    onSuccess: (data: CompetitorResult) => {
      const isDuplicate = foundCompetitors.some(
        (c) => c.domain.replace(/^www\./, "").toLowerCase() === data.domain.replace(/^www\./, "").toLowerCase()
      );
      if (isDuplicate) {
        toast({ title: "Already listed", description: `${data.name} is already in your competitor list.` });
        return;
      }
      const newIndex = foundCompetitors.length;
      setFoundCompetitors((prev) => [...prev, data]);
      if (selectedCompetitors.size < competitorLimit) {
        setSelectedCompetitors((prev) => new Set([...prev, newIndex]));
      }
      setManualCompUrl("");
      setShowManualAdd(false);
      toast({ title: "Competitor added", description: `${data.name} has been added to your list.` });
    },
    onError: (err: Error) => {
      toast({ title: "Research failed", description: err.message, variant: "destructive" });
    },
  });

  function toggleCompetitor(index: number) {
    setSelectedCompetitors((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        if (next.size >= competitorLimit) {
          toast({
            title: "Competitor limit reached",
            description: `Your plan allows up to ${competitorLimit} competitors. Upgrade your plan or deselect one first.`,
          });
          return prev;
        }
        next.add(index);
      }
      return next;
    });
  }

  function renderProgressScreen(title: string, subtitle: string, steps: { key: string; label: string }[], stepIndex: number, footnote: string) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-2">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          </div>
          <div className="space-y-4 text-left">
            {steps.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <div key={step.key} data-testid={`step-${step.key}`} className="flex items-center gap-3">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={isDone ? "text-muted-foreground line-through text-sm" : isActive ? "text-foreground font-medium text-sm" : "text-muted-foreground/50 text-sm"}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{footnote}</p>
        </div>
      </div>
    );
  }

  if (stage === "researching") {
    return renderProgressScreen(
      "Researching your brand",
      "Our AI is searching the web to understand your brand and market.",
      RESEARCH_STEPS,
      researchStepIndex,
      "This usually takes 1\u20132 minutes. We're running deep web research with live AI \u2014 please don't close this tab."
    );
  }

  if (stage === "finding-competitors") {
    const locationNote = territoryType === "global"
      ? "Searching globally..."
      : `Searching in ${locationInput}...`;
    return renderProgressScreen(
      "Finding your competitors",
      locationNote,
      COMPETITOR_STEPS,
      competitorStepIndex,
      "This usually takes 1\u20132 minutes. We're verifying each competitor with live web search \u2014 please don't close this tab."
    );
  }

  if (stage === "generating-questions") {
    return renderProgressScreen(
      "Generating user questions",
      "AI is creating the questions real users would ask to find your brand.",
      QUESTION_STEPS,
      questionStepIndex,
      "This usually takes 2\u20133 minutes. We're crafting questions tailored to your category \u2014 please don't close this tab."
    );
  }

  if (stage === "questions") {
    const startScan = async () => {
      if (!brandId) return;
      try {
        await apiRequest("POST", `/api/brands/${brandId}/scan`, {});
        setStage("scanning");
        setScanStepIndex(0);
      } catch {
        toast({ title: "Scan failed to start", variant: "destructive" });
      }
    };

    const allQuestions = Object.entries(generatedQuestions);

    const deleteOnboardingQuestion = async (termId: number, questionId: number) => {
      try {
        await apiRequest("DELETE", `/api/user-questions/${questionId}`);
        setGeneratedQuestions(prev => {
          const updated = { ...prev };
          if (updated[termId]) {
            updated[termId] = {
              ...updated[termId],
              questions: updated[termId].questions.filter(q => q.id !== questionId),
            };
          }
          return updated;
        });
      } catch {
        toast({ title: "Error", description: "Failed to delete question", variant: "destructive" });
      }
    };

    const addOnboardingQuestion = async (termId: number, question: string) => {
      try {
        const res = await apiRequest("POST", `/api/tracked-terms/${termId}/questions`, { question });
        const newQ = await res.json();
        setGeneratedQuestions(prev => {
          const updated = { ...prev };
          if (updated[termId]) {
            updated[termId] = {
              ...updated[termId],
              questions: [...updated[termId].questions, { id: newQ.id, question: newQ.question, isActive: true }],
            };
          }
          return updated;
        });
      } catch {
        toast({ title: "Error", description: "Failed to add question", variant: "destructive" });
      }
    };

    return (
      <div className="flex h-full items-start justify-center px-4 py-8 overflow-y-auto">
        <div className="max-w-2xl w-full space-y-6 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 4 of 4</Badge>
            </div>
            <PageHeading title="Your AI monitoring questions" headingClassName="text-3xl font-bold text-foreground" headingTestId="text-questions-title" />
            <p className="text-muted-foreground">
              These are the questions we'll ask ChatGPT, Claude Haiku 4.5, and Gemini 2.0 daily to track your brand visibility. Review, edit, or add more.
            </p>
          </div>

          {allQuestions.map(([termIdStr, data]) => {
            const termId = parseInt(termIdStr);
            return (
              <QuestionsReviewCard
                key={termId}
                termId={termId}
                termText={data.termText}
                questions={data.questions}
                onDelete={(qId) => deleteOnboardingQuestion(termId, qId)}
                onAdd={(q) => addOnboardingQuestion(termId, q)}
              />
            );
          })}

          {allQuestions.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No questions were generated. You can add questions manually from the Key Terms page after setup.</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-xs text-muted-foreground">
              You can always manage questions from the Key Terms page later.
            </p>
            <Button
              onClick={startScan}
              data-testid="button-start-assessment"
            >
              Start AI Assessment
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "scanning") {
    return renderProgressScreen(
      "Running your AI assessment",
      "This takes a few minutes while we query all major AI models on your behalf.",
      SCAN_STEPS,
      scanStepIndex,
      "Polling every 5 seconds for updates..."
    );
  }

  if (stage === "competitors") {
    return (
      <div className="flex h-full items-start justify-center px-4 py-8 overflow-y-auto">
        <div className="max-w-2xl w-full space-y-6 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 3 of 4</Badge>
            </div>
            <PageHeading title="Your competitors" headingClassName="text-3xl font-bold text-foreground" headingTestId="text-competitors-title" />
            <p className="text-muted-foreground">
              We found these competitors in your market. Select the ones you want to track against.
            </p>
            {competitorLimit !== Infinity && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-competitor-limit">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Select up to {competitorLimit} competitor{competitorLimit !== 1 ? "s" : ""} ({selectedCompetitors.size}/{competitorLimit} selected)</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {foundCompetitors.map((comp, i) => {
              const isSelected = selectedCompetitors.has(i);
              const atLimit = selectedCompetitors.size >= competitorLimit;
              const isDisabled = !isSelected && atLimit;
              return (
                <Card
                  key={i}
                  className={`transition-colors ${isDisabled ? "opacity-50 pointer-events-none" : "cursor-pointer"} ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}
                  onClick={() => !isDisabled && toggleCompetitor(i)}
                  data-testid={`card-competitor-${i}`}
                >
                  <CardContent className="flex items-start gap-3 py-4">
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{comp.name}</span>
                        <span className="text-xs text-muted-foreground">{comp.domain}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{comp.description}</p>
                      {isDisabled && (
                        <p className="text-xs text-amber-400 mt-1" data-testid={`text-competitor-disabled-${i}`}>
                          Competitor limit reached — deselect one above to choose this instead
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {foundCompetitors.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No competitors found. You can add one manually below, or proceed without competitors.</p>
              </CardContent>
            </Card>
          )}

          {showManualAdd ? (
            <Card>
              <CardContent className="pt-5 pb-4 space-y-3">
                {selectedCompetitors.size >= competitorLimit && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400" data-testid="text-competitor-limit-warning">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>You've reached your plan's competitor limit. Deselect one above to add another.</span>
                  </div>
                )}
                <p className="text-sm font-medium text-foreground">Add a competitor by URL</p>
                <div className="flex items-center gap-2">
                  <Input
                    value={manualCompUrl}
                    onChange={(e) => setManualCompUrl(e.target.value)}
                    placeholder="e.g. hubspot.com or https://competitor.com"
                    disabled={addCompetitorUrlMutation.isPending}
                    data-testid="input-manual-competitor-url"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCompUrl.trim()) {
                        e.preventDefault();
                        addCompetitorUrlMutation.mutate(manualCompUrl.trim());
                      }
                    }}
                  />
                  <Button
                    onClick={() => addCompetitorUrlMutation.mutate(manualCompUrl.trim())}
                    disabled={!manualCompUrl.trim() || addCompetitorUrlMutation.isPending}
                    data-testid="button-research-competitor"
                  >
                    {addCompetitorUrlMutation.isPending ? (
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
                {!addCompetitorUrlMutation.isPending && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowManualAdd(false); setManualCompUrl(""); }}
                    data-testid="button-cancel-manual-add"
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManualAdd(true)}
              data-testid="button-show-manual-add"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add competitor manually
            </Button>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStage("territory")}
              data-testid="button-back-territory"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Change location
            </Button>
            <Button
              onClick={() => createBrandMutation.mutate()}
              disabled={createBrandMutation.isPending}
              data-testid="button-start-scan"
            >
              {createBrandMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Confirm & Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "territory") {
    return (
      <div className="flex h-full items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full space-y-6">
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="text-xs">Step 2 of 4</Badge>
            </div>
            <PageHeading title="Where do you operate?" headingClassName="text-3xl font-bold text-foreground" headingTestId="text-territory-title" />
            <p className="text-muted-foreground">
              This helps us find the right competitors in your market.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTerritoryType("global")}
                  className={`flex flex-col items-center gap-2 rounded-md border p-4 transition-colors cursor-pointer ${territoryType === "global" ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid="button-territory-global"
                >
                  <Globe className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Global / Online</span>
                  <span className="text-xs text-muted-foreground text-center">We serve customers worldwide</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTerritoryType("regional")}
                  className={`flex flex-col items-center gap-2 rounded-md border p-4 transition-colors cursor-pointer ${territoryType === "regional" ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid="button-territory-regional"
                >
                  <MapPin className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Region / Location</span>
                  <span className="text-xs text-muted-foreground text-center">We focus on a specific area</span>
                </button>
              </div>

              {territoryType === "regional" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Your location</label>
                  <Input
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    placeholder="e.g. UK, Yorkshire, New York, Europe"
                    data-testid="input-location"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Type a country, region, city, or area — as specific or broad as you like.
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={onFindCompetitors}
                disabled={competitorMutation.isPending}
                data-testid="button-find-competitors"
              >
                {competitorMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Find my competitors
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (stage === "review" && researchData) {
    const hasNullFields = researchData.category === null || researchData.problemStatement === null || researchData.targetAudience === null || researchData.brandPositioning === null || researchData.products === null || researchData.differentiators === null;

    return (
      <div className="flex h-full items-start justify-center px-4 py-8 overflow-y-auto">
        <div className="max-w-2xl w-full space-y-6 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 1 of 4</Badge>
            </div>
            <PageHeading title="Here's what we found" headingClassName="text-3xl font-bold text-foreground" headingTestId="text-review-title" />
            <p className="text-muted-foreground">
              Review the details below and make any changes. We'll find your competitors next.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardDescription className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  {researchData.domain}
                </CardDescription>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStage("url");
                    setResearchData(null);
                    clearProgress();
                  }}
                  data-testid="button-start-over"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Start over
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {hasNullFields && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-200/80" data-testid="text-null-fields-warning">
                    Some fields couldn't be determined from your website. Fields marked with a warning need your input.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Company / Brand name</label>
                <Input
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  placeholder="e.g. HubSpot, Acme Corp, Stripe"
                  data-testid="input-company-name"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  {researchData.category === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Project Management, Cloud Security, HR Technology"
                  data-testid="input-category"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">What problem do you solve?</label>
                  {researchData.problemStatement === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Textarea
                  value={editProblem}
                  onChange={(e) => setEditProblem(e.target.value)}
                  placeholder="e.g. We help marketing teams automate personalised email campaigns at scale"
                  rows={3}
                  data-testid="input-problem-statement"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">Target audience</label>
                  {researchData.targetAudience === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Input
                  value={editAudience}
                  onChange={(e) => setEditAudience(e.target.value)}
                  placeholder="e.g. B2B SaaS marketing teams at mid-market companies"
                  data-testid="input-target-audience"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">Brand positioning</label>
                  {researchData.brandPositioning === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Input
                  value={editPositioning}
                  onChange={(e) => setEditPositioning(e.target.value)}
                  placeholder="e.g. The only email platform built for lifecycle marketers"
                  data-testid="input-brand-positioning"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">Products / Services</label>
                  {researchData.products === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Textarea
                  value={editProducts}
                  onChange={(e) => setEditProducts(e.target.value)}
                  placeholder="e.g. Email automation, landing page builder, CRM integration"
                  rows={2}
                  data-testid="input-products"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium text-foreground">Key differentiators</label>
                  {researchData.differentiators === null && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <Textarea
                  value={editDifferentiators}
                  onChange={(e) => setEditDifferentiators(e.target.value)}
                  placeholder="e.g. AI-powered personalisation, no-code workflow builder, enterprise-grade security"
                  rows={2}
                  data-testid="input-differentiators"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Brand tone</label>
                <Input
                  value={editBrandTone}
                  onChange={(e) => setEditBrandTone(e.target.value)}
                  placeholder="e.g. Professional, Casual, Technical, Friendly, Authoritative"
                  data-testid="input-brand-tone"
                />
              </div>

              {researchData.suggestedTerms.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Suggested search terms to track</label>
                  <p className="text-xs text-muted-foreground">
                    These are search queries where your brand should appear in AI responses. You can manage these later from your dashboard.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {researchData.suggestedTerms.map((term, i) => (
                      <Badge key={i} variant="secondary" data-testid={`badge-suggested-term-${i}`}>
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => {
                setStage("territory");
                saveProgress("territory");
              }}
              data-testid="button-next-territory"
            >
              Next: Find competitors
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <PageHeading title="Let's find out what AI thinks about you" headingClassName="text-3xl font-bold text-foreground" headingTestId="text-onboarding-title" />
          <p className="text-muted-foreground">
            Enter your website address and our AI will research your brand and set everything up automatically.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Form {...urlForm}>
              <form onSubmit={urlForm.handleSubmit(onUrlSubmit)} className="space-y-5">
                <FormField
                  control={urlForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your website</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="yourcompany.com"
                          data-testid="input-domain"
                          autoFocus
                        />
                      </FormControl>
                      <div className="min-h-[18px]">
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={researchMutation.isPending}
                  data-testid="button-research"
                >
                  {researchMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Research my brand
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          We'll use AI to understand your brand and suggest the key search terms to track across ChatGPT, Claude, and Gemini.
        </p>
      </div>
    </div>
  );
}

function QuestionsReviewCard({
  termId,
  termText,
  questions,
  onDelete,
  onAdd,
}: {
  termId: number;
  termText: string;
  questions: Array<{ id: number; question: string; isActive: boolean; questionCategory: string }>;
  onDelete: (questionId: number) => void;
  onAdd: (question: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");

  const discoveryQuestions = questions.filter(q => q.questionCategory === "user_question");
  const brandQuestions = questions.filter(q => q.questionCategory === "brand_sentiment");

  const renderQuestionList = (qs: typeof questions) => (
    qs.length === 0 ? (
      <p className="text-sm text-muted-foreground py-2">No questions generated.</p>
    ) : (
      qs.map((q) => (
        <div
          key={q.id}
          className="flex items-center gap-2 py-1.5 px-2 rounded-md group"
          data-testid={`row-onboard-question-${q.id}`}
        >
          <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-sm flex-1 min-w-0 break-words">{q.question}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 invisible group-hover:visible"
            onClick={() => onDelete(q.id)}
            data-testid={`button-delete-onboard-question-${q.id}`}
          >
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      ))
    )
  );

  return (
    <Card data-testid={`card-questions-term-${termId}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Key Term</p>
            <p className="text-sm font-medium text-foreground">{termText}</p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="border-t border-border/50 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs font-medium text-foreground">Discovery Questions</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Questions a potential customer would ask without knowing your brand — testing if AI surfaces you organically.
          </p>
          {renderQuestionList(discoveryQuestions)}
        </div>

        <div className="border-t border-border/50 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs font-medium text-foreground">Brand Questions</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Questions that mention your brand by name — testing if AI knows about and recommends you.
          </p>
          {renderQuestionList(brandQuestions)}
        </div>

        {adding ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="Enter a custom question..."
              className="text-sm flex-1"
              autoFocus
              data-testid={`input-onboard-question-${termId}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newQ.trim()) {
                  onAdd(newQ.trim());
                  setNewQ("");
                  setAdding(false);
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                if (newQ.trim()) {
                  onAdd(newQ.trim());
                  setNewQ("");
                  setAdding(false);
                }
              }}
              disabled={!newQ.trim()}
            >
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setNewQ(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            data-testid={`button-add-onboard-question-${termId}`}
          >
            <Plus className="h-3 w-3 mr-1" /> Add custom question
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
