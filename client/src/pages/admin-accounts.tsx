import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountLlmCostBreakdown, type CostBreakdownTab } from "@/components/AccountLlmCostBreakdown";
import { useToast } from "@/hooks/use-toast";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { PageHeading } from "@/components/ui/enterprise";
import {
  DEFAULT_TRIAL_PLAN,
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_KEYS,
  TRIAL_PLAN_LABELS,
  trialPlanLabel,
  type PersistedTrialPlan,
  type TrialPlan,
} from "@shared/trial";
import {
  Loader2,
  Search,
  Ban,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Users,
  Shield,
  DollarSign,
  Plus,
  Globe,
  Mail,
  Clock,
  RotateCw,
  Pencil,
  Inbox,
  Wallet,
} from "lucide-react";

interface TeamMemberDetail {
  id: number;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  permissions: Record<string, boolean>;
}

interface LlmCost {
  modelId: string;
  runs: number;
  estimatedCost: number; // measured USD for the provider/model row
}

interface AccountBrand {
  id: number;
  name: string;
}

interface AccountData {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  plan: string;
  planDisplayName: string;
  subscriptionStatus: string;
  brandsCount: number;
  brands: AccountBrand[];
  teamMembersCount: number;
  teamMembers: TeamMemberDetail[];
  llmCosts: LlmCost[];
  // Pre-instrumentation chars/4 estimate over historical visibility runs (USD)
  legacyEstimatedCost: number;
  // Sum of measured ai_usage_logs cost (USD)
  measuredCost: number;
  // legacy + measured (USD)
  totalLlmCost: number;
  isProtectedAccount: boolean;
  accountType: string;
  manualBilling: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

const MANUAL_BILLING_PLANS: { value: string; label: string }[] = [
  { value: "starter_v2", label: "Starter" },
  { value: "growth_v2", label: "Growth" },
  { value: "accelerate", label: "Accelerate" },
  { value: "enterprise", label: "Custom" },
];

const DEFAULT_TRIAL_DURATION_DAYS = String(TRIAL_DURATION_DAYS);

// Costs are stored/served in USD; GBP is display-time conversion at the live rate
type CostFormatter = (usdAmount: number) => string;

interface ProvisionedAccountData {
  id: number;
  email: string;
  websiteUrl: string;
  brandName: string | null;
  scanStatus: string;
  emailSent: boolean;
  registeredUserId: string | null;
  trialDurationDays: number;
  trialPlan: PersistedTrialPlan;
  createdAt: string;
}

interface TrialRequestData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  websiteUrl: string;
  status: "pending" | "accepted" | "declined";
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  provisionedAccountId: number | null;
  createdAt: string;
}

