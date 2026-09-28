import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/contexts/BrandContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell } from "@/components/ui/enterprise/PageShell";
import { PageHeading } from "@/components/ui/enterprise/PageHeading";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Plus,
  Sparkles,
  GripVertical,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Archive,
  Trash2,
  Send,
  AlertCircle,
  UserCircle,
  Filter,
  Zap,
} from "lucide-react";
import type { ActionTicket, ActionComment } from "@shared/schema";

const STAGES = [
  { key: "approval", label: "Approval", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { key: "testing", label: "Testing", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { key: "finished", label: "Finished", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { key: "completed", label: "Completed", color: "bg-green-500/10 text-green-300 border-green-500/20" },
  { key: "archived", label: "Archived", color: "bg-muted text-muted-foreground border-border" },
] as const;

const SOURCE_COLORS: Record<string, string> = {
  readability: "bg-orange-500/15 text-orange-400",
  perception: "bg-violet-500/15 text-violet-400",
  coverage: "bg-cyan-500/15 text-cyan-400",
  web_vitals: "bg-rose-500/15 text-rose-400",
  competitor_weakness: "bg-red-500/15 text-red-400",
  consolidated: "bg-indigo-500/15 text-indigo-400",
  manual: "bg-muted text-muted-foreground",
};

const SOURCE_LABELS: Record<string, string> = {
  readability: "Readability",
  perception: "Perception",
  coverage: "Coverage",
  web_vitals: "Web Vitals",
  competitor_weakness: "Competitor",
  consolidated: "Multi-Source",
  manual: "Manual",
};

const PRIORITY_INDICATORS: Record<string, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  high: { dot: "bg-orange-500", label: "High" },
  medium: { dot: "bg-yellow-500", label: "Medium" },
  low: { dot: "bg-slate-400", label: "Low" },
};

function timeAgo(date: string | Date | null): string {
  if (!date) return "";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function TicketCard({
  ticket,
  onOpen,
  onDragStart,
}: {
  ticket: ActionTicket;
  onOpen: (t: ActionTicket) => void;
  onDragStart: (e: React.DragEvent, t: ActionTicket) => void;
}) {
  const pri = PRIORITY_INDICATORS[ticket.priority] || PRIORITY_INDICATORS.medium;
  const srcColor = SOURCE_COLORS[ticket.source] || SOURCE_COLORS.manual;
  const srcLabel = SOURCE_LABELS[ticket.source] || ticket.source;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ticket)}
      onClick={() => onOpen(ticket)}
      className="group glass-card rounded-md p-3 cursor-pointer hover-elevate select-none"
      data-testid={`card-ticket-${ticket.id}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2" data-testid={`text-ticket-title-${ticket.id}`}>
            {ticket.title}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${srcColor}`} data-testid={`badge-source-${ticket.id}`}>
              {srcLabel}
            </Badge>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
              <span className="text-[10px] text-muted-foreground">{pri.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo(ticket.updatedAt)}
            </span>
            {ticket.version > 1 && (
              <span data-testid={`badge-version-${ticket.id}`}>v{ticket.version}</span>
            )}
            {ticket.assignedToUserId && (
              <span className="flex items-center gap-1 ml-auto" data-testid={`badge-assigned-${ticket.id}`}>
                <UserCircle className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage,
  tickets,
  onOpen,
  onDragStart,
  onDrop,
  dragOverStage,
  onDragOver,
  onDragLeave,
}: {
  stage: typeof STAGES[number];
  tickets: ActionTicket[];
  onOpen: (t: ActionTicket) => void;
  onDragStart: (e: React.DragEvent, t: ActionTicket) => void;
  onDrop: (e: React.DragEvent, stage: string) => void;
  dragOverStage: string | null;
  onDragOver: (e: React.DragEvent, stage: string) => void;
  onDragLeave: () => void;
}) {
  const isOver = dragOverStage === stage.key;

  return (
    <div
      className={`flex flex-col min-w-[260px] max-w-[320px] flex-1 rounded-lg border transition-colors ${
        isOver ? "border-[#00c8ff]/40 bg-[#00c8ff]/[0.03]" : "border-border/50 bg-muted/20"
      }`}
      onDragOver={(e) => onDragOver(e, stage.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage.key)}
      data-testid={`column-${stage.key}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${stage.color}`}>
            {stage.label}
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] min-w-[20px] justify-center" data-testid={`badge-count-${stage.key}`}>
          {tickets.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)]">
        {tickets.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground/50">
            Drop tickets here
          </div>
        )}
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

function TicketDetailSheet({
  ticket,
  open,
  onClose,
}: {
  ticket: ActionTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission: hasPerm } = usePermissions();
  const canEdit = hasPerm("editTickets");
  const [commentText, setCommentText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [suggestingFix, setSuggestingFix] = useState(false);
  const [fixSuggestion, setFixSuggestion] = useState<string | null>(null);
  const [revisionInput, setRevisionInput] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);

  const { data: comments = [] } = useQuery<ActionComment[]>({
    queryKey: ["/api/action-tickets", ticket?.id, "comments"],
    queryFn: () => fetch(`/api/action-tickets/${ticket?.id}/comments`).then(r => r.json()),
    enabled: !!ticket,
  });

  const { data: teamUsersRaw = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string }[]>({
    queryKey: ["/api/team/users"],
    queryFn: () => fetch("/api/team/users").then(r => r.json()),
    staleTime: 60000,
  });

  const teamUsers = teamUsersRaw.map(u => ({
    id: u.id,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
    email: u.email,
  }));

  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const mentionResults = showMentionPopup
    ? teamUsers.filter(u =>
        u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  function handleCommentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setCommentText(val);

    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentionPopup(true);
      setMentionIndex(0);
      setMentionCursorPos(cursorPos);
    } else {
      setShowMentionPopup(false);
    }
  }

  function insertMention(user: { id: string; name: string }) {
    const textBeforeCursor = commentText.substring(0, mentionCursorPos);
    const atPos = textBeforeCursor.lastIndexOf("@");
    const before = commentText.substring(0, atPos);
    const after = commentText.substring(mentionCursorPos);
    const displayName = user.name.includes(" ") ? `[${user.name}]` : user.name;
    const newText = `${before}@${displayName} ${after}`;
    setCommentText(newText);
    setShowMentionPopup(false);
    setMentionQuery("");
    commentInputRef.current?.focus();
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showMentionPopup && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionPopup(false);
        return;
      }
    }
    if (e.key === "Enter" && commentText.trim() && !showMentionPopup) {
      addCommentMutation.mutate(commentText.trim());
    }
  }

  const invalidateTickets = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
  };

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, any>) =>
      apiRequest("PATCH", `/api/action-tickets/${ticket?.id}`, updates),
    onSuccess: () => {
      invalidateTickets();
      onClose();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/action-tickets/${ticket?.id}/reject`),
    onSuccess: () => {
      invalidateTickets();
      toast({ title: "Ticket rejected", description: "AI will not recreate this ticket." });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/action-tickets/${ticket?.id}`),
    onSuccess: () => {
      invalidateTickets();
      toast({ title: "Ticket deleted" });
      onClose();
      setDeleteConfirm(false);
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/action-tickets/${ticket?.id}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/action-tickets", ticket?.id, "comments"] });
      setCommentText("");
    },
  });

  useEffect(() => {
    setFixSuggestion(null);
    setSuggestingFix(false);
    setRevisionInput("");
    setShowRevisionInput(false);
  }, [ticket?.id]);

  if (!ticket) return null;

  const pri = PRIORITY_INDICATORS[ticket.priority] || PRIORITY_INDICATORS.medium;
  const srcLabel = SOURCE_LABELS[ticket.source] || ticket.source;
  const srcColor = SOURCE_COLORS[ticket.source] || SOURCE_COLORS.manual;
  const stageInfo = STAGES.find(s => s.key === ticket.stage);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-ticket-detail">
          <SheetHeader>
            <SheetTitle className="sr-only">Ticket Detail</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-2">
            <div>
              {editingTitle && canEdit ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => {
                      if (titleDraft.trim() && titleDraft !== ticket.title) {
                        updateMutation.mutate({ title: titleDraft.trim() });
                      }
                      setEditingTitle(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    autoFocus
                    data-testid="input-edit-title"
                  />
                </div>
              ) : (
                <h2
                  className={`text-lg font-bold text-foreground ${canEdit ? "cursor-pointer hover:text-foreground/80" : ""}`}
                  onClick={canEdit ? () => { setTitleDraft(ticket.title); setEditingTitle(true); } : undefined}
                  data-testid="text-ticket-detail-title"
                >
                  {ticket.title}
                </h2>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className={`text-xs ${srcColor}`}>{srcLabel}</Badge>
                {ticket.sourceRef && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{ticket.sourceRef}</span>
                )}
                {ticket.version > 1 && (
                  <Badge variant="outline" className="text-xs">v{ticket.version}</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Stage</label>
                <Select
                  value={ticket.stage}
                  onValueChange={(val) => updateMutation.mutate({ stage: val })}
                  disabled={!canEdit}
                >
                  <SelectTrigger data-testid="select-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Priority</label>
                <Select
                  value={ticket.priority}
                  onValueChange={(val) => updateMutation.mutate({ priority: val })}
                  disabled={!canEdit}
                >
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_INDICATORS).map(([key, { label, dot }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {teamUsers.length > 0 && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Assigned To</label>
                  {canEdit ? (
                    <Select
                      value={ticket.assignedToUserId || "__none__"}
                      onValueChange={(val) => updateMutation.mutate({ assignedToUserId: val === "__none__" ? null : val })}
                    >
                      <SelectTrigger data-testid="select-assigned-to">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {teamUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-foreground/80" data-testid="text-assigned-to">
                      {teamUsers.find(u => u.id === ticket.assignedToUserId)?.name || "Unassigned"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Informed Users</label>
                  <div className="flex flex-wrap gap-1.5" data-testid="informed-users-list">
                    {canEdit ? teamUsers.map((u) => {
                      const currentInformed: string[] = ticket.informedUserIds || [];
                      const isInformed = currentInformed.includes(u.id);
                      return (
                        <Badge
                          key={u.id}
                          variant={isInformed ? "default" : "outline"}
                          className={`cursor-pointer toggle-elevate ${isInformed ? "toggle-elevated" : ""}`}
                          onClick={() => {
                            const next = isInformed
                              ? currentInformed.filter((id: string) => id !== u.id)
                              : [...currentInformed, u.id];
                            updateMutation.mutate({ informedUserIds: next });
                          }}
                          data-testid={`badge-informed-${u.id}`}
                        >
                          {u.name}
                        </Badge>
                      );
                    }) : (() => {
                      const informed = (ticket.informedUserIds || []).map((id: string) => teamUsers.find(u => u.id === id)?.name).filter(Boolean);
                      return informed.length > 0
                        ? informed.map((name, i) => <Badge key={i} variant="outline">{name}</Badge>)
                        : <p className="text-sm text-muted-foreground">None</p>;
                    })()}
                  </div>
                  {canEdit && <p className="text-xs text-muted-foreground mt-1">Click to toggle. Informed users receive notifications on changes.</p>}
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Description</label>
              {editingDesc && canEdit ? (
                <Textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={() => {
                    if (descDraft !== (ticket.description || "")) {
                      updateMutation.mutate({ description: descDraft });
                    }
                    setEditingDesc(false);
                  }}
                  rows={6}
                  autoFocus
                  data-testid="textarea-edit-description"
                />
              ) : (
                <div
                  className={`text-sm text-foreground/80 whitespace-pre-wrap rounded-md border border-transparent p-2 min-h-[60px] ${canEdit ? "cursor-pointer hover:border-border" : ""}`}
                  onClick={canEdit ? () => { setDescDraft(ticket.description || ""); setEditingDesc(true); } : undefined}
                  data-testid="text-ticket-description"
                >
                  {ticket.description || (canEdit ? "No description. Click to add." : "No description.")}
                </div>
              )}
            </div>

            {canEdit && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setSuggestingFix(true);
                    setFixSuggestion(null);
                    setShowRevisionInput(false);
                    setRevisionInput("");
                    try {
                      const res = await apiRequest("POST", `/api/action-tickets/${ticket.id}/suggest-fix`);
                      const data = await res.json();
                      setFixSuggestion(data.suggestion);
                    } catch (err) {
                      toast({ title: "Error", description: "Failed to generate fix suggestion. Please try again.", variant: "destructive" });
                    } finally {
                      setSuggestingFix(false);
                    }
                  }}
                  disabled={suggestingFix}
                  data-testid="button-suggest-fix"
                >
                  {suggestingFix ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                  )}
                  {suggestingFix ? "Researching your site..." : "AI Suggest Fix"}
                </Button>

                {fixSuggestion && (
                  <div className="space-y-3">
                    <div className="rounded-md border border-border bg-muted/30 p-3 max-h-[400px] overflow-y-auto">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Production-Ready Fix</p>
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_ul]:text-sm [&_ul]:mb-2 [&_li]:mb-1 [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                        dangerouslySetInnerHTML={{ __html: fixSuggestion }}
                        data-testid="text-fix-suggestion"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => {
                          addCommentMutation.mutate(fixSuggestion!, {
                            onSuccess: () => {
                              setFixSuggestion(null);
                              setShowRevisionInput(false);
                              toast({ title: "Fix added", description: "The AI suggestion has been added as a comment on this ticket." });
                            },
                            onError: () => {
                              toast({ title: "Error", description: "Failed to add suggestion as comment.", variant: "destructive" });
                            },
                          });
                        }}
                        disabled={addCommentMutation.isPending}
                        data-testid="button-append-fix"
                      >
                        <CheckCircle className="mr-2 h-3.5 w-3.5" />
                        Add to Ticket
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRevisionInput(!showRevisionInput)}
                        data-testid="button-suggest-change"
                      >
                        <MessageSquare className="mr-2 h-3.5 w-3.5" />
                        Suggest Change
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFixSuggestion(null);
                          setShowRevisionInput(false);
                          setRevisionInput("");
                        }}
                        data-testid="button-dismiss-fix"
                      >
                        Dismiss
                      </Button>
                    </div>

                    {showRevisionInput && (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Describe what you'd like changed (e.g. 'Make the tone more casual', 'Include our Leeds office address', 'Focus on the FAQ schema only')..."
                          value={revisionInput}
                          onChange={(e) => setRevisionInput(e.target.value)}
                          rows={3}
                          data-testid="textarea-revision-request"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!revisionInput.trim()) return;
                            setSuggestingFix(true);
                            try {
                              const res = await apiRequest("POST", `/api/action-tickets/${ticket.id}/suggest-fix`, {
                                previousSuggestion: fixSuggestion,
                                revisionRequest: revisionInput.trim(),
                              });
                              const data = await res.json();
                              setFixSuggestion(data.suggestion);
                              setRevisionInput("");
                              setShowRevisionInput(false);
                            } catch (err) {
                              toast({ title: "Error", description: "Failed to revise suggestion. Please try again.", variant: "destructive" });
                            } finally {
                              setSuggestingFix(false);
                            }
                          }}
                          disabled={suggestingFix || !revisionInput.trim()}
                          data-testid="button-submit-revision"
                        >
                          {suggestingFix ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-3.5 w-3.5" />
                          )}
                          {suggestingFix ? "Revising..." : "Revise Suggestion"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {canEdit && ticket.stage === "approval" && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => updateMutation.mutate({ stage: "in_progress" })}
                  disabled={updateMutation.isPending}
                  data-testid="button-approve-ticket"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                  data-testid="button-reject-ticket"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}

            {canEdit && ticket.stage !== "archived" && ticket.stage !== "approval" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ stage: "archived" })}
                disabled={updateMutation.isPending}
                data-testid="button-archive-ticket"
              >
                <Archive className="mr-2 h-3.5 w-3.5" />
                Archive
              </Button>
            )}

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Comments ({comments.length})
                </h3>
                <span className="text-[10px] text-muted-foreground/60">Type @ to mention a team member</span>
              </div>
              <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
                {comments.map((c) => {
                  const isHtml = /<[a-z][\s\S]*>/i.test(c.content);
                  return (
                    <div key={c.id} className="text-sm space-y-1" data-testid={`comment-${c.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{c.userName}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                      </div>
                      {isHtml ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_ul]:text-sm [&_ul]:mb-2 [&_li]:mb-1 [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                          dangerouslySetInnerHTML={{ __html: c.content }}
                        />
                      ) : (
                        <p className="text-foreground/80 leading-relaxed">
                          {c.content.split(/(@\[[^\]]+\]|@[\w'-]+)/).map((part, pi) =>
                            part.startsWith("@") ? (
                              <span key={pi} className="font-semibold text-primary">{part.replace(/^\@\[|\]$/g, "@")}</span>
                            ) : (
                              <span key={pi}>{part}</span>
                            )
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground/60">No comments yet.</p>
                )}
              </div>
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Input
                    ref={commentInputRef}
                    placeholder="Add a comment... (type @ to mention)"
                    value={commentText}
                    onChange={handleCommentChange}
                    onKeyDown={handleCommentKeyDown}
                    onBlur={() => setTimeout(() => setShowMentionPopup(false), 200)}
                    data-testid="input-comment"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                    data-testid="button-send-comment"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {showMentionPopup && mentionResults.length > 0 && (
                  <div className="absolute bottom-full left-0 right-10 mb-1 rounded-md border border-border bg-popover shadow-md z-50 overflow-hidden" data-testid="mention-popup">
                    {mentionResults.map((user, i) => (
                      <button
                        key={user.id}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${i === mentionIndex ? "bg-accent text-accent-foreground" : "text-popover-foreground"}`}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
                        onMouseEnter={() => setMentionIndex(i)}
                        data-testid={`mention-user-${user.id}`}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">
                            {user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{user.name}</span>
                          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>Created {timeAgo(ticket.createdAt)}</span>
                <span>Updated {timeAgo(ticket.updatedAt)}</span>
              </div>
              {hasPerm("deleteTickets") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                  data-testid="button-delete-ticket"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Ticket
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this ticket?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. The ticket and all its comments will be permanently removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Actions() {
  usePageMeta({ title: "My Actions | AEOSTARS" });
  const { activeBrandId, isLoading: brandsLoading } = useBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, isOwner } = usePermissions();
  const { user } = useAuth();

  const [selectedTicket, setSelectedTicket] = useState<ActionTicket | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragTicketRef = useRef<ActionTicket | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("everyone");
  const [filterInitialized, setFilterInitialized] = useState(false);

  useEffect(() => {
    if (filterInitialized) return;
    if (isOwner) {
      setOwnerFilter("everyone");
      setFilterInitialized(true);
    } else if (user?.id) {
      setOwnerFilter(user.id);
      setFilterInitialized(true);
    }
  }, [isOwner, user?.id, filterInitialized]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newStage, setNewStage] = useState("in_progress");

  const { data: allTickets = [], isLoading } = useQuery<ActionTicket[]>({
    queryKey: ["/api/brands", activeBrandId, "action-tickets"],
    queryFn: () => fetch(`/api/brands/${activeBrandId}/action-tickets`).then(r => r.json()),
    enabled: !!activeBrandId,
  });

  const { data: teamData } = useQuery<any>({
    queryKey: ["/api/team"],
    staleTime: 60000,
  });

  const filterUsers = (() => {
    if (!teamData) return [];
    const users: { id: string; name: string }[] = [];
    if (teamData.owner) {
      users.push({
        id: teamData.owner.id,
        name: `${teamData.owner.firstName || ''} ${teamData.owner.lastName || ''}`.trim() || teamData.owner.email,
      });
    }
    if (teamData.members) {
      for (const m of teamData.members) {
        if (m.user) {
          users.push({
            id: m.user.id,
            name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || m.user.email,
          });
        }
      }
    }
    return users;
  })();

  const tickets = ownerFilter === "everyone"
    ? allTickets
    : allTickets.filter(t => t.userId === ownerFilter || t.assignedToUserId === ownerFilter);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/brands/${activeBrandId}/action-tickets/generate`),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/brands", activeBrandId, "action-tickets"] });
      toast({
        title: "Actions generated",
        description: `${data.created} new tickets created, ${data.skipped} skipped (already tracked or rejected).`,
      });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate action tickets.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/brands/${activeBrandId}/action-tickets`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", activeBrandId, "action-tickets"] });
      toast({ title: "Ticket created" });
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewPriority("medium");
      setNewStage("in_progress");
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      apiRequest("PATCH", `/api/action-tickets/${id}`, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", activeBrandId, "action-tickets"] });
    },
  });

  const openTicket = useCallback((t: ActionTicket) => {
    setSelectedTicket(t);
    setSheetOpen(true);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, t: ActionTicket) => {
    dragTicketRef.current = t;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(t.id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const t = dragTicketRef.current;
    if (t && t.stage !== stage) {
      moveMutation.mutate({ id: t.id, stage });
    }
    dragTicketRef.current = null;
  }, [moveMutation]);

  const handleCloseSheet = useCallback(() => {
    setSheetOpen(false);
    setSelectedTicket(null);
    queryClient.invalidateQueries({ queryKey: ["/api/brands", activeBrandId, "action-tickets"] });
  }, [queryClient, activeBrandId]);

  if (!activeBrandId) {
    if (brandsLoading) {
      return (
        <PageShell>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </PageShell>
      );
    }
    return (
      <PageShell>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>Select a brand to view actions.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <PageHeading
          title="My Actions"
          subtitle="AI-generated improvement tickets and manual tasks"
          className="space-y-1"
          headingClassName="text-heading text-foreground"
          subtitleClassName="text-body text-muted-foreground"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {hasPermission("createTickets") && (
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-ticket">
              <Plus className="mr-2 h-4 w-4" />
              Create Ticket
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Owner:</span>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-owner-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              {filterUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {ownerFilter !== "everyone" && (
          <Badge variant="secondary" className="text-xs">
            {tickets.length} of {allTickets.length} tickets
          </Badge>
        )}
      </div>

      {generateMutation.isPending && (
        <Card className="mb-6 border-primary/20 relative overflow-visible">
          <CardContent className="py-8 text-center">
            <div className="absolute inset-0 bg-background/90 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-4 z-10">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              <div>
                <p className="text-base font-semibold text-foreground" data-testid="text-generating-tickets">Generating AI Action Tickets...</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Analysing your perception profile, coverage gaps, readability audit, competitor weaknesses, and web vitals to build actionable improvement tickets...
                </p>
              </div>
              <div className="w-48 mt-2">
                <Progress value={60} className="h-1.5 animate-pulse" />
              </div>
              <p className="text-xs text-muted-foreground">Estimated: 30–90 seconds</p>
            </div>
            <div className="h-24" />
          </CardContent>
        </Card>
      )}

      {!generateMutation.isPending && hasPermission("createTickets") && (
        <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-600/10 p-4 flex items-center justify-between gap-4 flex-wrap" data-testid="banner-ai-generate">
          <div className="flex items-center gap-3 min-w-0">
            <Zap className="h-5 w-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300 font-medium">
              Allow AI to create all the tickets needed to improve your positions in one go
            </p>
          </div>
          <Button
            variant="default"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="shrink-0"
            data-testid="button-banner-generate"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate All Tickets
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 && !generateMutation.isPending ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-empty-board">No action tickets yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Click "Generate All Tickets" above to scan your readability audit, perception profile, coverage gaps, competitor weaknesses, and web vitals for improvement opportunities.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-board">
          {STAGES.map((stage) => {
            const stageTickets = tickets.filter(t => t.stage === stage.key);
            return (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                tickets={stageTickets}
                onOpen={openTicket}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                dragOverStage={dragOverStage}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              />
            );
          })}
        </div>
      )}

      <TicketDetailSheet
        ticket={selectedTicket}
        open={sheetOpen}
        onClose={handleCloseSheet}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Title</label>
              <Input
                placeholder="What needs to be done?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-new-title"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Description</label>
              <Textarea
                placeholder="Details, context, acceptance criteria..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={4}
                data-testid="textarea-new-description"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Priority</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger data-testid="select-new-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_INDICATORS).map(([key, { label, dot }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Stage</label>
                <Select value={newStage} onValueChange={setNewStage}>
                  <SelectTrigger data-testid="select-new-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.filter(s => s.key !== "archived").map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={() => {
                if (!newTitle.trim()) return;
                createMutation.mutate({
                  title: newTitle.trim(),
                  description: newDesc.trim() || null,
                  source: "manual",
                  priority: newPriority,
                  stage: newStage,
                });
              }}
              disabled={!newTitle.trim() || createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
