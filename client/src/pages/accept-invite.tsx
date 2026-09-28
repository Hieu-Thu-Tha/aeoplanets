import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle, Lock } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

interface InviteDetails {
  email: string;
  name: string;
  inviterName: string;
  brandName: string;
  valid: boolean;
}

export default function AcceptInvitePage() {
  usePageMeta({ title: "Accept Invitation — AEOSTARS" });
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: invite, isLoading, error } = useQuery<InviteDetails>({
    queryKey: ["/api/team/accept", token],
    queryFn: async () => {
      const res = await fetch(`/api/team/accept/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Invalid invitation");
      }
      return res.json();
    },
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team/accept/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to accept invitation");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome to AEOSTARS!", description: "Your account has been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/dashboard");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create account", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    acceptMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Invalid Invitation</h2>
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message || "This invitation link is invalid, expired, or has already been used."}
            </p>
            <p className="text-xs text-muted-foreground">
              Please contact the person who invited you to request a new invitation.
            </p>
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-go-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="page-accept-invite">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Welcome to AEOSTARS</CardTitle>
          <CardDescription className="text-sm">
            <span className="font-medium text-foreground">{invite.inviterName}</span> has invited you to collaborate on improving AEO for <span className="font-medium text-foreground">{invite.brandName}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accept-name">Name</Label>
              <Input id="accept-name" value={invite.name} disabled data-testid="input-accept-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accept-email">Email</Label>
              <Input id="accept-email" type="email" value={invite.email} disabled data-testid="input-accept-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accept-password">Password</Label>
              <Input
                id="accept-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password (min 8 characters)"
                required
                minLength={8}
                data-testid="input-accept-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accept-confirm">Confirm Password</Label>
              <Input
                id="accept-confirm"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={8}
                data-testid="input-accept-confirm"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending || !password || !confirmPassword}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Create Account & Join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
