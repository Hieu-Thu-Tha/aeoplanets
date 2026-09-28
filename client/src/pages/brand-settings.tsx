import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tag, Loader2, Save, Globe, Building2, Target, Users, FileText, Layers,
  Swords, Plus, Trash2, Search, X, AlertTriangle, MapPin, Package, Sparkles, MessageSquare,
  RefreshCw, CheckCircle2
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeading } from "@/components/ui/enterprise";
import { useSubscription } from "@/hooks/useSubscription";
import Terms from "./terms";

function getTabFromUrl(): "profile" | "competitors" | "terms" {
  if (typeof window === "undefined") return "profile";
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab");
  if (t === "terms" || t === "competitors" || t === "profile") return t;
  return "profile";
}

export default function BrandSettings() {
  const [activeTab, setActiveTab] = useState<"profile" | "competitors" | "terms">(getTabFromUrl);

  usePageMeta({
    title: "Brand Settings — AEOSTARS",
    description: "Manage your brand profile, competitors, and tracked key terms.",
    ogType: "website",
  });

  const tabs = [
    { id: "profile" as const, label: "Brand Profile", icon: Building2, testId: "tab-brand-profile" },
    { id: "competitors" as const, label: "Competitors", icon: Swords, testId: "tab-competitors" },
    { id: "terms" as const, label: "Key Terms", icon: Tag, testId: "tab-key-terms" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <PageHeading
        title="Brand Settings"
        subtitle="Configure your brand profile, manage competitors, and set the key terms AI monitors for you."
        headingClassName="text-2xl font-bold"
        headingTestId="text-brand-settings-heading"
        subtitleClassName="text-muted-foreground text-sm mt-1"
        subtitleTestId="text-brand-settings-description"
      />

      <div className="flex items-center gap-1 border-b border-border" data-testid="tabs-brand-settings">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={tab.testId}
          >
            <tab.icon className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && <BrandProfileTab />}
      {activeTab === "competitors" && <CompetitorsTab />}
      {activeTab === "terms" && <Terms embedded />}
    </div>
  );
}