function RequestedTrialAccountsSection() {
  const { toast } = useToast();
  const { data } = useQuery<{ requests: TrialRequestData[] }>({
    queryKey: ["/api/super-admin/trial-requests"],
  });
  const requests = data?.requests ?? [];

  const [editing, setEditing] = useState<TrialRequestData | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", websiteUrl: "" });
  const [confirmAction, setConfirmAction] = useState<{ kind: "accept" | "decline" | "delete"; req: TrialRequestData } | null>(null);
  const [acceptTrialDurationDays, setAcceptTrialDurationDays] = useState(DEFAULT_TRIAL_DURATION_DAYS);
  const [acceptTrialPlan, setAcceptTrialPlan] = useState<TrialPlan>(DEFAULT_TRIAL_PLAN);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/super-admin/trial-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/provisioned-accounts"] });
  };

  const editMutation = useMutation({
    mutationFn: async (vars: { id: number; values: typeof editForm }) => {
      const res = await apiRequest("PATCH", `/api/super-admin/trial-requests/${vars.id}`, vars.values);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request updated" });
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ id, trialDurationDays, trialPlan }: { id: number; trialDurationDays: number; trialPlan: TrialPlan }) => {
      const res = await apiRequest("POST", `/api/super-admin/trial-requests/${id}/accept`, { trialDurationDays, trialPlan });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trial accepted", description: "Provisioning pipeline started." });
      setConfirmAction(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Accept failed", description: err.message, variant: "destructive" }),
  });

  const declineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/super-admin/trial-requests/${id}/decline`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request declined" });
      setConfirmAction(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Decline failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/super-admin/trial-requests/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request deleted" });
      setConfirmAction(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const sorted = [...requests].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function statusBadge(status: TrialRequestData["status"]) {
    if (status === "accepted")
      return <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Accepted</Badge>;
    if (status === "declined") return <Badge variant="secondary">Declined</Badge>;
    return <Badge variant="outline" className="border-amber-500/40 text-amber-500">Pending</Badge>;
  }

  function openEdit(req: TrialRequestData) {
    setEditing(req);
    setEditForm({
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      websiteUrl: req.websiteUrl,
    });
  }

  const isMutating = acceptMutation.isPending || declineMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Card id="requested-trial-accounts">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Requested Trial Accounts
          </CardTitle>
        </CardHeader>
        <CardContent className={sorted.length === 0 ? "" : "p-0"}>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-trial-requests-empty">
              No trial requests yet. Submissions from the public /start-trial page will appear here.
            </p>
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id} data-testid={`row-trial-request-${r.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{r.firstName} {r.lastName}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-trial-request-email-${r.id}`}>{r.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                      <a href={r.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline">{r.websiteUrl}</a>
                    </TableCell>
                    <TableCell>
                      {statusBadge(r.status)}
                      {r.status === "accepted" && r.provisionedAccountId && (
                        <a
                          href={`#provisioned-account-${r.provisionedAccountId}`}
                          className="ml-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          data-testid={`link-provisioned-account-${r.provisionedAccountId}`}
                        >
                          #{r.provisionedAccountId}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)} data-testid={`button-edit-trial-request-${r.id}`}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setAcceptTrialDurationDays(DEFAULT_TRIAL_DURATION_DAYS);
                                setAcceptTrialPlan(DEFAULT_TRIAL_PLAN);
                                setConfirmAction({ kind: "accept", req: r });
                              }}
                              data-testid={`button-accept-trial-request-${r.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmAction({ kind: "decline", req: r })}
                              data-testid={`button-decline-trial-request-${r.id}`}
                            >
                              <Ban className="h-3 w-3 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ kind: "delete", req: r })}
                          data-testid={`button-delete-trial-request-${r.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit trial request</DialogTitle>
            <DialogDescription>Correct any details before accepting. Duplicate guards are re-run on save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-1">
                <Label>Last name</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-1">
              <Label>Website URL</Label>
              <Input
                value={editForm.websiteUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                data-testid="input-edit-website"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="button-edit-cancel">
              Cancel
            </Button>
            <Button
              disabled={editMutation.isPending}
              onClick={() => editing && editMutation.mutate({ id: editing.id, values: editForm })}
              data-testid="button-edit-save"
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "accept" && "Accept trial request?"}
              {confirmAction?.kind === "decline" && "Decline trial request?"}
              {confirmAction?.kind === "delete" && "Delete trial request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "accept" &&
                `This will start the full provisioning pipeline for ${confirmAction.req.email} (${confirmAction.req.websiteUrl}). The prospect will be emailed once it completes.`}
              {confirmAction?.kind === "decline" &&
                `Mark the request from ${confirmAction.req.email} as declined? It will be kept for audit.`}
              {confirmAction?.kind === "delete" &&
                `Permanently delete the request from ${confirmAction.req.email}? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmAction?.kind === "accept" && (
            <div className="grid gap-3 px-6 pb-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="accept-trial-plan">Plan</Label>
                <Select value={acceptTrialPlan} onValueChange={(value) => setAcceptTrialPlan(value as TrialPlan)}>
                  <SelectTrigger id="accept-trial-plan" data-testid="select-accept-trial-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIAL_PLAN_KEYS.map((plan) => (
                      <SelectItem key={plan} value={plan}>{TRIAL_PLAN_LABELS[plan]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="accept-trial-duration">Trial duration (days)</Label>
                <Input
                  id="accept-trial-duration"
                  type="number"
                  min={1}
                  value={acceptTrialDurationDays}
                  onChange={(e) => setAcceptTrialDurationDays(e.target.value)}
                  data-testid="input-accept-trial-duration"
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">Cancel</AlertDialogCancel>
            <Button
              disabled={isMutating}
              variant={confirmAction?.kind === "delete" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.kind === "accept") {
                  acceptMutation.mutate({
                    id: confirmAction.req.id,
                    trialDurationDays: Number(acceptTrialDurationDays),
                    trialPlan: acceptTrialPlan,
                  });
                }
                else if (confirmAction.kind === "decline") declineMutation.mutate(confirmAction.req.id);
                else deleteMutation.mutate(confirmAction.req.id);
              }}
              data-testid="button-confirm-action"
            >
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProvisionTrialForm() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [trialDurationDays, setTrialDurationDays] = useState(DEFAULT_TRIAL_DURATION_DAYS);
  const [trialPlan, setTrialPlan] = useState<TrialPlan>(DEFAULT_TRIAL_PLAN);
  const { toast } = useToast();

  const provisionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/super-admin/provision-trial", {
        websiteUrl,
        email,
        trialDurationDays: Number(trialDurationDays),
        trialPlan,
      });
    },
    onSuccess: () => {
      toast({ title: "Trial provisioning started", description: `Pipeline running for ${email}` });
      setWebsiteUrl("");
      setEmail("");
      setTrialDurationDays(DEFAULT_TRIAL_DURATION_DAYS);
      setTrialPlan(DEFAULT_TRIAL_PLAN);
      queryClient.invalidateQueries({ queryKey: ["/api/provisioned-accounts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Provisioning failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Provision Free Trial
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="pl-9"
              data-testid="input-provision-url"
            />
          </div>
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="prospect@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              data-testid="input-provision-email"
            />
          </div>
          <div className="w-full sm:w-36">
            <Select value={trialPlan} onValueChange={(value) => setTrialPlan(value as TrialPlan)}>
              <SelectTrigger aria-label="Trial plan" data-testid="select-provision-trial-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIAL_PLAN_KEYS.map((plan) => (
                  <SelectItem key={plan} value={plan}>{TRIAL_PLAN_LABELS[plan]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Plan</p>
          </div>
          <div className="w-full sm:w-36">
            <Input
              type="number"
              min={1}
              aria-label="Trial duration in days"
              value={trialDurationDays}
              onChange={(e) => setTrialDurationDays(e.target.value)}
              data-testid="input-provision-trial-duration"
            />
            <p className="text-xs text-muted-foreground mt-1">Duration in days</p>
          </div>
          <Button
            onClick={() => provisionMutation.mutate()}
            disabled={provisionMutation.isPending || !websiteUrl.trim() || !email.trim() || !trialDurationDays}
            data-testid="button-provision-trial"
          >
            {provisionMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {provisionMutation.isPending ? "Provisioning..." : "Provision Trial"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProvisionedAccountsSection() {
  const { toast } = useToast();
  const { data } = useQuery<{ accounts: ProvisionedAccountData[] }>({
    queryKey: ["/api/provisioned-accounts"],
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/super-admin/resume-provisioning/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Resuming pipeline", description: "Scan restarted in the background." });
      queryClient.invalidateQueries({ queryKey: ["/api/provisioned-accounts"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to resume", description: err.message, variant: "destructive" });
    },
  });

  const accounts = data?.accounts ?? [];

  if (accounts.length === 0) return null;

  const isResumable = (a: ProvisionedAccountData) =>
    !a.emailSent && a.brandName && (a.scanStatus === "failed" || a.scanStatus === "scanning");

  function getScanBadge(status: string) {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />{status}</Badge>;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Provisioned Trial Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Invite Sent</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} id={`provisioned-account-${a.id}`} data-testid={`row-provisioned-${a.id}`}>
                  <TableCell className="text-sm">{a.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{a.websiteUrl}</TableCell>
                  <TableCell className="text-sm">{a.brandName || "—"}</TableCell>
                  <TableCell className="text-sm">{trialPlanLabel(a.trialPlan)}</TableCell>
                  <TableCell className="text-sm">{a.trialDurationDays} days</TableCell>
                  <TableCell>{getScanBadge(a.scanStatus)}</TableCell>
                  <TableCell>
                    {a.emailSent ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Sent</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.registeredUserId ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isResumable(a) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resumeMutation.mutate(a.id)}
                        disabled={resumeMutation.isPending}
                        data-testid={`button-resume-provisioning-${a.id}`}
                      >
                        <RotateCw className="h-3 w-3 mr-1" />
                        Resume
                      </Button>
                    )}
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

function StatusBadge({ isActive, subscriptionStatus }: { isActive: boolean; subscriptionStatus: string }) {
  if (!isActive) {
    return <Badge variant="destructive" data-testid="badge-status-inactive">Inactive</Badge>;
  }
  if (subscriptionStatus === "cancelled") {
    return <Badge variant="secondary" data-testid="badge-status-cancelled">Cancelled</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-500/40 text-emerald-500" data-testid="badge-status-active">Active</Badge>;
}

function AccountRow({ account, formatCost, onDeactivate, onReactivate, onDelete, onToggleUserActive, onManualBilling, onTrialDuration }: {
  account: AccountData;
  formatCost: CostFormatter;
  onDeactivate: (account: AccountData) => void;
  onReactivate: (account: AccountData) => void;
  onDelete: (account: AccountData) => void;
  onToggleUserActive: (userId: string, isActive: boolean) => void;
  onManualBilling: (account: AccountData) => void;
  onTrialDuration: (account: AccountData) => void;
}) {
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [costExpanded, setCostExpanded] = useState(false);
  const [costTab, setCostTab] = useState<CostBreakdownTab>("model");
  const hasUsage = account.llmCosts.length > 0 || account.legacyEstimatedCost > 0;

  return (
    <>
      <TableRow data-testid={`row-account-${account.userId}`}>
        <TableCell>
          {account.teamMembersCount > 0 ? (
            <Collapsible open={membersExpanded} onOpenChange={setMembersExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-expand-${account.userId}`}>
                  {membersExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            <div className="w-9" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm" data-testid={`text-name-${account.userId}`}>{account.name}</span>
              {account.accountType === "admin_provisioned" && (
                <Badge variant="secondary" className="text-xs" data-testid={`badge-trial-${account.userId}`}>Trial</Badge>
              )}
            </div>
              <span className="text-xs text-muted-foreground" data-testid={`text-email-${account.userId}`}>{account.email}</span>
              {account.trialEndsAt && (
                <span className="text-xs text-muted-foreground">
                  Trial ends {new Date(account.trialEndsAt).toLocaleDateString()}
                </span>
              )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" data-testid={`badge-plan-${account.userId}`}>{account.planDisplayName}</Badge>
            {account.manualBilling && (
              <Badge variant="outline" className="border-[#00c8ff]/40 text-[#00c8ff]" data-testid={`badge-manual-billing-${account.userId}`}>
                Manual
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <StatusBadge isActive={account.isActive} subscriptionStatus={account.subscriptionStatus} />
        </TableCell>
        <TableCell className="text-center" data-testid={`text-brands-${account.userId}`}>
          {account.brandsCount}
        </TableCell>
        <TableCell className="text-center" data-testid={`text-members-${account.userId}`}>
          {account.teamMembersCount}
        </TableCell>
        <TableCell className="align-middle">
          <div className="grid grid-cols-[6.5rem_7rem] items-center gap-3">
            {hasUsage ? (
              <>
                <span
                  className="whitespace-nowrap text-right text-sm font-medium tabular-nums"
                  data-testid={`text-total-cost-${account.userId}`}
                >
                  {formatCost(account.totalLlmCost)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 min-h-0 w-fit justify-start gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                  onClick={() => setCostExpanded((open) => !open)}
                  aria-expanded={costExpanded}
                  data-testid={`button-cost-breakdown-${account.userId}`}
                >
                  {costExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Breakdown
                </Button>
              </>
            ) : (
              <span className="whitespace-nowrap text-right text-xs text-muted-foreground">No usage</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          {!account.isProtectedAccount && (
            <div className="flex items-center gap-1">
              {account.accountType === "admin_provisioned" && account.trialStartedAt && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onTrialDuration(account)}
                  title="Set trial duration"
                  data-testid={`button-trial-duration-${account.userId}`}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onManualBilling(account)}
                title="Manual billing"
                data-testid={`button-manual-billing-${account.userId}`}
              >
                <Wallet className={`h-4 w-4 ${account.manualBilling ? "text-[#00c8ff]" : "text-muted-foreground"}`} />
              </Button>
              {account.isActive ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeactivate(account)}
                  title="Deactivate account"
                  data-testid={`button-deactivate-${account.userId}`}
                >
                  <Ban className="h-4 w-4 text-destructive" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onReactivate(account)}
                  title="Reactivate account"
                  data-testid={`button-reactivate-${account.userId}`}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(account)}
                title="Delete account"
                data-testid={`button-delete-${account.userId}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
          {account.isProtectedAccount && (
            <Shield className="h-4 w-4 text-amber-400 ml-2" />
          )}
        </TableCell>
      </TableRow>
      {costExpanded && hasUsage && (
        <TableRow className="bg-muted/20" data-testid={`row-cost-breakdown-${account.userId}`}>
          <TableCell colSpan={8} className="p-0">
            <AccountLlmCostBreakdown
              account={account}
              activeTab={costTab}
              onTabChange={setCostTab}
              formatCost={formatCost}
            />
          </TableCell>
        </TableRow>
      )}
      {membersExpanded && account.teamMembersCount > 0 && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={8} className="p-0">
            <div className="px-8 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Team Members</span>
              </div>
              <div className="space-y-1.5">
                {account.teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-4 text-sm"
                    data-testid={`row-member-${member.userId}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="truncate">
                        {[member.firstName, member.lastName].filter(Boolean).join(" ") || member.email}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {member.isActive ? (
                        <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">Active</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Inactive</Badge>
                      )}
                      {!account.isProtectedAccount && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleUserActive(member.userId, !member.isActive)}
                          title={member.isActive ? "Deactivate user" : "Activate user"}
                          data-testid={`button-toggle-member-${member.userId}`}
                        >
                          {member.isActive ? (
                            <Ban className="h-3.5 w-3.5 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AdminAccountsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deactivateTarget, setDeactivateTarget] = useState<AccountData | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<AccountData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountData | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [manualBillingTarget, setManualBillingTarget] = useState<AccountData | null>(null);
  const [manualBillingPlan, setManualBillingPlan] = useState("growth_v2");
  const [trialDurationTarget, setTrialDurationTarget] = useState<AccountData | null>(null);
  const [trialDurationDays, setTrialDurationDays] = useState(DEFAULT_TRIAL_DURATION_DAYS);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ accounts: AccountData[]; usdGbpRate: number }>({
    queryKey: ["/api/super-admin/account-management"],
  });

  const accounts = data?.accounts ?? [];
  const usdGbpRate = data?.usdGbpRate ?? 0.79;
  const { currency, setCurrency, formatCost } = useCurrencyPreference();
  const fmt: CostFormatter = (usd) => formatCost(usd, usdGbpRate);

  const q = search.toLowerCase().trim();
  const filtered = accounts.filter((a) => {
    const matchesSearch = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && a.isActive && a.subscriptionStatus !== "cancelled") ||
      (statusFilter === "inactive" && !a.isActive) ||
      (statusFilter === "cancelled" && a.subscriptionStatus === "cancelled" && a.isActive);
    return matchesSearch && matchesStatus;
  });

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.isActive).length;
  const totalCost = accounts.reduce((sum, a) => sum + a.totalLlmCost, 0);

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest("POST", "/api/super-admin/deactivate-account", { accountOwnerId: deactivateTarget.userId });
      const data = await res.json();
      toast({ title: "Account deactivated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
      setDeactivateTarget(null);
    } catch {
      toast({ title: "Failed to deactivate account", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReactivate() {
    if (!reactivateTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest("POST", "/api/super-admin/reactivate-account", { accountOwnerId: reactivateTarget.userId });
      const data = await res.json();
      toast({ title: "Account reactivated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
      setReactivateTarget(null);
    } catch {
      toast({ title: "Failed to reactivate account", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await apiRequest("DELETE", `/api/super-admin/delete-account/${deleteTarget.userId}`, { confirmEmail: deleteConfirmEmail });
      toast({ title: "Account deleted", description: `Permanently deleted ${deleteTarget.email}` });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
      setDeleteTarget(null);
      setDeleteConfirmEmail("");
    } catch {
      toast({ title: "Failed to delete account", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  function openManualBilling(account: AccountData) {
    setManualBillingTarget(account);
    setManualBillingPlan(
      account.manualBilling && MANUAL_BILLING_PLANS.some((p) => p.value === account.plan)
        ? account.plan
        : "growth_v2",
    );
  }

  async function handleSetManualBilling(enabled: boolean) {
    if (!manualBillingTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest("POST", "/api/super-admin/set-manual-billing", {
        accountOwnerId: manualBillingTarget.userId,
        enabled,
        plan: manualBillingPlan,
      });
      const data = await res.json();
      toast({ title: enabled ? "Manual billing enabled" : "Manual billing disabled", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
      setManualBillingTarget(null);
    } catch (err: any) {
      toast({ title: "Failed to update manual billing", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleUserActive(userId: string, isActive: boolean) {
    try {
      await apiRequest("POST", "/api/super-admin/toggle-user-active", { userId, isActive });
      toast({ title: isActive ? "User activated" : "User deactivated" });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/accounts"] });
    } catch {
      toast({ title: "Failed to update user", variant: "destructive" });
    }
  }

  function openTrialDuration(account: AccountData) {
    setTrialDurationTarget(account);
    if (account.trialStartedAt && account.trialEndsAt) {
      const duration = Math.round(
        (new Date(account.trialEndsAt).getTime() - new Date(account.trialStartedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      setTrialDurationDays(String(duration));
    } else {
      setTrialDurationDays(DEFAULT_TRIAL_DURATION_DAYS);
    }
  }

  async function handleSetTrialDuration() {
    if (!trialDurationTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest("PATCH", `/api/super-admin/accounts/${trialDurationTarget.userId}/trial`, {
        trialDurationDays: Number(trialDurationDays),
      });
      const data = await res.json();
      toast({ title: "Trial updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/account-management"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provisioned-accounts"] });
      setTrialDurationTarget(null);
    } catch (err: any) {
      toast({ title: "Failed to update trial", description: err?.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeading
        title="Account Management"
        subtitle="Manage all accounts, team members, and view LLM usage costs"
        headingClassName="text-2xl font-semibold"
        headingTestId="text-page-title"
        subtitleClassName="text-sm text-muted-foreground mt-1"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-accounts">{totalAccounts}</div>
            <p className="text-xs text-muted-foreground">{activeAccounts} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LLM Cost</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant={currency === "USD" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setCurrency("USD")}
                data-testid="button-currency-usd"
              >
                USD
              </Button>
              <Button
                variant={currency === "GBP" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setCurrency("GBP")}
                data-testid="button-currency-gbp"
              >
                GBP
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-llm-cost">{fmt(totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              All time across all accounts{currency === "GBP" ? ` - converted at $1 = £${usdGbpRate.toFixed(4)}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive Accounts</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-inactive-accounts">{totalAccounts - activeAccounts}</div>
            <p className="text-xs text-muted-foreground">Deactivated accounts</p>
          </CardContent>
        </Card>
      </div>

      <ProvisionTrialForm />
      <RequestedTrialAccountsSection />
      <ProvisionedAccountsSection />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-accounts"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>Account Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Brands</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead>LLM Costs</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No accounts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((account) => (
                    <AccountRow
                      key={account.userId}
                      account={account}
                      formatCost={fmt}
                      onDeactivate={setDeactivateTarget}
                      onReactivate={setReactivateTarget}
                      onDelete={setDeleteTarget}
                      onToggleUserActive={handleToggleUserActive}
                      onManualBilling={openManualBilling}
                      onTrialDuration={openTrialDuration}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!trialDurationTarget} onOpenChange={(open) => !open && setTrialDurationTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set trial duration</DialogTitle>
            <DialogDescription>
              Set the total trial length from the original signup time for {trialDurationTarget?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <Label htmlFor="account-trial-duration">Total duration (days)</Label>
            <Input
              id="account-trial-duration"
              type="number"
              min={1}
              value={trialDurationDays}
              onChange={(e) => setTrialDurationDays(e.target.value)}
              data-testid="input-account-trial-duration"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDurationTarget(null)}>Cancel</Button>
            <Button
              disabled={actionLoading || !trialDurationDays}
              onClick={handleSetTrialDuration}
              data-testid="button-confirm-trial-duration"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update trial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manualBillingTarget} onOpenChange={(open) => !open && setManualBillingTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual billing</DialogTitle>
            <DialogDescription>
              Bill <span className="font-medium text-foreground">{manualBillingTarget?.email}</span> outside the app.
              The account gets full access on the selected plan, is never charged through Stripe, never expires, and the
              in-app billing/upgrade screens are hidden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Plan</Label>
              <Select value={manualBillingPlan} onValueChange={setManualBillingPlan}>
                <SelectTrigger data-testid="select-manual-billing-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_BILLING_PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value} data-testid={`option-manual-plan-${p.value}`}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {manualBillingTarget?.manualBilling && (
              <p className="text-xs text-muted-foreground">
                This account is currently billed manually. Disabling will cancel the complimentary subscription —
                move them to a paid plan afterwards if they should keep access.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {manualBillingTarget?.manualBilling && (
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() => handleSetManualBilling(false)}
                data-testid="button-disable-manual-billing"
              >
                {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Disable
              </Button>
            )}
            <Button
              disabled={actionLoading}
              onClick={() => handleSetManualBilling(true)}
              data-testid="button-confirm-manual-billing"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {manualBillingTarget?.manualBilling ? "Update plan" : "Enable manual billing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will set the account to inactive, pause all tracked terms, and cancel the subscription for{" "}
              <span className="font-medium text-foreground">{deactivateTarget?.email}</span>.
              This can be reversed by reactivating the account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <Button
              onClick={handleDeactivate}
              variant="destructive"
              disabled={actionLoading}
              data-testid="button-confirm-deactivate"
            >
              {actionLoading ? "Deactivating..." : "Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!reactivateTarget} onOpenChange={(open) => !open && setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate the account, all tracked terms, and the subscription for{" "}
              <span className="font-medium text-foreground">{reactivateTarget?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reactivate">Cancel</AlertDialogCancel>
            <Button
              onClick={handleReactivate}
              disabled={actionLoading}
              data-testid="button-confirm-reactivate"
            >
              {actionLoading ? "Reactivating..." : "Reactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmEmail(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This action is <span className="font-bold text-destructive">irreversible</span>. It will permanently delete the account owner,
              all their brands, tracked terms, visibility runs, team members, and subscription data for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <p className="text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-medium text-foreground">{deleteTarget?.email}</span> to confirm:
            </p>
            <Input
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder="Enter email to confirm"
              data-testid="input-confirm-delete-email"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <Button
              onClick={handleDelete}
              variant="destructive"
              disabled={actionLoading || deleteConfirmEmail.toLowerCase() !== (deleteTarget?.email || "").toLowerCase()}
              data-testid="button-confirm-delete"
            >
              {actionLoading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
