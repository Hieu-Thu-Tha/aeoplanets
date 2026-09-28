import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#b8ddef]/30 bg-white/95 backdrop-blur-sm">
      <div className="flex py-3 items-center px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
        <a href="/" className="flex items-center shrink-0" data-testid="link-home">
          <Logo size="md" className="sm:h-12" />
        </a>
        
        <div className="ml-auto hidden md:flex items-center gap-6">
          <a href="/news" className="text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors font-medium text-sm" data-testid="link-header-news">
            News
          </a>
          <a href="/resources" className="text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors font-medium text-sm" data-testid="link-header-resources">
            Resources
          </a>
          <a href="/#faq" className="text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors font-medium text-sm" data-testid="link-faq">
            FAQ
          </a>
          <a href="/select-plan" className="text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors font-medium text-sm" data-testid="link-pricing">
            Pricing
          </a>
          <Button variant="ghost" asChild data-testid="button-login" className="text-[#1a3a4a] hover:text-[#0a2a3a]">
            <a href="/login">Sign In</a>
          </Button>
          <Button asChild data-testid="button-get-started" className="bg-[#00B8D4] border-[#00B8D4] text-white hover:bg-[#00a0b8]">
            <a href="/signup">
              Start Free Trial
            </a>
          </Button>
        </div>

        <div className="ml-auto md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu" className="text-[#0a2a3a]">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-white border-[#b8ddef]/30 w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-6 mt-8">
                <a 
                  href="/news" 
                  className="text-lg text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors py-2"
                  data-testid="link-mobile-news"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  News
                </a>
                <a 
                  href="/resources" 
                  className="text-lg text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors py-2"
                  data-testid="link-mobile-resources"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Resources
                </a>
                <a 
                  href="/#faq" 
                  className="text-lg text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors py-2"
                  data-testid="link-mobile-faq"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  FAQ
                </a>
                <a 
                  href="/select-plan" 
                  className="text-lg text-[#1a3a4a]/80 hover:text-[#0a2a3a] transition-colors py-2"
                  data-testid="link-mobile-pricing"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Pricing
                </a>
                <div className="border-t border-[#b8ddef]/30 pt-6 mt-2 flex flex-col gap-4">
                  <Button variant="outline" asChild data-testid="button-mobile-login" className="w-full">
                    <a href="/login">Sign In</a>
                  </Button>
                  <Button asChild data-testid="button-mobile-get-started" className="w-full bg-[#00B8D4] border-[#00B8D4] text-white">
                    <a href="/signup">
                      Start Free Trial
                    </a>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
