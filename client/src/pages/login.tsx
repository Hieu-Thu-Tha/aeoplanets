import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { Logo } from "@/components/Logo";
import { HeroBackdrop } from "@/components/backgrounds/HeroBackdrop";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { SiLinkedin } from "react-icons/si";
import { PageHeading } from "@/components/ui/enterprise";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const { csrfToken, isLoading: csrfLoading } = useCsrfToken();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest("POST", "/api/auth/login", {
        ...data,
        _csrf: csrfToken,
      });
    },
    onSuccess: async (response: Response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      try {
        const data = await response.json();
        if (data.emailVerified === false) {
          setLocation("/verify-email");
          return;
        }
      } catch {}
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      const message = error.message.includes("401") 
        ? "Invalid email or password" 
        : "Login failed. Please try again.";
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <HeroBackdrop variant="powder" className="min-h-screen bg-black" powderOpacity={0.7} powderPosition="center">
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
              <PageHeading title="Welcome back" headingClassName="text-3xl font-bold text-white mb-2" />
              <p className="text-base text-white/70">
                Sign in to your account to continue
              </p>
            </div>

            {/* LinkedIn OAuth Button */}
            <Button
              size="lg"
              asChild
              data-testid="button-linkedin-signin"
              className="w-full mb-6 bg-[#0A66C2] hover:bg-[#004182] border-0 text-white"
            >
              <a href="/api/auth/linkedin" className="flex items-center justify-center gap-3">
                <SiLinkedin className="h-5 w-5" />
                <span>Sign in with LinkedIn</span>
              </a>
            </Button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-black px-4 text-white/60">or</span>
              </div>
            </div>

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
                      <div className="min-h-[18px]">
                        <FormMessage className="text-red-400 text-xs" />
                      </div>
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
                            placeholder="Enter your password"
                            autoComplete="current-password"
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
                      <div className="min-h-[18px]">
                        <FormMessage className="text-red-400 text-xs" />
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <a 
                    href="/forgot-password" 
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </a>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={loginMutation.isPending || csrfLoading}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-sm text-white/60">
                Don't have an account?{" "}
                <a 
                  href="/signup" 
                  className="text-primary hover:text-primary/80 transition-colors font-medium"
                  data-testid="link-signup"
                >
                  Sign up
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </HeroBackdrop>
  );
}
