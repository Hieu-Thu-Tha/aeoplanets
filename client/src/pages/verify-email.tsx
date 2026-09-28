import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { HeroBackdrop } from "@/components/backgrounds/HeroBackdrop";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeading } from "@/components/ui/enterprise";

export default function VerifyEmail() {
  usePageMeta({
    title: "Confirm Your Email — AEOSTARS",
    description: "Please check your inbox and confirm your email address to access AEOSTARS.",
  });

  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cooldown, setCooldown] = useState(0);

  const params = new URLSearchParams(searchString);
  const verified = params.get("verified") === "true";
  const error = params.get("error");

  const { data: statusData } = useQuery<{ emailVerified: boolean }>({
    queryKey: ["/api/auth/verification-status"],
    refetchInterval: verified ? false : 5000,
    retry: false,
  });

  useEffect(() => {
    if (statusData?.emailVerified || verified) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const timer = setTimeout(() => {
        setLocation("/");
      }, verified ? 2000 : 500);
      return () => clearTimeout(timer);
    }
  }, [statusData?.emailVerified, verified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const resendMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/resend-verification");
    },
    onSuccess: () => {
      setCooldown(60);
      toast({
        title: "Email sent",
        description: "A new verification link has been sent to your inbox.",
      });
    },
    onError: (err: Error) => {
      if (err.message.includes("wait")) {
        setCooldown(60);
      }
      toast({
        variant: "destructive",
        title: "Could not send email",
        description: "Please wait a moment before trying again.",
      });
    },
  });

  if (verified || statusData?.emailVerified) {
    return (
      <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex h-16 items-center px-4 sm:px-8 max-w-7xl mx-auto">
              <a href="/" className="flex items-center gap-3">
                <Logo size="md" variant="dark" />
              </a>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <PageHeading title="Email Confirmed" headingClassName="text-2xl font-bold text-white mb-3" headingTestId="text-verified-success" />
              <p className="text-white/70 mb-6">
                Your email has been verified. Redirecting you now...
              </p>
              <Loader2 className="h-5 w-5 text-white/40 animate-spin mx-auto" />
            </div>
          </div>
        </div>
      </HeroBackdrop>
    );
  }

  return (
    <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex h-16 items-center px-4 sm:px-8 max-w-7xl mx-auto">
            <a href="/" className="flex items-center gap-3">
              <Logo size="md" variant="dark" />
            </a>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md glass-card-dark rounded-xl p-8 text-center">
            {error === "expired" ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-6">
                  <AlertCircle className="h-8 w-8 text-amber-400" />
                </div>
                <PageHeading title="Link Expired" headingClassName="text-2xl font-bold text-white mb-3" headingTestId="text-verify-expired" />
                <p className="text-white/70 mb-6">
                  Your verification link has expired. Click below to get a new one.
                </p>
              </>
            ) : error === "invalid" ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-6">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                </div>
                <PageHeading title="Invalid Link" headingClassName="text-2xl font-bold text-white mb-3" headingTestId="text-verify-invalid" />
                <p className="text-white/70 mb-6">
                  This verification link is invalid. Click below to get a new one.
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-6">
                  <Mail className="h-8 w-8 text-blue-400" />
                </div>
                <PageHeading title="Check Your Inbox" headingClassName="text-2xl font-bold text-white mb-3" headingTestId="text-verify-check-inbox" />
                <p className="text-white/70 mb-6">
                  We've sent a confirmation link to your email address. Click the link to verify your account and get started.
                </p>
              </>
            )}

            <Button
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending || cooldown > 0}
              className="w-full bg-[#0A66C2] border-[#0A66C2]"
              size="lg"
              data-testid="button-resend-verification"
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend Verification Email"}
            </Button>

            <p className="text-white/40 text-xs mt-6">
              Didn't receive the email? Check your spam folder or click above to resend.
            </p>
          </div>
        </div>
      </div>
    </HeroBackdrop>
  );
}
