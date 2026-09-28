import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { TRIAL_DAY_ADJECTIVE, TRIAL_DAYS_PHRASE } from "@shared/trial";
import { PageHeading } from "@/components/ui/enterprise";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Please enter a valid email address"),
  websiteUrl: z
    .string()
    .trim()
    .min(1, "Website URL is required")
    .refine((val) => {
      try {
        const withProtocol = val.startsWith("http") ? val : `https://${val}`;
        new URL(withProtocol);
        return true;
      } catch {
        return false;
      }
    }, "Please enter a valid website URL"),
});

type FormValues = z.infer<typeof formSchema>;

const inputClass =
  "bg-white text-[#0a2a3a] border-[#b8ddef] placeholder:text-[#1a3a4a]/40 focus-visible:ring-[#00B8D4]";

export default function StartTrial() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  usePageMeta({
    title: "Start Your Free Trial — AEOSTARS AI Brand Visibility",
    description:
      `Request your ${TRIAL_DAY_ADJECTIVE} free trial of AEOSTARS. Monitor how your brand appears in ChatGPT, Claude, and Gemini.`,
    ogType: "website",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      websiteUrl: "",
    },
  });

  const [honeypot, setHoneypot] = useState("");

  const onSubmit = async (values: FormValues) => {
    try {
      const websiteUrl = values.websiteUrl.startsWith("http")
        ? values.websiteUrl
        : `https://${values.websiteUrl}`;
      await apiRequest("POST", "/api/trial-requests", {
        ...values,
        websiteUrl,
        companyName: honeypot,
      });
      setSubmittedEmail(values.email);
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Could not submit request",
        description: err.message || "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#D6EEF8] text-[#0a2a3a] flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24 text-center">
            <PageHeading
              title={(
                <>
                  <span className="block gradient-text-bobble">Start your {TRIAL_DAY_ADJECTIVE}</span>
                  <span className="block mt-2 text-[#0a2a3a]">free trial of AEOSTARS</span>
                </>
              )}
              titleText={`Start your ${TRIAL_DAY_ADJECTIVE} free trial of AEOSTARS`}
              headingClassName="text-4xl sm:text-5xl font-bold tracking-tight md:text-6xl"
            />
            <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-[#1a3a4a]/70">
              See exactly how ChatGPT, Claude, and Gemini talk about your brand — and
              what to do about it. Tell us a few details and we'll set up your
              account.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 sm:px-8 lg:px-12">
          <div className="max-w-xl mx-auto">
            <Card className="bg-white border-[#b8ddef]/40 shadow-sm">
              <CardContent className="p-6 sm:p-8">
                {submitted ? (
                  <div className="text-center py-6" data-testid="thank-you-state">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00B8D4]/10">
                      <CheckCircle2 className="h-7 w-7 text-[#00B8D4]" />
                    </div>
                    <h2
                      className="text-2xl font-semibold text-[#0a2a3a] mb-3"
                      data-testid="text-thank-you-title"
                    >
                      Thanks — your request is in
                    </h2>
                    <p className="text-[#1a3a4a]/80 leading-relaxed">
                      We've sent a confirmation to{" "}
                      <span className="font-medium text-[#0a2a3a]">
                        {submittedEmail}
                      </span>
                      .
                    </p>
                    <p className="text-[#1a3a4a]/80 leading-relaxed mt-2">
                      Our team will review your request and email you again shortly
                      with next steps and your invite link to access AEOSTARS.
                    </p>
                  </div>
                ) : (
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-5"
                      data-testid="form-trial-request"
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: "-10000px",
                          top: "auto",
                          width: "1px",
                          height: "1px",
                          overflow: "hidden",
                        }}
                      >
                        <label htmlFor="company-name-hp">
                          Company name (leave blank)
                        </label>
                        <input
                          id="company-name-hp"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          value={honeypot}
                          onChange={(e) => setHoneypot(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[#0a2a3a]">
                                First name
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Jane"
                                  autoComplete="given-name"
                                  className={inputClass}
                                  data-testid="input-first-name"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[#0a2a3a]">
                                Last name
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Smith"
                                  autoComplete="family-name"
                                  className={inputClass}
                                  data-testid="input-last-name"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="websiteUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#0a2a3a]">
                              Website URL
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="url"
                                inputMode="url"
                                autoComplete="url"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="https://yourcompany.com"
                                className={inputClass}
                                data-testid="input-website-url"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#0a2a3a]">
                              Work email
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="you@yourcompany.com"
                                className={inputClass}
                                data-testid="input-email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        size="lg"
                        disabled={form.formState.isSubmitting}
                        className="w-full bg-[#00B8D4] border-[#00B8D4] text-white hover:bg-[#00a0b8]"
                        data-testid="button-submit-trial-request"
                      >
                        {form.formState.isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          "Request my free trial"
                        )}
                      </Button>

                      <p className="text-xs text-[#1a3a4a]/60 text-center pt-1">
                        No credit card required. Trial lasts {TRIAL_DAYS_PHRASE} from signup.
                      </p>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
