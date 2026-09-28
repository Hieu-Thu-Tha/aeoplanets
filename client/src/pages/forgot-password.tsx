import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { Logo } from "@/components/Logo";
import { HeroBackdrop } from "@/components/backgrounds/HeroBackdrop";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useState } from "react";
import { PageHeading } from "@/components/ui/enterprise";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const { csrfToken, isLoading: csrfLoading } = useCsrfToken();

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      return await apiRequest("POST", "/api/auth/forgot-password", {
        ...data,
        _csrf: csrfToken,
      });
    },
    onSuccess: () => {
      setEmailSent(true);
      toast({
        title: "Success",
        description: "If that email exists, a reset link has been sent",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process request. Please try again.",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    resetMutation.mutate(data);
  };

  return (
    <HeroBackdrop variant="mesh" className="min-h-screen bg-black" meshOpacity={0.15}>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex h-16 items-center px-8 max-w-7xl mx-auto">
            <a href="/" className="flex items-center gap-3">
              <Logo size="md" variant="dark" />
            </a>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md glass-card-dark rounded-xl p-8">
            <div className="text-center mb-8">
              <PageHeading title="Reset your password" headingClassName="text-3xl font-bold text-white mb-2" />
              <p className="text-base text-white/70">
                {emailSent
                  ? "Check your email for a reset link"
                  : "Enter your email to receive a password reset link"}
              </p>
            </div>

            {emailSent ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-16 h-16 rounded-full bg-[#00c8ff]/20 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-[#00c8ff]" />
                  </div>
                  <p className="text-center text-white/80">
                    We've sent a password reset link to <strong className="text-white">{form.getValues("email")}</strong>
                  </p>
                  <p className="text-sm text-white/60 text-center">
                    Didn't receive the email? Check your spam folder or try again
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/20 bg-white/5 hover:bg-white/10 text-white"
                  onClick={() => {
                    setEmailSent(false);
                    form.reset();
                  }}
                  data-testid="button-send-another"
                >
                  Send Another Link
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  className="w-full text-white/70 hover:text-white hover:bg-white/5"
                  data-testid="button-back-to-login"
                >
                  <a href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </a>
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={resetMutation.isPending || csrfLoading}
                    data-testid="button-submit"
                  >
                    {resetMutation.isPending ? "Sending..." : "Send Reset Link"}
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    className="w-full text-white/70 hover:text-white hover:bg-white/5"
                    data-testid="button-back-to-login"
                  >
                    <a href="/login">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Login
                    </a>
                  </Button>
                </form>
              </Form>
            )}
          </div>
        </div>
      </div>
    </HeroBackdrop>
  );
}
