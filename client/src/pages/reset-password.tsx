import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { Logo } from "@/components/Logo";
import { HeroBackdrop } from "@/components/backgrounds/HeroBackdrop";
import { PageHeading } from "@/components/ui/enterprise";
import { Eye, EyeOff, Check, X, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const { csrfToken, isLoading: csrfLoading } = useCsrfToken();

  // Extract token from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    setToken(tokenParam);
  }, []);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = form.watch("password");

  // Password strength indicators
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const resetMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      return await apiRequest("POST", "/api/auth/reset-password", {
        ...data,
        token,
        _csrf: csrfToken,
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password reset successfully. You can now sign in.",
      });
      setLocation("/login");
    },
    onError: (error: Error) => {
      const message = error.message.includes("invalid") || error.message.includes("expired")
        ? "This reset link is invalid or has expired"
        : "Failed to reset password. Please try again.";
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetMutation.mutate(data);
  };

  // Show loading state while checking for token
  if (token === undefined) {
    return (
      <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex h-16 items-center px-8 max-w-7xl mx-auto">
              <a href="/" className="flex items-center gap-3">
                <Logo size="md" variant="dark" />
              </a>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="text-white/70">Loading...</div>
          </div>
        </div>
      </HeroBackdrop>
    );
  }

  // Show error if token is explicitly null (invalid/missing)
  if (token === null) {
    return (
      <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex h-16 items-center px-8 max-w-7xl mx-auto">
              <a href="/" className="flex items-center gap-3">
                <Logo size="md" variant="dark" />
              </a>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md glass-card-dark rounded-xl p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                </div>
                <PageHeading title="Invalid Reset Link" headingClassName="text-3xl font-bold text-white mb-2" />
                <p className="text-base text-white/70">
                  This password reset link is invalid or has expired.
                </p>
              </div>
              <Button asChild className="w-full" data-testid="button-forgot-password">
                <a href="/forgot-password">Request New Reset Link</a>
              </Button>
            </div>
          </div>
        </div>
      </HeroBackdrop>
    );
  }

  return (
    <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex h-16 items-center px-8 max-w-7xl mx-auto">
            <a href="/" className="flex items-center gap-3">
              <Logo size="md" />
            </a>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md glass-card-dark rounded-xl p-8">
            <div className="text-center mb-8">
              <PageHeading title="Set new password" headingClassName="text-3xl font-bold text-white mb-2" />
              <p className="text-base text-white/70">
                Enter a new password for your account
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">New Password</FormLabel>
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
                      <FormLabel className="text-white">Confirm New Password</FormLabel>
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
                  disabled={resetMutation.isPending || csrfLoading}
                  data-testid="button-reset-password"
                >
                  {resetMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </HeroBackdrop>
  );
}