function CompetitorsTab() {
  const { activeBrand, activeBrandId } = useBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { limits, usage, plan } = useSubscription();

  const [competitors, setCompetitors] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (activeBrand) {
      setCompetitors(activeBrand.competitors || []);
    }
  }, [activeBrandId, activeBrand]);

  const competitorLimit = limits.competitors;
  const currentCount = competitors.length;
  const atLimit = competitorLimit !== null && currentCount >= competitorLimit;
  const atLimitForAdd = atLimit || (competitorLimit !== null && currentCount + 1 > competitorLimit);

  const saveMutation = useMutation({
    mutationFn: async (newCompetitors: string[]) => {
      const res = await apiRequest("PATCH", `/api/brands/${activeBrandId}`, {
        competitors: newCompetitors,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update competitors");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
    onError: (err: any) => {
      setCompetitors(activeBrand?.competitors || []);
      toast({ title: "Error", description: err?.message || "Failed to update competitors", variant: "destructive" });
    },
  });

  const researchMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/brands/research-competitor-url", {
        url,
        brandName: activeBrand?.companyName || activeBrand?.domain || "",
        category: activeBrand?.category || "",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to research competitor");
      }
      return res.json() as Promise<{ name: string; domain: string; description: string }>;
    },
    onSuccess: (data) => {
      const domain = data.domain?.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "");
      const isDuplicate = competitors.some(
        (c) => c.toLowerCase() === domain.toLowerCase()
      );
      if (isDuplicate) {
        toast({ title: "Already tracked", description: `${domain} is already in your competitor list.` });
        return;
      }

      const newList = [...competitors, domain];
      setCompetitors(newList);
      saveMutation.mutate(newList);
      setManualUrl("");
      setShowAddForm(false);
      toast({ title: "Competitor added", description: `${data.name || domain} has been added to your tracked competitors.` });
    },
    onError: (err: any) => {
      toast({ title: "Research failed", description: err?.message || "Could not research that URL. Try a different one.", variant: "destructive" });
    },
  });

  function handleRemove(domain: string) {
    const newList = competitors.filter((c) => c !== domain);
    setCompetitors(newList);
    setPendingDelete(null);
    saveMutation.mutate(newList);
    toast({ title: "Competitor removed", description: `${domain} has been removed from tracking.` });
  }

  function handleAddManual() {
    const url = manualUrl.trim();
    if (!url) return;
    researchMutation.mutate(url);
  }

  if (!activeBrand) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground text-sm" data-testid="text-no-brand-competitors">
          No brand selected. Use the brand switcher to select a brand.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-competitors-description">
          Manage the competitors you track against. These are used in AI visibility scans, competitor positioning analysis, and coverage gap comparisons.
        </p>
        <Badge variant="outline" className="shrink-0" data-testid="badge-competitor-usage">
          {currentCount} / {competitorLimit === null ? "Unlimited" : competitorLimit}
        </Badge>
      </div>

      {competitors.length > 0 ? (
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="divide-y divide-border">
              {competitors.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between gap-3 flex-wrap py-3"
                  data-testid={`competitor-row-${domain}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium truncate" data-testid={`text-competitor-domain-${domain}`}>
                      {domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {pendingDelete === domain ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemove(domain)}
                          disabled={saveMutation.isPending}
                          data-testid={`button-confirm-delete-${domain}`}
                        >
                          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(null)}
                          data-testid={`button-cancel-delete-${domain}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(domain)}
                        data-testid={`button-delete-competitor-${domain}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center" data-testid="text-no-competitors">
            <Swords className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No competitors tracked yet</p>
            <p className="text-xs text-muted-foreground">
              Add competitors to monitor how they appear alongside your brand in AI responses.
            </p>
          </CardContent>
        </Card>
      )}

      {showAddForm ? (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Add a competitor by URL</p>
            <div className="flex items-center gap-2">
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="e.g. hubspot.com or https://competitor.com"
                disabled={researchMutation.isPending}
                data-testid="input-add-competitor-url"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualUrl.trim()) {
                    e.preventDefault();
                    handleAddManual();
                  }
                }}
              />
              <Button
                onClick={handleAddManual}
                disabled={!manualUrl.trim() || researchMutation.isPending || atLimitForAdd}
                data-testid="button-research-add-competitor"
              >
                {researchMutation.isPending ? (
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
              Enter a website URL and our AI will research and verify the company before adding it to your list.
            </p>
            {atLimitForAdd && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="text-add-form-limit-warning">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                All competitor slots in use. <Link href="/billing" className="text-primary underline underline-offset-2" data-testid="link-addon-competitor-pack">Add a Competitor Pack</Link> or upgrade your plan.
              </p>
            )}
            {!researchMutation.isPending && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowAddForm(false); setManualUrl(""); }}
                data-testid="button-cancel-add-competitor"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            disabled={atLimit}
            data-testid="button-add-competitor"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add competitor
          </Button>
          {atLimit && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="text-competitor-limit-reached">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              All competitor slots in use. <Link href="/billing" className="text-primary underline underline-offset-2" data-testid="link-addon-competitor-pack-inline">Add a Competitor Pack</Link> or upgrade your plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BrandProfileTab() {
  const { activeBrand, activeBrandId, brands } = useBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandPositioning, setBrandPositioning] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [keyTopics, setKeyTopics] = useState("");
  const [territory, setTerritory] = useState("");
  const [location, setLocation] = useState("");
  const [products, setProducts] = useState("");
  const [differentiators, setDifferentiators] = useState("");
  const [brandTone, setBrandTone] = useState("");

  useEffect(() => {
    if (activeBrand) {
      setCompanyName(activeBrand.companyName || "");
      setDomain(activeBrand.domain || "");
      setCategory(activeBrand.category || "");
      setTargetAudience(activeBrand.targetAudience || "");
      setBrandPositioning(activeBrand.brandPositioning || "");
      setProblemStatement(activeBrand.problemStatement || "");
      setKeyTopics(activeBrand.keyTopics || "");
      setTerritory(activeBrand.territory || "");
      setLocation(activeBrand.location || "");
      setProducts(activeBrand.products || "");
      setDifferentiators(activeBrand.differentiators || "");
      setBrandTone(activeBrand.brandTone || "");
    }
  }, [activeBrandId]);

  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [refreshCompetitors, setRefreshCompetitors] = useState(false);
  const [refreshQuestions, setRefreshQuestions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);

  const originalValuesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (activeBrand) {
      originalValuesRef.current = {
        companyName: activeBrand.companyName || "",
        category: activeBrand.category || "",
        targetAudience: activeBrand.targetAudience || "",
        brandPositioning: activeBrand.brandPositioning || "",
        problemStatement: activeBrand.problemStatement || "",
        keyTopics: activeBrand.keyTopics || "",
        territory: activeBrand.territory || "",
        location: activeBrand.location || "",
        products: activeBrand.products || "",
        differentiators: activeBrand.differentiators || "",
        brandTone: activeBrand.brandTone || "",
      };
    }
  }, [activeBrand]);

  const FIELD_LABELS: Record<string, string> = {
    companyName: "Company Name",
    category: "Category / Industry",
    targetAudience: "Target Audience",
    brandPositioning: "Brand Positioning",
    problemStatement: "Problem Statement",
    keyTopics: "Key Topics",
    territory: "Territory",
    location: "Location",
    products: "Products / Services",
    differentiators: "Key Differentiators",
    brandTone: "Brand Tone",
  };

  const COMPETITOR_FIELDS = ["category", "territory", "location", "products", "targetAudience", "problemStatement", "differentiators"];
  const QUESTION_FIELDS = ["category", "territory", "location", "products", "targetAudience", "differentiators", "brandTone", "keyTopics", "problemStatement"];

  const { data: trackedTermsData } = useQuery<any[]>({
    queryKey: ["/api/tracked-terms"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/brands/${activeBrandId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });

      const currentValues: Record<string, string> = {
        companyName: companyName.trim(),
        category: category.trim(),
        targetAudience: targetAudience.trim(),
        brandPositioning: brandPositioning.trim(),
        problemStatement: problemStatement.trim(),
        keyTopics: keyTopics.trim(),
        territory,
        location: location.trim(),
        products: products.trim(),
        differentiators: differentiators.trim(),
        brandTone,
      };

      const changed: string[] = [];
      for (const [key, val] of Object.entries(currentValues)) {
        if ((originalValuesRef.current[key] || "") !== (val || "")) {
          changed.push(key);
        }
      }

      if (changed.length > 0) {
        const affectsCompetitors = changed.some(f => COMPETITOR_FIELDS.includes(f));
        const affectsQuestions = changed.some(f => QUESTION_FIELDS.includes(f));

        if (affectsCompetitors || affectsQuestions) {
          setChangedFields(changed);
          setRefreshCompetitors(affectsCompetitors);
          setRefreshQuestions(affectsQuestions);
          setShowRefreshDialog(true);
        } else {
          toast({ title: "Brand updated", description: "Your brand profile has been saved." });
        }

        originalValuesRef.current = currentValues;
      } else {
        toast({ title: "Brand updated", description: "Your brand profile has been saved." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update brand", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/brands/${activeBrandId}`);
    },
    onSuccess: () => {
      localStorage.removeItem("aeostars_active_brand_id");
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Brand removed", description: "The brand has been permanently removed from your account." });
      const remaining = brands.filter(b => b.id !== activeBrandId);
      if (remaining.length > 0) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to remove brand", variant: "destructive" });
    },
  });

  function handleSave() {
    if (!activeBrandId) return;
    updateMutation.mutate({
      companyName: companyName.trim() || null,
      category: category.trim() || null,
      targetAudience: targetAudience.trim() || null,
      brandPositioning: brandPositioning.trim() || null,
      problemStatement: problemStatement.trim() || null,
      keyTopics: keyTopics.trim() || null,
      territory: territory || null,
      location: location.trim() || null,
      products: products.trim() || null,
      differentiators: differentiators.trim() || null,
      brandTone: brandTone || null,
    });
  }

  async function handleRefreshData() {
    if (!activeBrandId || !activeBrand) return;
    if (!refreshCompetitors && !refreshQuestions) {
      setShowRefreshDialog(false);
      toast({ title: "Brand updated", description: "Your brand profile has been saved." });
      return;
    }

    setIsRefreshing(true);

    try {
      if (refreshCompetitors) {
        setRefreshProgress("Researching competitors based on updated profile...");
        const compRes = await apiRequest("POST", "/api/brands/research-competitors", {
          brandName: activeBrand.companyName || activeBrand.domain,
          domain: activeBrand.domain,
          category: category.trim(),
          problemStatement: problemStatement.trim(),
          targetAudience: targetAudience.trim(),
          brandPositioning: brandPositioning.trim(),
          products: products.trim(),
          differentiators: differentiators.trim(),
          territory: territory,
          location: location.trim(),
        });
        const compData = await compRes.json();
        if (compData.competitors && compData.competitors.length > 0) {
          const newDomains = compData.competitors.map((c: any) => c.domain).filter(Boolean);
          const existing = activeBrand.competitors || [];
          const merged = [...new Set([...existing, ...newDomains])];
          await apiRequest("PATCH", `/api/brands/${activeBrandId}`, { competitors: merged });
          queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
          toast({ title: "Competitors refreshed", description: `Found ${newDomains.length} competitor(s). ${merged.length} total now tracked.` });
        }
      }

      if (refreshQuestions) {
        setRefreshProgress("Regenerating questions for tracked terms...");
        const brandTerms = (trackedTermsData || []).filter((t: any) => t.brandId === activeBrandId && t.isActive);

        if (brandTerms.length > 0) {
          const termIds = brandTerms.map((t: any) => t.id);
          for (const termId of termIds) {
            await apiRequest("DELETE", `/api/tracked-terms/${termId}/questions`);
          }
          await apiRequest("POST", "/api/tracked-terms/generate-questions-bulk", {
            termIds,
            brandId: activeBrandId,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/tracked-terms"] });
          queryClient.invalidateQueries({ queryKey: [`/api/brands/${activeBrandId}/user-questions`] });
          toast({ title: "Questions regenerated", description: `Updated questions for ${brandTerms.length} tracked term(s) using your new brand profile.` });
        } else {
          toast({ title: "No terms to refresh", description: "No active tracked terms found for this brand." });
        }
      }

      setRefreshProgress(null);
      setShowRefreshDialog(false);
      toast({ title: "Refresh complete", description: "Your workspace has been updated with the new brand profile." });
    } catch (err: any) {
      toast({ title: "Refresh error", description: err?.message || "Some data could not be refreshed. Try again later.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  }

  if (!activeBrand) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground text-sm" data-testid="text-no-brand-selected">
          No brand selected. Use the brand switcher to select a brand.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground" data-testid="text-brand-profile-description">
        These details feed into how AI scans are run, how prompts are built, and how your brand is matched in LLM responses.
      </p>

      <Card>
        <CardContent className="pt-5 pb-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">
                <Building2 className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Company Name
              </Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                data-testid="input-company-name"
              />
              <p className="text-xs text-muted-foreground">
                Used in AI prompts and response matching. If blank, the domain name is used instead.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="domain">
                <Globe className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Domain
              </Label>
              <Input
                id="domain"
                value={domain}
                disabled
                className="opacity-60"
                data-testid="input-domain"
              />
              <p className="text-xs text-muted-foreground">
                Set during onboarding. Contact support to change.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="category">
                <Layers className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Category
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Marketing Automation"
                data-testid="input-brand-category"
              />
              <p className="text-xs text-muted-foreground">
                Your market category. Used to generate relevant comparison prompts.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target-audience">
                <Users className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Target Audience
              </Label>
              <Input
                id="target-audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. B2B marketers, SaaS companies"
                data-testid="input-target-audience"
              />
              <p className="text-xs text-muted-foreground">
                Who your product is for. Shapes the questions AI generates.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="territory">
                <Globe className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                Territory
              </Label>
              <Select
                value={territory}
                onValueChange={(val) => {
                  setTerritory(val);
                  if (val === "global") setLocation("");
                }}
              >
                <SelectTrigger id="territory" data-testid="select-territory">
                  <SelectValue placeholder="Select territory scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Whether your brand operates globally or targets a specific region.
              </p>
            </div>

            {territory === "regional" && (
              <div className="space-y-1.5">
                <Label htmlFor="location">
                  <MapPin className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                  Location
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Manchester, UK or California"
                  data-testid="input-location"
                />
                <p className="text-xs text-muted-foreground">
                  Your primary market location. Used to localise AI scan prompts.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-positioning">
              <Target className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Brand Positioning
            </Label>
            <Textarea
              id="brand-positioning"
              value={brandPositioning}
              onChange={(e) => setBrandPositioning(e.target.value)}
              placeholder="e.g. The only marketing automation platform built specifically for mid-market B2B"
              rows={2}
              data-testid="input-brand-positioning"
            />
            <p className="text-xs text-muted-foreground">
              Your unique positioning statement. Used in perception and competitor analysis.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="problem-statement">
              <FileText className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Problem Statement
            </Label>
            <Textarea
              id="problem-statement"
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              placeholder="e.g. Mid-market B2B companies struggle with marketing automation tools designed for enterprise"
              rows={2}
              data-testid="input-problem-statement"
            />
            <p className="text-xs text-muted-foreground">
              The core problem your brand solves. Helps AI understand your value proposition.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="products">
              <Package className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Products / Services
            </Label>
            <Textarea
              id="products"
              value={products}
              onChange={(e) => setProducts(e.target.value)}
              placeholder="e.g. Email campaigns, Landing page builder, CRM integration, Analytics dashboard"
              rows={2}
              data-testid="input-products"
            />
            <p className="text-xs text-muted-foreground">
              Core products or services your brand offers. Helps AI generate product-aware questions.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="differentiators">
              <Sparkles className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Key Differentiators
            </Label>
            <Textarea
              id="differentiators"
              value={differentiators}
              onChange={(e) => setDifferentiators(e.target.value)}
              placeholder="e.g. No-code workflow builder, Built-in A/B testing, Dedicated mid-market support"
              rows={2}
              data-testid="input-differentiators"
            />
            <p className="text-xs text-muted-foreground">
              What makes your brand unique vs competitors. Used in competitive analysis prompts.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-tone">
              <MessageSquare className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Brand Tone
            </Label>
            <Select value={brandTone} onValueChange={setBrandTone}>
              <SelectTrigger id="brand-tone" data-testid="select-brand-tone">
                <SelectValue placeholder="Select brand tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="authoritative">Authoritative</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Your brand's communication style. Influences how AI interprets your messaging.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="key-topics">
              <Tag className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
              Key Topics
            </Label>
            <Textarea
              id="key-topics"
              value={keyTopics}
              onChange={(e) => setKeyTopics(e.target.value)}
              placeholder="e.g. project management, team collaboration, workflow automation, reporting"
              rows={2}
              data-testid="input-key-topics"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated topics your brand should be known for. Used in coverage gap analysis.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-brand"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5" data-testid="text-remove-brand-heading">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Remove Brand
              </h3>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-remove-brand-description">
                Permanently remove <span className="font-medium text-foreground">{activeBrand?.companyName || activeBrand?.domain}</span> from your account.
                This deletes all scan history, tracked terms, questions, and visibility data. This action cannot be undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  data-testid="button-remove-brand"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Remove Brand
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle data-testid="text-confirm-remove-title">Remove {activeBrand?.companyName || activeBrand?.domain}?</AlertDialogTitle>
                  <AlertDialogDescription data-testid="text-confirm-remove-description">
                    This will permanently delete the brand profile, all scan history, tracked terms,
                    generated questions, and visibility data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground"
                    data-testid="button-confirm-remove"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Remove permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRefreshDialog} onOpenChange={(open) => { if (!isRefreshing) setShowRefreshDialog(open); }}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-refresh-data">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-refresh-dialog-title">
              <RefreshCw className="h-5 w-5 text-primary" />
              Update Related Data?
            </DialogTitle>
            <DialogDescription data-testid="text-refresh-dialog-description">
              You've updated your brand profile. Some of your existing data may no longer reflect these changes. Select which areas you'd like to refresh.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Fields changed:</p>
              <div className="flex flex-wrap gap-1.5">
                {changedFields.map(f => (
                  <Badge key={f} variant="secondary" className="text-xs">
                    {FIELD_LABELS[f] || f}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {changedFields.some(f => COMPETITOR_FIELDS.includes(f)) && (
                <label
                  className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover-elevate"
                  data-testid="checkbox-refresh-competitors"
                >
                  <Checkbox
                    checked={refreshCompetitors}
                    onCheckedChange={(v) => setRefreshCompetitors(!!v)}
                    disabled={isRefreshing}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-none">
                      <Swords className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                      Refresh Competitors
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Re-discover competitors using your updated category, location, and products. New competitors will be added alongside existing ones.
                    </p>
                  </div>
                </label>
              )}

              {changedFields.some(f => QUESTION_FIELDS.includes(f)) && (
                <label
                  className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover-elevate"
                  data-testid="checkbox-refresh-questions"
                >
                  <Checkbox
                    checked={refreshQuestions}
                    onCheckedChange={(v) => setRefreshQuestions(!!v)}
                    disabled={isRefreshing}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-none">
                      <Tag className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                      Regenerate Questions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Regenerate all scan questions for your {(trackedTermsData || []).filter((t: any) => t.brandId === activeBrandId && t.isActive).length} tracked term(s) using the updated brand profile. Existing questions will be replaced.
                    </p>
                  </div>
                </label>
              )}
            </div>

            {isRefreshing && refreshProgress && (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <p className="text-sm text-primary" data-testid="text-refresh-progress">{refreshProgress}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowRefreshDialog(false);
                toast({ title: "Brand updated", description: "Your brand profile has been saved. Existing data was kept as-is." });
              }}
              disabled={isRefreshing}
              data-testid="button-skip-refresh"
            >
              Skip — Keep Existing Data
            </Button>
            <Button
              onClick={handleRefreshData}
              disabled={isRefreshing || (!refreshCompetitors && !refreshQuestions)}
              data-testid="button-confirm-refresh"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
