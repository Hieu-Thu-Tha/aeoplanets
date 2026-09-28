import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserPlus, Loader2 } from "lucide-react";

const PERMISSION_LABELS: { key: string; label: string; description: string }[] = [
  { key: "addBrands", label: "Add Brands", description: "Create new brand profiles" },
  { key: "billing", label: "Billing", description: "View and manage billing" },
  { key: "addCompetitors", label: "Add Competitors", description: "Manage competitor tracking" },
  { key: "manageUsers", label: "Manage Users", description: "Invite and manage team members" },
  { key: "createTickets", label: "Create Tickets", description: "Create action tickets" },
  { key: "deleteTickets", label: "Delete Tickets", description: "Delete action tickets" },
  { key: "editTickets", label: "Edit Tickets", description: "Edit and move action tickets" },
];

interface InviteTeamDialogProps {
  triggerClassName?: string;
}

export function InviteTeamDialog({ triggerClassName }: InviteTeamDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    addBrands: false,
    billing: false,
    addCompetitors: false,
    manageUsers: false,
    createTickets: true,
    deleteTickets: false,
    editTickets: true,
  });
  const { toast } = useToast();

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team/invite", { name, email, permissions });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: `An invite has been sent to ${email}` });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setOpen(false);
      setName("");
      setEmail("");
      setPermissions({
        addBrands: false, billing: false, addCompetitors: false,
        manageUsers: false, createTickets: true, deleteTickets: false, editTickets: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const togglePermission = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={triggerClassName} data-testid="button-invite-team">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            inviteMutation.mutate();
          }}
          className="space-y-0 flex flex-col gap-0"
        >
          <div className="space-y-4 overflow-y-auto max-h-[50vh] pr-1">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                data-testid="input-invite-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@company.com"
                required
                data-testid="input-invite-email"
              />
            </div>
            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="space-y-2">
                {PERMISSION_LABELS.map(({ key, label, description }) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 rounded-md border p-3 hover-elevate cursor-pointer"
                    onClick={() => togglePermission(key)}
                    data-testid={`checkbox-permission-${key}`}
                  >
                    <Checkbox
                      checked={permissions[key]}
                      onCheckedChange={() => togglePermission(key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-invite">
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending || !name || !email} data-testid="button-send-invite">
              {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Send Invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
