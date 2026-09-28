import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { HeroBackdrop } from "@/components/backgrounds/HeroBackdrop";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { useState, useEffect } from "react";
import { SiLinkedin } from "react-icons/si";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeading } from "@/components/ui/enterprise";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function Signup() {
  usePageMeta({
    title: "Create Your Account — AEOSTARS | AI Visibility Intelligence",
    description: "Create your AEOSTARS account and start monitoring how your brand appears in AI-generated answers from ChatGPT, Claude, and Gemini.",
    keywords: "AEOSTARS signup, AI brand visibility, AEO platform, AI search monitoring",
    ogType: "website",
  });

  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { csrfToken, isLoading: csrfLoading, refetchCsrfToken } = useCsrfToken();
  const { isAuthenticated } = useAuth();

  const params = new URLSearchParams(searchString);
  const inviteToken = params.get("token");

  const { data: inviteData } = useQuery<{ email: string; brandName: string; websiteUrl: string; trialDurationDays: number }>({
    queryKey: ["/api/auth/verify-invite-token", inviteToken],
    queryFn: async () => {
      const res = await fetch(`/api/auth/verify-invite-token/${inviteToken}`);
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    },
    enabled: !!inviteToken,
    retry: false,
  });

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  useEffect(() => {
    if (inviteData?.email) {
      form.setValue("email", inviteData.email);
    }
  }, [inviteData?.email]);

  const password = form.watch("password");

  // Password strength indicators
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const { confirmPassword, ...signupData } = data;
      // A signup link can be opened by a browser that already has an unrelated
      // session (e.g. the admin who provisioned this trial). Signup establishes a
      // brand-new session on top of whatever cookie is present, which would silently
      // take over that session. Only clear it once the user actually submits, not
      // just for visiting the page, so an in-progress visit doesn't get logged out.
      let freshCsrfToken = csrfToken;
      if (isAuthenticated) {
        await apiRequest("POST", "/api/auth/logout", {});
        // The CSRF secret lives on req.session, so destroying the session above
        // invalidates the token fetched while that session was active. Fetch a
        // new one bound to the fresh (unauthenticated) session before submitting.
        const { data } = await refetchCsrfToken();
        freshCsrfToken = data?.csrfToken;
      }
      return await apiRequest("POST", "/api/auth/signup", {
        ...signupData,
        _csrf: freshCsrfToken,
        ...(inviteToken ? { inviteToken } : {}),
      });
    },
    onSuccess: async (response: Response) => {
      // Wipe the cache rather than just invalidating the user query: if we logged
      // out a prior session above, stale billing/brand data for that account must
      // not leak into the newly created account's first render.
      queryClient.clear();

      let data: any = {};
      try { data = await response.json(); } catch {}
      
      if (data.prelaunch) {
        setLocation("/thank-you");
      } else if (data.isProvisioned || inviteToken) {
        toast({
          title: "Account created",
          description: "Your AI visibility report is ready!",
        });
        setLocation("/dashboard");
      } else if (data.emailVerified === false) {
        setLocation("/verify-email");
      } else {
        toast({
          title: "Account created",
          description: "Welcome to AEOSTARS!",
        });
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      let message = "Signup failed. Please try again.";
      
      if (error.message.includes("already exists")) {
        message = "An account with this email already exists.";
      } else if (error.message.includes("Validation error")) {
        message = "Please check your input and try again.";
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    },
  });

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(data);
  };

  return (
    <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex h-16 items-center px-4 sm:px-8 max-w-7xl mx-auto">
            <a href="/" className="flex items-center gap-3">
              <Logo size="md" variant="dark" />
            </a>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md glass-card-dark rounded-xl p-8">
            <div className="text-center mb-8">
              <PageHeading
                title={inviteData ? "Sign Up to See Your Results" : "Create Your Account"}
                headingClassName="text-3xl font-bold text-white mb-2"
              />
              <p className="text-base text-white/70">
                {inviteData
                  ? `Your AI visibility report for ${inviteData.brandName} is ready`
                  : "Start monitoring your brand's AI visibility today"}
              </p>
              {inviteData && (
                <p className="text-sm text-white/60 mt-2">
                  Includes {inviteData.trialDurationDays} days of access from signup
                </p>
              )}
            </div>

            {!inviteToken && (
              <>
                <Button
                  size="lg"
                  asChild
                  data-testid="button-linkedin-signin"
                  className="w-full mb-6 bg-[#0A66C2] hover:bg-[#004182] border-0 text-white"
                >
                  <a href="/api/auth/linkedin" className="flex items-center justify-center gap-3">
                    <SiLinkedin className="h-5 w-5" />
                    <span>Sign up with LinkedIn</span>
                  </a>
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-black px-4 text-white/60">or</span>
                  </div>
                </div>
              </>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">First Name</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="John"
                            autoComplete="given-name"
                            data-testid="input-firstname"
                            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Last Name</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Doe"
                            autoComplete="family-name"
                            data-testid="input-lastname"
                            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          data-testid="input-email"
                          className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-primary"
                          readOnly={!!inviteData}
                          {...field}
                        />
                      </FormControl>
                      {inviteData && (
                        <p className="text-xs text-white/50">This email is linked to your invitation and cannot be changed</p>
                      )}
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a strong password"
                            autoComplete="new-password"
                            data-testid="input-password"
                            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-primary pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {password && (
                  <div className="space-y-2 p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-xs text-white/70 mb-2">Password must contain:</p>
                    <div className="space-y-1.5">
                      {Object.entries({
                        length: "At least 8 characters",
                        uppercase: "One uppercase letter",
                        lowercase: "One lowercase letter",
                        number: "One number",
                        special: "One special character",
                      }).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                          {passwordChecks[key as keyof typeof passwordChecks] ? (
                            <Check className="h-3 w-3 text-[#00c8ff]" data-testid={`check-${key}`} />
                          ) : (
                            <X className="h-3 w-3 text-white/40" data-testid={`x-${key}`} />
                          )}
                          <span className={`text-xs ${passwordChecks[key as keyof typeof passwordChecks] ? 'text-white/90' : 'text-white/50'}`}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your password"
                            autoComplete="new-password"
                            data-testid="input-confirm-password"
                            className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-primary pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                            data-testid="button-toggle-confirm-password"
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={signupMutation.isPending || csrfLoading}
                  data-testid="button-signup"
                >
                  {signupMutation.isPending ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-sm text-white/60">
                Already have an account?{" "}
                <a 
                  href="/login" 
                  className="text-primary hover:text-primary/80 transition-colors font-medium"
                  data-testid="link-login"
                >
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </HeroBackdrop>
  );
}
