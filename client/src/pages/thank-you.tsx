import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Check, Calendar, Bell, ArrowRight } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import blueBgImg from "@assets/blue-background_1776331854712.webp";
import { PageHeading } from "@/components/ui/enterprise";

export default function ThankYou() {
  usePageMeta({
    title: "Thank You — AEOSTARS | AI Visibility Intelligence",
    description: "Thank you for your interest in AEOSTARS. We'll be in touch soon.",
    keywords: "AEOSTARS, AI brand visibility, AI search monitoring",
  });

  return (
    <div className="min-h-screen bg-[#D6EEF8] text-[#0a2a3a]">
      <SiteHeader />
      
      <div className="flex flex-col">
        <main className="flex-1">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0">
              <img src={blueBgImg} alt="" className="w-full h-full object-cover opacity-30" aria-hidden="true" />
            </div>
            <div className="relative max-w-4xl mx-auto px-8 lg:px-12 py-32 sm:py-40 lg:py-48">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-8">
                  <Check className="h-10 w-10 text-green-500" />
                </div>

                <PageHeading
                  title={(
                    <>
                      <span className="block text-[#0a2a3a]">Thank You for</span>
                      <span className="block text-[#00B8D4] mt-2">Your Interest!</span>
                    </>
                  )}
                  titleText="Thank You for Your Interest!"
                  headingClassName="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl max-w-3xl"
                />
                
                <p className="mt-8 max-w-2xl text-lg sm:text-xl text-[#1a3a4a]/80">
                  You're now on the AEOSTARS list. We'll be in touch soon with next steps for accessing the platform.
                </p>

                <div className="mt-12 marketing-card rounded-xl p-8 max-w-lg w-full">
                  <h2 className="text-xl font-semibold text-[#0a2a3a] mb-6">What happens next?</h2>
                  <ul className="space-y-4 text-left">
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#00B8D4]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bell className="h-3.5 w-3.5 text-[#00B8D4]" />
                      </div>
                      <span className="text-[#1a3a4a]/80">
                        You'll receive email updates about our launch progress
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#00B8D4]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Calendar className="h-3.5 w-3.5 text-[#00B8D4]" />
                      </div>
                      <span className="text-[#1a3a4a]/80">
                        We'll reach out with platform access details
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      </div>
                      <span className="text-[#1a3a4a]/80">
                        Enjoy exclusive pricing as an early supporter
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
                  <Button 
                    size="lg"
                    variant="outline"
                    asChild
                    data-testid="button-back-home"
                    className="min-h-12 px-6 border-[#0a2a3a]/20 text-[#0a2a3a]"
                  >
                    <a href="/">
                      Back to Home
                    </a>
                  </Button>
                  <Button 
                    size="lg"
                    asChild
                    data-testid="button-read-news"
                    className="min-h-12 px-6 bg-[#00B8D4] border-[#00B8D4] text-white"
                  >
                    <a href="/news" className="flex items-center gap-2">
                      Read AEO News
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>

                <div className="mt-16 flex items-center gap-3 text-[#1a3a4a]/50 text-sm">
                  <SiLinkedin className="h-5 w-5 text-[#0A66C2]" />
                  <span>Connected via LinkedIn</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
