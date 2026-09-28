import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InviteTeamDialog } from "@/components/InviteTeamDialog";
import { Users, Crown, Shield, Pencil, Trash2, RotateCw, X, Loader2, Mail, Clock } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeading } from "@/components/ui/enterprise";

const PERMISSION_LABELS: { key: string; label: string }[] = [
  { key: "addBrands", label: "Add Brands" },
  { key: "billing", label: "Billing" },
  { key: "addCompetitors", label: "Add Competitors" },
  { key: "manageUsers", label: "Manage Users" },
  { key: "createTickets", label: "Create Tickets" },
  { key: "deleteTickets", label: "Delete Tickets" },
  { key: "editTickets", label: "Edit Tickets" },
];

interface TeamMember {
  id: number;
  accountOwnerId: string;
  userId: string;
  permissions: Record<string, boolean>;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    lastLogin: string | null;
  } | null;
}

interface TeamInvitation {
  id: number;
  email: string;
  name: string;
  status: string;
  permissions: Record<string, boolean>;
  createdAt: string;
  expiresAt: string;
}

interface TeamData {
  owner: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
  members: TeamMember[];
  invitations: TeamInvitation[];
  teamLimit: number | null;
  currentCount: number;
  plan: string;
  planDisplayName?: string;
}

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return "?";
}

function getDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  return email || "Unknown";
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatExpiresIn(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export default function TeamPage() {
  usePageMeta({ title: "Team Management — AEOSTARS" });
  const { toast } = useToast();
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({});

  const { data: team, isLoading } = useQuery<TeamData>({
    queryKey: ["/api/team"],
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: number; permissions: Record<string, boolean> }) => {
      const res = await apiRequest("PATCH", `/api/team/members/${id}`, { permissions });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setEditMember(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update permissions", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/team/members/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/team/invite/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to revoke invitation", description: error.message, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/team/resend-invite/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation resent" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend invitation", description: error.message, variant: "destructive" });
    },
  });

  const openEditDialog = (member: TeamMember) => {
    setEditMember(member);
    setEditPermissions({ ...member.permissions });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Unable to load team data</p>
      </div>
    );
  }

  const usagePercent = team.teamLimit ? Math.round((team.currentCount / team.teamLimit) * 100) : 0;
  const enabledPermissions = (perms: Record<string, boolean>) =>
    PERMISSION_LABELS.filter(p => perms[p.key]).map(p => p.label);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6" data-testid="page-team">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading
          title="Team Management"
          subtitle="Manage your team members and their permissions"
          headingClassName="text-2xl font-semibold tracking-tight flex items-center gap-2"
          subtitleClassName="text-sm text-muted-foreground mt-1"
          leadingIcon={<Users className="h-6 w-6" />}
        />
        <InviteTeamDialog />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Team Seats</CardTitle>
          <Badge variant="outline" className="capitalize" data-testid="badge-plan">
            {team.planDisplayName ?? team.plan}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-2xl font-bold" data-testid="text-team-count">{team.currentCount}</span>
            <span className="text-sm text-muted-foreground">
              of {team.teamLimit ?? "unlimited"} seats used
            </span>
          </div>
          {team.teamLimit && (
            <Progress value={usagePercent} className="h-2" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {team.owner && (
            <div className="flex items-center gap-3 p-3 rounded-md border" data-testid="card-team-owner">
              <Avatar>
                <AvatarFallback>{getInitials(team.owner.firstName, team.owner.lastName, team.owner.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{getDisplayName(team.owner.firstName, team.owner.lastName, team.owner.email)}</span>
                  <Badge variant="default" data-testid="badge-owner">
                    <Crown className="h-3 w-3 mr-1" />
                    Owner
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{team.owner.email}</p>
              </div>
              <span className="text-xs text-muted-foreground">Full access</span>
            </div>
          )}

          {team.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`card-team-member-${member.id}`}>
              <Avatar>
                <AvatarFallback>{getInitials(member.user?.firstName, member.user?.lastName, member.user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{getDisplayName(member.user?.firstName, member.user?.lastName, member.user?.email)}</span>
                  <Badge variant="secondary">
                    <Shield className="h-3 w-3 mr-1" />
                    Member
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{member.user?.email}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {enabledPermissions(member.permissions).map(label => (
                    <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-2 hidden sm:inline">
                  Joined {formatTimeAgo(member.createdAt)}
                </span>
                <Button size="icon" variant="ghost" onClick={() => openEditDialog(member)} data-testid={`button-edit-member-${member.id}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" data-testid={`button-remove-member-${member.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will revoke {getDisplayName(member.user?.firstName, member.user?.lastName, member.user?.email)}'s access to your account. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removeMemberMutation.mutate(member.id)} data-testid={`button-confirm-remove-${member.id}`}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}

          {team.members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team members yet. Invite someone to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {team.invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {team.invitations.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`card-invite-${invite.id}`}>
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{invite.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatExpiresIn(invite.expiresAt)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => resendInviteMutation.mutate(invite.id)}
                    disabled={resendInviteMutation.isPending}
                    data-testid={`button-resend-invite-${invite.id}`}
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => revokeInviteMutation.mutate(invite.id)}
                    disabled={revokeInviteMutation.isPending}
                    data-testid={`button-revoke-invite-${invite.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit Permissions for {editMember?.user ? getDisplayName(editMember.user.firstName, editMember.user.lastName, editMember.user.email) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {PERMISSION_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-md border p-3 hover-elevate cursor-pointer"
                onClick={() => setEditPermissions(prev => ({ ...prev, [key]: !prev[key] }))}
              >
                <Checkbox checked={!!editPermissions[key]} onCheckedChange={() => setEditPermissions(prev => ({ ...prev, [key]: !prev[key] }))} />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button
              onClick={() => editMember && updateMemberMutation.mutate({ id: editMember.id, permissions: editPermissions })}
              disabled={updateMemberMutation.isPending}
              data-testid="button-save-permissions"
            >
              {updateMemberMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
