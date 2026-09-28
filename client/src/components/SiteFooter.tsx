import { Logo } from "@/components/Logo";

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#b8ddef]/30 bg-[#e8f4fa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2 sm:col-span-1">
            <Logo size="md" className="mb-4" />
            <p className="text-[#1a3a4a]/70 text-sm">
              AI Representation &amp; Visibility Intelligence for modern brands
            </p>
          </div>

          <div>
            <h3 className="text-[#0a2a3a] font-semibold mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <a href="/#features" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-features">
                  Features
                </a>
              </li>
              <li>
                <a href="/select-plan" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-pricing">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/#faq" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-faq">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[#0a2a3a] font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <a href="/news" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-news">
                  News & Insights
                </a>
              </li>
              <li>
                <a href="/#faq" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-help">
                  Help Center
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[#0a2a3a] font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <a href="/privacy" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-privacy">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/privacy#data-collection" className="text-[#1a3a4a]/70 hover:text-[#0a2a3a] transition-colors text-sm" data-testid="link-footer-terms">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#b8ddef]/30 pt-8">
          <p className="text-[#1a3a4a]/50 text-sm text-center" data-testid="text-copyright">
            &copy; {currentYear} Bobble Digital Ltd. All rights reserved. AEOSTARS is a trading name of Bobble Digital Ltd.
          </p>
        </div>
      </div>
    </footer>
  );
}
