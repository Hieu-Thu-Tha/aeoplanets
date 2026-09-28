import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { usePageMeta } from "@/hooks/usePageMeta";
import bobbleBannerBg from "@assets/bobble-homepage-banner_1776335377884.webp";
import { PageHeading } from "@/components/ui/enterprise";

export default function Privacy() {
  usePageMeta({
    title: "Privacy Policy - AEOSTARS",
    description: "AEOSTARS privacy policy. Learn how we collect, use, and protect your data on our Answer Engine Optimization platform.",
  });

  return (
    <div className="relative min-h-screen bg-[#D6EEF8] text-[#0a2a3a]">
      <div className="absolute inset-0">
        <img src={bobbleBannerBg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
      <div className="relative">
      <SiteHeader />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-16">
        <PageHeading title="Privacy Policy" headingClassName="text-4xl md:text-5xl font-bold mb-4 text-[#0a2a3a]" headingTestId="heading-privacy" />
        <p className="text-[#1a3a4a]/50 mb-12" data-testid="text-last-updated">
          Last updated: November 11, 2025
        </p>

        <div className="prose max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-introduction">
              1. Introduction
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              Welcome to AEOSTARS ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Answer Engine Optimization (AEO) platform.
            </p>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              By using AEOSTARS, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our services.
            </p>
          </section>

          <section id="data-collection">
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-data-collection">
              2. Information We Collect
            </h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">2.1 Personal Information</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>Account Information:</strong> Name, email address, password, and LinkedIn profile data (if you authenticate via LinkedIn OAuth)</li>
              <li><strong>Brand Information:</strong> Company name, website URL, industry, and brand-related content you submit for monitoring</li>
              <li><strong>Payment Information:</strong> Billing address and payment details (processed securely through our payment providers)</li>
              <li><strong>Communication Data:</strong> Messages, feedback, and support requests you send to us</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">2.2 Automatically Collected Information</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              When you access our platform, we automatically collect certain information, including:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on platform, and interaction patterns</li>
              <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers</li>
              <li><strong>Cookies and Tracking:</strong> Session cookies, authentication tokens, and analytics data</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">2.3 Third-Party Data</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We collect data from third-party services to provide our core functionality:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>LLM API Responses:</strong> Data from OpenAI GPT, Anthropic Claude, and Google Gemini when executing monitoring queries</li>
              <li><strong>Google Merchant Center:</strong> Product feed data when you connect your Google account</li>
              <li><strong>Web Crawling Data:</strong> Publicly available content from your website for LLM MAP generation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-how-we-use">
              3. How We Use Your Information
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li>Provide, maintain, and improve our AEO platform services</li>
              <li>Monitor your brand's visibility across multiple LLM engines</li>
              <li>Generate AI-powered content recommendations using Gemini 2.5 Pro</li>
              <li>Create and maintain LLM MAP feeds (JSON-LD and llms.txt formats)</li>
              <li>Process your payments and manage your subscription</li>
              <li>Send you technical notices, updates, security alerts, and support messages</li>
              <li>Respond to your comments, questions, and customer service requests</li>
              <li>Analyze usage patterns to improve user experience and platform performance</li>
              <li>Detect, prevent, and address technical issues and fraudulent activity</li>
              <li>Comply with legal obligations and enforce our terms of service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-data-sharing">
              4. Data Sharing and Disclosure
            </h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">4.1 Third-Party Service Providers</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We share data with trusted third-party service providers who assist us in operating our platform:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>LLM Providers:</strong> OpenAI, Anthropic, and Google (for executing monitoring queries and generating recommendations)</li>
              <li><strong>Cloud Infrastructure:</strong> Replit and Neon (for hosting and database services)</li>
              <li><strong>Analytics:</strong> Usage analytics providers to understand platform performance</li>
              <li><strong>Payment Processors:</strong> Secure payment gateway providers for billing</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">4.2 Legal Requirements</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We may disclose your information if required by law or in response to valid legal requests, including:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li>Compliance with legal obligations, court orders, or government requests</li>
              <li>Protection of our rights, property, or safety, and that of our users</li>
              <li>Investigation of potential violations of our Terms of Service</li>
              <li>Prevention of fraud, security issues, or technical problems</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-[#0a2a3a]">4.3 Business Transfers</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity. We will notify you of any such change in ownership or control of your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-data-security">
              5. Data Security
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>Encryption:</strong> All data in transit is encrypted using TLS/SSL protocols</li>
              <li><strong>Password Security:</strong> Passwords are hashed using Argon2id, a secure password hashing algorithm</li>
              <li><strong>Authentication:</strong> CSRF protection and secure session management for all authenticated requests</li>
              <li><strong>Access Controls:</strong> Role-based access controls and principle of least privilege</li>
              <li><strong>Database Security:</strong> PostgreSQL database with encrypted connections and regular backups</li>
              <li><strong>API Security:</strong> Secure storage of API keys and secrets using environment variables</li>
            </ul>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-data-retention">
              6. Data Retention
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We retain your personal information for as long as necessary to:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li>Provide you with our services and maintain your account</li>
              <li>Comply with legal obligations, tax, and accounting requirements</li>
              <li>Resolve disputes and enforce our agreements</li>
            </ul>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              When you delete your account, we will delete or anonymize your personal information within 30 days, unless we are required to retain it for legal purposes. Historical monitoring data and aggregated analytics may be retained in anonymized form.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-your-rights">
              7. Your Privacy Rights
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>Access:</strong> Request access to the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a machine-readable format</li>
              <li><strong>Objection:</strong> Object to processing of your personal information</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              <li><strong>Withdrawal of Consent:</strong> Withdraw consent for data processing where consent is the legal basis</li>
            </ul>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              To exercise these rights, please contact us using the information in the "Contact Us" section below. We will respond to your request within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-cookies">
              8. Cookies and Tracking Technologies
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We use cookies and similar tracking technologies to:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li><strong>Essential Cookies:</strong> Required for authentication and core platform functionality</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our platform</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              You can control cookies through your browser settings. However, disabling essential cookies may affect platform functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-third-party">
              9. Third-Party Services and Links
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              Our platform may contain links to third-party websites or integrate with third-party services (LinkedIn, Google, LLM providers). We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies before providing any information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-children">
              10. Children's Privacy
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              AEOSTARS is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately, and we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-international">
              11. International Data Transfers
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. By using our services, you consent to the transfer of your information to these locations. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-updates">
              12. Updates to This Privacy Policy
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:
            </p>
            <ul className="list-disc list-inside text-[#1a3a4a]/80 space-y-2 mt-3 ml-4">
              <li>Posting the updated policy on this page with a new "Last updated" date</li>
              <li>Sending you an email notification (for significant changes)</li>
              <li>Displaying a prominent notice on our platform</li>
            </ul>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              Your continued use of our services after any changes indicates your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#0a2a3a]" data-testid="heading-contact">
              13. Contact Us
            </h2>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-4 p-6 bg-white border border-[#b8ddef]/30 rounded-xl shadow-sm">
              <p className="text-[#1a3a4a]/80"><strong>Email:</strong> privacy@aeostars.com</p>
              <p className="text-[#1a3a4a]/80 mt-2"><strong>Phone:</strong> +44 (0113) 468 3902</p>
              <p className="text-[#1a3a4a]/80 mt-2"><strong>Address:</strong> Bobble Digital Ltd</p>
              <p className="text-[#1a3a4a]/80 ml-20">Suite 1.07, Department</p>
              <p className="text-[#1a3a4a]/80 ml-20">4 The Boulevard, Leeds Dock</p>
              <p className="text-[#1a3a4a]/80 ml-20">Leeds, LS10 1PZ</p>
            </div>
            <p className="text-[#1a3a4a]/80 leading-relaxed mt-4">
              We will respond to all requests within 30 days.
            </p>
          </section>

          <section className="mt-8 p-6 bg-[#00B8D4]/5 border border-[#00B8D4]/15 rounded-xl">
            <h3 className="text-xl font-semibold mb-3 text-[#0a2a3a]">Notice for EU and California Residents</h3>
            <p className="text-[#1a3a4a]/80 leading-relaxed">
              If you are a resident of the European Union or California, you have additional rights under GDPR and CCPA respectively, including the right to know what personal information is collected, the right to deletion, and the right to opt-out of sale of personal information. AEOSTARS does not sell your personal information. For more information or to exercise your rights, please contact us at privacy@aeostars.com.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
      </div>
    </div>
  );
}
