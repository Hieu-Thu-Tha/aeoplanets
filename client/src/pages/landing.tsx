import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BarChart3, TrendingUp, Zap, Shield, ArrowRight, Check, Clock, Calendar, Newspaper, Eye, Brain, GitCompare, FileSearch, X, Target, Radar, ShieldAlert, Layers, Activity, Search, AlertTriangle, MessageCircleWarning, ClipboardCheck, Users } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import type { CustomerReview, NewsArticle } from "@shared/schema";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReviewsSection } from "@/components/ReviewsSection";
import { format } from "date-fns";
import featureVisibilityImg from "@assets/feature-visibility.png";
import featurePerceptionImg from "@assets/feature-perception.png";
import featureCompetitorImg from "@assets/feature-competitor.png";
import featureWeaknessImg from "@assets/feature-weakness.png";
import featureReadabilityImg from "@assets/feature-readability.png";
import featureKanbanImg from "@assets/Rectangle_131(1)_1772128630638.png";
import oldWayManImg from "@assets/Rectangle_133_1772129306932.png";
import newWayDashboardImg from "@assets/Rectangle_132_1772129306931.png";
import blueBgImg from "@assets/blue-background_1776331854712.webp";
import mannibobbleImg from "@assets/bobble-pod_1_1776334996619.png";
import curveBgImg from "@assets/background-with-curve-e1720697571982_1776335272580.webp";
import bobbleBannerBg from "@assets/bobble-homepage-banner_1776335377884.webp";
import blueBgPattern from "@assets/blue-background_1776335377885.webp";
import { TRIAL_DAY_ADJECTIVE, TRIAL_DAY_ADJECTIVE_TITLE, TRIAL_DAYS_PHRASE } from "@shared/trial";
import { PageHeading } from "@/components/ui/enterprise";

const faqData = [
  {
    question: "What is AI Representation & Visibility Intelligence?",
    answer: "AI Representation & Visibility Intelligence is the practice of understanding and shaping how your brand is described, recommended, and positioned within large language model (LLM) responses from ChatGPT, Claude, and Gemini. Unlike traditional SEO, which targets search engine rankings, AI representation focuses on the narrative and authority signals that cause an LLM to include, recommend, or omit your brand when answering user questions. AEOSTARS measures this automatically across four prompt types and all major LLMs, giving you a real, data-driven picture of your AI presence."
  },
  {
    question: "How do I find out if ChatGPT, Claude, or Gemini is mentioning my brand?",
    answer: "You cannot monitor this manually at scale because the question space is too vast. AEOSTARS runs structured prompt batches across all major LLMs every day: brand-direct queries ('What is [your brand]?'), category comparison queries ('Best tools for [your category]'), commercial intent queries ('Alternatives to [competitor]'), and problem-based queries ('How do I solve [your core problem]?'). Each response is parsed to determine whether your brand appeared, at what position, and with what sentiment. The result is an AI Share of Voice score that updates daily."
  },
  {
    question: "What is AI Share of Voice, and how is it calculated?",
    answer: "AI Share of Voice is the percentage of tracked prompt runs in which your brand appears in the LLM response. For example, if AEOSTARS runs 120 prompts across all major LLMs and your brand is mentioned in 42 of those responses, your AI Share of Voice is 35%. We also break this down by prompt type: Commercial Recommendation Score (how often you appear on buying-intent queries) and Category Authority Score (how often you appear on category-level comparisons), giving you the granularity needed to act on specific gaps."
  },
  {
    question: "How is this different from traditional SEO or AEO content optimisation?",
    answer: "Traditional SEO and AEO content optimisation tell you how to write content so that AI models might include you. AEOSTARS tells you whether they currently are, and exactly how you compare to your competitors. It is measurement and intelligence, not optimisation advice alone. Think of it as the analytics layer that sits above your content strategy, revealing which prompt types and models you're winning or losing, which competitors are being recommended in your place, and what your brand's perceived authority and positioning actually looks like inside the models' knowledge."
  },
  {
    question: "What is an AI Perception Mirror?",
    answer: "The AI Perception Mirror is AEOSTARS's narrative intelligence feature. It interrogates each LLM directly, asking 'What do you know about [your brand]?' without feeding it your website, and analyses the response to build a structured profile. This profile includes your Positioning Clarity score, Authority Depth score, Proof Strength score, and Differentiation Clarity score, each rated 0 to 100. It also surfaces the specific strengths, weaknesses, and confusion signals the models associate with your brand, plus a prioritised list of the top improvements that would increase your inclusion rate."
  },
  {
    question: "Can AI models give wrong or misleading information about my brand?",
    answer: "Yes. AI hallucination is a significant and growing brand risk. LLMs synthesise their outputs from training data and retrieval sources that may be outdated, biased, or simply wrong. AEOSTARS's daily monitoring flags instances where a model describes your brand inaccurately, attributes competitor features to you, or gives outdated pricing, leadership, or product information. The earlier you detect these narrative errors, the faster you can address the underlying content gaps that are causing them, because the most effective counter to an AI hallucination is becoming the most authoritative, structured source of truth about your own brand."
  },
  {
    question: "Which AI models does AEOSTARS track?",
    answer: "AEOSTARS currently tracks all major large language models: OpenAI (the models powering ChatGPT), Anthropic Claude, and Google Gemini. These models represent the dominant share of consumer and enterprise AI-generated answers. Each prompt runs independently against all of them, so you can see whether your visibility is consistent across models or whether you have model-specific gaps. This is a common finding, since each LLM weights authority signals differently."
  },
  {
    question: "How does the Competitor AI Positioning Map work?",
    answer: "The Competitor AI Positioning Map shows you every tracked prompt where a competitor was mentioned but your brand was not. For each such prompt, AEOSTARS surfaces the raw response snippet (with competitor names highlighted), the competitor's mention frequency across all your tracked prompts, and an analysis of why the model likely included that competitor. This gives you a prioritised, evidence-based action list: these are the exact questions, topics, and intent types where a competitor is winning the AI narrative, and where your content intervention will have the greatest impact."
  },
  {
    question: "What is the Machine Readability Audit?",
    answer: "The Machine Readability Audit is an on-demand technical assessment of your website's homepage and key pages, measuring how legible and structured your content is for LLMs. It checks for the presence of Organisation schema, FAQ schema, Article schema, author markup, canonical tags, internal linking depth, comparison/alternative pages, and clear meta descriptions. Each check is scored pass, warning, or fail, with a specific fix recommendation. A strong readability score dramatically increases the likelihood that LLMs will extract, trust, and cite your content when answering relevant questions."
  },
  {
    question: "How often does AEOSTARS scan the AI models, and how quickly will I see changes?",
    answer: "AEOSTARS runs a full baseline scan when you first onboard, then performs daily automated visibility checks at midnight. The daily scheduler re-runs all prompt types against all major LLMs, compares results to the previous day, and generates change alerts for significant shifts. For example, a competitor newly appearing for a prompt where you previously dominated, or your brand disappearing from a category it was previously included in. Alerts appear in your Change Monitoring centre within hours of the daily scan completing, so you have an early warning system rather than a monthly surprise."
  },
  {
    question: "How is AEOSTARS different from other AI visibility or SEO tools?",
    answer: "AEOSTARS is a pure intelligence and gap analysis engine. We don't create content; we tell you exactly where your AI presence is strong, where it's weak, and what to fix. Traditional SEO tools like Semrush and Ahrefs focus on Google rankings and keyword data. They don't monitor LLM responses at all. Content-first platforms like Surfer or AI writing tools produce content but can't tell you whether AI models are actually citing you. Agencies cost thousands per month and deliver manual spot-checks at best. AEOSTARS runs automated daily scans across all major LLMs (Claude, OpenAI and Gemini) with structured prompt types covering awareness, consideration, and commercial intent, then layers on perception scoring, competitor gap mapping, semantic coverage analysis, and machine readability auditing. The result is a complete, data-driven picture of your AI presence that updates every day, starting from £29.99 per month."
  }
];

export default function Landing() {
  usePageMeta({
    title: "AEOSTARS | AI Representation & Visibility Intelligence Platform",
    description: "Track how your brand appears in ChatGPT, Claude, and Gemini answers. Measure AI Share of Voice, analyse your AI perception profile, and close competitive gaps across all major LLMs.",
    keywords: "AI brand visibility, LLM brand monitoring, AI share of voice, ChatGPT brand tracking, Claude brand visibility, Gemini brand monitoring, AI representation intelligence, answer engine optimization, AEO platform",
  });

  const { data: reviews = [] } = useQuery<CustomerReview[]>({
    queryKey: ["/api/reviews/approved"],
    staleTime: 60000,
  });

  const { data: articles = [] } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news"],
    staleTime: 60000,
  });

  const latestArticles = articles
    .filter(a => a.isPublished)
    .sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 6);

  const estimateReadTime = (content: string): number => {
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
  };

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length
    : 0;

  const aggregateRatingSchema = reviews.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "AEOSTARS",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": avgRating.toFixed(1),
      "reviewCount": reviews.length,
      "bestRating": "5",
      "worstRating": "1",
    },
  } : null;

  const SectionCTA = () => (
    <div className="flex flex-col items-center gap-3 py-8 sm:py-12">
      <Button 
        size="lg"
        asChild
        data-testid="button-section-cta"
        className="min-h-12 px-7 text-base font-semibold bg-[#00B8D4] border-[#00B8D4] text-white shadow-lg shadow-[#00B8D4]/20"
      >
        <a href="/signup" className="flex items-center gap-3">
          <span>Start {TRIAL_DAY_ADJECTIVE_TITLE} Free Trial</span>
        </a>
      </Button>
      <a 
        href="/api/auth/linkedin"
        className="text-[#1a3a4a]/50 text-sm flex items-center gap-1.5"
        data-testid="link-section-linkedin-signin"
      >
        <SiLinkedin className="h-3.5 w-3.5" />
        or sign up with LinkedIn
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#D6EEF8] text-[#0a2a3a] overflow-x-hidden">
      <SiteHeader />
      
      <div className="flex flex-col">
        {/* Hero Section */}
        <main className="flex-1">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0">
              <img src={blueBgImg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
              <div className="absolute inset-0 bg-[#D6EEF8]/30" />
            </div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-12 sm:pt-16 lg:pt-20">
              <div className="flex flex-col lg:flex-row items-center lg:items-end justify-between gap-8 lg:gap-0">
                <div className="flex flex-col items-center lg:items-start text-center lg:text-left flex-1 pb-16 sm:pb-20 lg:pb-24">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#00B8D4]/20 bg-white/60 text-sm mb-8">
                    <span className="w-2 h-2 bg-[#00B8D4] rounded-full animate-pulse" />
                    <span className="text-[#1a3a4a]">Start your {TRIAL_DAY_ADJECTIVE} free trial. No credit card required.</span>
                  </div>

                  <PageHeading
                    title={(
                      <>
                        <span className="block text-[#0a2a3a]">AI Visibility Intelligence</span>
                        <span className="block gradient-text-bobble mt-2">for the Next Generation of Search</span>
                      </>
                    )}
                    titleText="AI Visibility Intelligence for the Next Generation of Search"
                    headingClassName="text-3xl font-bold tracking-tight sm:text-5xl lg:text-7xl xl:text-8xl max-w-5xl"
                  />
                </div>

                <div className="hidden lg:block flex-shrink-0">
                  <img 
                    src={mannibobbleImg} 
                    alt="AEO by Mr Bobble" 
                    className="w-[588px] xl:w-[728px] h-auto object-contain drop-shadow-2xl block"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-white">
            <div className="absolute inset-0">
              <img src={curveBgImg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-28">
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                <p className="max-w-2xl text-lg sm:text-xl lg:text-2xl text-[#1a3a4a]/80 mb-10 sm:mb-14 leading-relaxed">
                  AEOStars reveals how AI represents your brand, exposes narrative gaps, analyses competitor weaknesses to leverage and identifies technical limitations, inconsistencies and content strategy gaps, tracking daily AI visibility shifts across all major AI platforms.
                </p>

                <div className="flex flex-col items-center lg:items-start gap-4">
                  <Button 
                    size="lg"
                    asChild
                    data-testid="button-hero-signup"
                    className="min-h-14 px-8 text-lg font-semibold bg-[#00B8D4] border-[#00B8D4] text-white shadow-xl shadow-[#00B8D4]/20"
                  >
                    <a href="/signup">
                      <span>Start {TRIAL_DAY_ADJECTIVE_TITLE} Free Trial</span>
                    </a>
                  </Button>
                  
                  <a 
                    href="/api/auth/linkedin"
                    className="text-[#1a3a4a]/50 text-sm flex items-center gap-1.5"
                    data-testid="link-hero-linkedin"
                  >
                    <SiLinkedin className="h-3.5 w-3.5" />
                    or sign up with LinkedIn
                  </a>
                </div>

                <div className="mt-14 sm:mt-20 flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-10 text-base sm:text-lg text-[#1a3a4a]">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-[#00B8D4]" />
                    <span className="font-medium">{TRIAL_DAY_ADJECTIVE} free trial, no card required</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-[#00B8D4]" />
                    <span className="font-medium">All major LLMs: Claude, OpenAI and Gemini</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-[#00B8D4]" />
                    <span className="font-medium">Daily automated scanning</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Old Way vs New Way Section */}
          <div className="bg-white border-y border-[#b8ddef]/30">
            <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
              <div className="text-center mb-16">
                <div className="inline-block mb-4">
                  <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">The Problem</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0a2a3a]">
                  You can't manage what you can't measure
                </h2>
                <p className="mt-6 text-lg text-[#1a3a4a]/70 max-w-2xl mx-auto">
                  AI models are already answering questions about your industry. The question is whether they're mentioning you, and right now, you have no way to know.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
                <div className="bg-[#f5f9fc] rounded-xl overflow-hidden border border-[#b8ddef]/30" data-testid="card-old-way">
                  <div className="rounded-t-xl overflow-hidden border-b border-[#b8ddef]/20">
                    <img src={oldWayManImg} alt="Checking manually" className="w-full h-44 object-cover object-center" loading="lazy" />
                  </div>
                  <div className="p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-[#0a2a3a] mb-6">Checking manually</h3>
                    <ul className="space-y-4">
                      {[
                        "You don't know how AI is selling your brand",
                        "You check manually and see biased results",
                        "You can't see what real prospects see",
                        "No trend data, just snapshots",
                        "No competitor intelligence",
                        "No narrative or authority insight",
                        "No structured strategy",
                        "No clear action plan",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <X className="h-4 w-4 text-red-400/70 mt-0.5 shrink-0" />
                          <span className="text-sm text-[#1a3a4a]/60">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 pt-5 border-t border-[#b8ddef]/20">
                      <p className="text-sm text-[#1a3a4a]/40">You're guessing</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl overflow-hidden border border-[#00B8D4]/20 shadow-sm" data-testid="card-new-way">
                  <div className="rounded-t-xl overflow-hidden border-b border-[#00B8D4]/10">
                    <img src={newWayDashboardImg} alt="With AEOSTARS" className="w-full h-44 object-cover object-center" loading="lazy" />
                  </div>
                  <div className="p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-[#0a2a3a] mb-6">With AEOSTARS</h3>
                    <ul className="space-y-4">
                      {[
                        "You control your position inside AI answers",
                        "Daily cross-model visibility tracking",
                        "Real competitor gap mapping",
                        "Narrative and authority scoring",
                        "Weakness detection, yours and theirs",
                        "Trend monitoring with instant alerts",
                        "Automated tickets telling you what to fix",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="h-4 w-4 text-[#00B8D4] mt-0.5 shrink-0" />
                          <span className="text-sm text-[#1a3a4a]/80">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 pt-5 border-t border-[#00B8D4]/10">
                      <p className="text-sm text-[#00B8D4]">You move from guesswork to advantage</p>
                    </div>
                  </div>
                </div>
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* Features Section */}
          <div id="features" className="relative overflow-hidden bg-[#D6EEF8]">
            <div className="absolute inset-0">
              <img src={bobbleBannerBg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
              <div className="text-center mb-20">
                <div className="inline-block mb-4">
                  <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">Intelligence Engine</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0a2a3a]">
                  Full-spectrum AI brand intelligence
                </h2>
                <p className="mt-6 text-lg text-[#1a3a4a]/70 max-w-2xl mx-auto">
                  From daily visibility monitoring to narrative perception analysis. A complete intelligence engine for understanding and improving your AI presence
                </p>
              </div>

              <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    image: featureVisibilityImg,
                    title: "AI Visibility Monitoring",
                    description: "Daily automated scans across all major LLMs: Claude, OpenAI and Gemini. Measure AI Share of Voice with inclusion rate, position, sentiment, and competitor co-mentions tracked per prompt type.",
                  },
                  {
                    image: featurePerceptionImg,
                    title: "AI Perception Mirror",
                    description: "Understand exactly how AI models describe your brand: authority, positioning clarity, proof strength, and differentiation. Includes a scored narrative profile and prioritised improvements.",
                  },
                  {
                    image: featureCompetitorImg,
                    title: "Competitor Positioning Map",
                    description: "See every prompt where a competitor was recommended but you were not. Understand why they appeared, and get a precise content action plan to close each gap.",
                  },
                  {
                    image: featureWeaknessImg,
                    title: "Competitor Weakness Intelligence",
                    description: "Exploit negative reviews, complaints, and churn signals from G2, Capterra, Trustpilot, and Reddit to uncover where your competitors are failing. Pinpoint the exact problems their customers face so you can position your brand as the stronger alternative and differentiate your proposition where it matters most.",
                  },
                  {
                    image: featureReadabilityImg,
                    title: "Machine Readability Audit",
                    description: "On-demand technical audit of your site's LLM readability covering schema markup, FAQ structure, author signals, and canonical tags. Each check returns a score and specific fix guidance.",
                  },
                  {
                    image: featureKanbanImg,
                    title: "Actions Kanban",
                    description: "Every insight uncovered across your visibility scans, perception analysis, readability audit, and competitor research is automatically converted into an actionable ticket. Invite your team, assign ownership, and collaborate on resolving issues together — turning intelligence into measurable improvement.",
                  },
                ].map((feature) => (
                  <div key={feature.title} className="marketing-card rounded-xl overflow-visible hover-elevate group">
                    {"image" in feature && feature.image ? (
                      <div className="rounded-t-xl overflow-hidden border-b border-[#b8ddef]/20">
                        <img
                          src={feature.image as string}
                          alt={feature.title}
                          className="w-full h-44 object-cover object-center"
                          loading="lazy"
                        />
                      </div>
                    ) : "icon" in feature && feature.icon ? (
                      <div className="rounded-t-xl overflow-hidden border-b border-[#b8ddef]/20 h-44 bg-gradient-to-br from-[#D6EEF8] to-[#e8f4fa] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          {(() => { const Icon = feature.icon as React.ElementType; return <Icon className="h-12 w-12 text-[#00B8D4]/60" />; })()}
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#1a3a4a]/30" />
                            <ClipboardCheck className="h-4 w-4 text-[#1a3a4a]/30" />
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="p-6 sm:p-8 pt-6">
                      <h3 className="text-xl font-bold text-[#0a2a3a] mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-base text-[#1a3a4a]/70">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* How It Works Section */}
          <div className="bg-white border-t border-[#b8ddef]/30">
            <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
              <div className="text-center mb-16">
                <div className="inline-block mb-4">
                  <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">How It Works</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0a2a3a]">
                  From onboarding to intelligence in four steps
                </h2>
                <p className="mt-6 text-lg text-[#1a3a4a]/70 max-w-2xl mx-auto">
                  AEOSTARS handles the interrogation, analysis, and monitoring. You get the intelligence to act on
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
                {[
                  {
                    step: "01",
                    icon: Target,
                    title: "Define your brand",
                    description: "Tell us your brand, what you do, and who your competitors are. Our AI generates structured prompts across awareness, consideration, and commercial intent."
                  },
                  {
                    step: "02",
                    icon: Radar,
                    title: "AI interrogation",
                    description: "We query all major LLMs (Claude, OpenAI and Gemini) with your prompts, measuring whether each model mentions, recommends, or ignores your brand."
                  },
                  {
                    step: "03",
                    icon: Activity,
                    title: "Daily monitoring",
                    description: "Automated scans run every day at midnight. The system detects shifts in visibility, new competitor appearances, and sentiment changes, then alerts you immediately."
                  },
                  {
                    step: "04",
                    icon: Layers,
                    title: "Actionable intelligence",
                    description: "Perception profiles, competitor gap maps, semantic coverage analysis, and machine readability audits give you a precise playbook of what to fix and where."
                  }
                ].map((item) => (
                  <div key={item.step} className="relative marketing-card rounded-xl p-6 sm:p-8 text-center group hover-elevate" data-testid={`card-step-${item.step}`}>
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#00B8D4] text-white text-sm font-bold">
                        {item.step}
                      </span>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-[#00B8D4]/10 flex items-center justify-center mx-auto mb-5 mt-2">
                      <item.icon className="h-6 w-6 text-[#00B8D4]" />
                    </div>
                    <h3 className="text-lg font-bold text-[#0a2a3a] mb-3">{item.title}</h3>
                    <p className="text-sm text-[#1a3a4a]/60 leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* Platform Stats Section */}
          <div className="bg-[#e8f4fa] border-y border-[#b8ddef]/30">
            <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12 py-16 sm:py-20">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12">
                {[
                  { value: "3", label: "LLMs interrogated daily", sublabel: "Claude, OpenAI, Gemini" },
                  { value: "3", label: "Funnel stages tracked", sublabel: "Awareness, consideration, commercial" },
                  { value: "12", label: "Readability checks per audit", sublabel: "Schema, E-E-A-T, crawlability" },
                  { value: "Daily", label: "Automated scan frequency", sublabel: "With instant change alerts" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="text-3xl sm:text-5xl font-bold text-[#00B8D4] mb-2">{stat.value}</div>
                    <div className="text-sm font-medium text-[#0a2a3a] mb-1">{stat.label}</div>
                    <div className="text-xs text-[#1a3a4a]/50">{stat.sublabel}</div>
                  </div>
                ))}
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* Use Cases Section */}
          <div className="bg-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
              <div className="text-center mb-16">
                <div className="inline-block mb-4">
                  <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">Use Cases</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0a2a3a]">
                  Built for brands that take AI visibility seriously
                </h2>
                <p className="mt-6 text-lg text-[#1a3a4a]/70 max-w-2xl mx-auto">
                  Whether you're defending your position or building one from scratch, AEOSTARS gives you the intelligence to act
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
                {[
                  {
                    icon: Eye,
                    title: "Brand visibility monitoring",
                    description: "Track whether GPT, Claude, and Gemini mention your brand when users ask industry questions. See your Share of Voice across all three models, broken down by funnel stage.",
                    audience: "Marketing teams & brand managers"
                  },
                  {
                    icon: GitCompare,
                    title: "Competitive intelligence",
                    description: "Identify every prompt where a competitor is recommended but you're not. Map their positioning strengths and find the exact content gaps keeping you out of AI responses.",
                    audience: "Strategy & competitive intel teams"
                  },
                  {
                    icon: Search,
                    title: "Content gap analysis",
                    description: "Discover the topics and semantic clusters where your brand has weak or zero AI presence. Get specific content recommendations to fill each gap and improve model recall.",
                    audience: "Content strategists & SEO teams"
                  },
                  {
                    icon: ShieldAlert,
                    title: "Reputation & sentiment tracking",
                    description: "Monitor how AI models describe your brand: positioning clarity, authority depth, proof strength, and differentiation. Get daily alerts when sentiment shifts or new narratives emerge.",
                    audience: "Communications & PR teams"
                  }
                ].map((useCase) => (
                  <div key={useCase.title} className="marketing-card rounded-xl p-6 sm:p-8 hover-elevate group" data-testid={`usecase-${useCase.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-start gap-5">
                      <div className="w-12 h-12 rounded-lg bg-[#00B8D4]/10 flex items-center justify-center shrink-0">
                        <useCase.icon className="h-6 w-6 text-[#00B8D4]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#0a2a3a] mb-2">{useCase.title}</h3>
                        <p className="text-sm text-[#1a3a4a]/60 leading-relaxed mb-3">{useCase.description}</p>
                        <span className="text-xs text-[#00B8D4] font-medium">{useCase.audience}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* Latest News Section */}
          {latestArticles.length > 0 && (
            <div className="relative overflow-hidden bg-[#D6EEF8] border-y border-[#b8ddef]/30">
              <div className="absolute inset-0">
                <img src={blueBgPattern} alt="" className="w-full h-full object-cover" aria-hidden="true" />
              </div>
              <div className="relative mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-12">
                  <div>
                    <div className="inline-block mb-4">
                      <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">Latest Insights</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0a2a3a]">
                      AI Visibility News & Research
                    </h2>
                    <p className="mt-4 text-lg text-[#1a3a4a]/70">
                      Stay ahead with the latest research and strategies in AI brand representation
                    </p>
                  </div>
                  <Button variant="outline" asChild className="hidden sm:flex shrink-0 border-[#00B8D4]/30 text-[#00B8D4]">
                    <a href="/news">
                      View All
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>

                <div className="relative">
                  <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
                    {latestArticles.map((article) => (
                      <a
                        key={article.id}
                        href={`/news/${article.slug}`}
                        className="flex-none w-[85vw] max-w-[280px] sm:max-w-none sm:w-[340px] marketing-card rounded-xl overflow-hidden hover-elevate active-elevate-2 snap-start"
                        data-testid={`latest-article-${article.id}`}
                      >
                        <div className="h-48 bg-gradient-to-br from-[#D6EEF8] to-[#e8f4fa] flex items-center justify-center border-b border-[#b8ddef]/20">
                          <Newspaper className="h-12 w-12 text-[#00B8D4]/30" />
                        </div>
                        <div className="p-6">
                          <div className="flex items-center gap-4 text-xs text-[#1a3a4a]/50 mb-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {article.publishedAt 
                                  ? format(new Date(article.publishedAt), "MMM d, yyyy") 
                                  : "Draft"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{estimateReadTime(article.content)} min read</span>
                            </div>
                          </div>
                          
                          <h3 className="text-xl font-bold text-[#0a2a3a] mb-3 line-clamp-2">
                            {article.title}
                          </h3>
                          
                          <p className="text-[#1a3a4a]/70 text-sm line-clamp-3 leading-relaxed">
                            {article.metaDescription}
                          </p>

                          <div className="mt-4 pt-4 border-t border-[#b8ddef]/20">
                            <span className="text-[#00B8D4] text-sm font-medium">
                              Read article &rarr;
                            </span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                <div className="mt-8 sm:hidden text-center">
                  <Button variant="outline" asChild className="w-full border-[#00B8D4]/30 text-[#00B8D4]">
                    <a href="/news">
                      View All Articles
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>

                <SectionCTA />
              </div>
            </div>
          )}

          {/* Customer Reviews Section */}
          <ReviewsSection 
            reviews={reviews}
            title="What Our Customers Say"
            subtitle="Customer Reviews"
          />

          <div className="relative overflow-hidden bg-[#D6EEF8]">
            <div className="absolute inset-0">
              <img src={bobbleBannerBg} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative">
              <SectionCTA />
            </div>
          </div>

          {/* "As the World Changes" Section */}
          <div className="relative border-y border-[#b8ddef]/30 overflow-hidden bg-white">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,184,212,0.06) 0%, rgba(0,120,180,0.03) 50%, transparent 75%)",
              }}
            />
            <div className="relative max-w-4xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-40 text-center z-10">
              <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-[#0a2a3a] mb-8 sm:mb-10">
                As the world changes
              </h2>
              <div className="flex justify-center mb-10">
                <Logo size="lg" className="h-14 sm:h-16 w-auto max-w-[280px] sm:max-w-none" />
              </div>
              <h3 className="text-2xl sm:text-4xl font-bold text-[#0a2a3a] mb-8 sm:mb-12">
                keeps you visible
              </h3>
              <Button 
                size="lg" 
                className="bg-[#00B8D4] border-[#00B8D4] text-white text-base sm:text-lg"
                asChild
                data-testid="button-world-changes-cta"
              >
                <a href="/signup" className="flex items-center gap-2">
                  Start {TRIAL_DAY_ADJECTIVE_TITLE} Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <a 
                href="/api/auth/linkedin"
                className="mt-4 text-[#1a3a4a]/50 text-sm inline-flex items-center gap-1.5"
                data-testid="link-world-changes-linkedin"
              >
                <SiLinkedin className="h-3.5 w-3.5" />
                or sign up with LinkedIn
              </a>
              <p className="mt-2 text-sm text-[#1a3a4a]/50">{TRIAL_DAYS_PHRASE} free. No credit card required.</p>
            </div>
          </div>

          {/* FAQ Section */}
          <div id="faq" className="relative overflow-hidden bg-[#D6EEF8]">
            <div className="absolute inset-0">
              <img src={blueBgPattern} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
            <div className="relative mx-auto max-w-4xl px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-32">
              <div className="text-center mb-16">
                <div className="inline-block mb-4">
                  <span className="text-sm uppercase tracking-wider text-[#00B8D4] font-semibold">FAQ</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0a2a3a]">
                  Common questions about AI brand visibility
                </h2>
                <p className="mt-6 text-lg text-[#1a3a4a]/70">
                  Everything you need to understand how AI models represent your brand and how AEOSTARS helps you measure it
                </p>
              </div>

              <div className="bg-white rounded-xl overflow-hidden border border-[#b8ddef]/30 shadow-sm">
                <Accordion type="single" collapsible className="divide-y divide-[#b8ddef]/20">
                  {faqData.map((faq, index) => (
                    <AccordionItem 
                      key={index} 
                      value={`item-${index}`}
                      className="border-0"
                      data-testid={`faq-item-${index}`}
                    >
                      <AccordionTrigger 
                        className="px-4 sm:px-8 py-6 text-left text-[#0a2a3a] hover:text-[#00B8D4] hover:no-underline [&[data-state=open]]:text-[#00B8D4]"
                        data-testid={`faq-question-${index}`}
                      >
                        <span className="text-base sm:text-lg font-semibold pr-4">{faq.question}</span>
                      </AccordionTrigger>
                      <AccordionContent 
                        className="px-4 sm:px-8 pb-6 text-[#1a3a4a]/70 leading-relaxed"
                        data-testid={`faq-answer-${index}`}
                      >
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              <SectionCTA />
            </div>
          </div>

          {/* Bottom CTA Section */}
          <div className="relative overflow-hidden bg-white border-t border-[#b8ddef]/30">
            <div className="absolute inset-0">
              <img src={blueBgImg} alt="" className="w-full h-full object-cover opacity-30" aria-hidden="true" />
            </div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-24 lg:py-32 text-center">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a2a3a] mb-8">
                Find out what AI really says about your brand
              </h2>
              <p className="text-lg text-[#1a3a4a]/70 mb-12 max-w-2xl mx-auto">
                Connect your domain, add your competitors, and get a full baseline AI visibility report in minutes. Try it free for {TRIAL_DAYS_PHRASE}, no credit card required.
              </p>
              <Button 
                size="lg" 
                className="bg-[#00B8D4] border-[#00B8D4] text-white text-base sm:text-lg"
                asChild
                data-testid="button-bottom-cta"
              >
                <a href="/signup" className="flex items-center gap-2">
                  Start {TRIAL_DAY_ADJECTIVE_TITLE} Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <a 
                href="/api/auth/linkedin"
                className="mt-4 text-[#1a3a4a]/50 text-sm inline-flex items-center gap-1.5"
                data-testid="link-bottom-linkedin"
              >
                <SiLinkedin className="h-3.5 w-3.5" />
                or sign up with LinkedIn
              </a>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>

      {/* Schema.org structured data */}
      {aggregateRatingSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aggregateRatingSchema) }} />
      )}
      
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "AEOSTARS",
        "url": "https://aeostars.com",
        "logo": "https://aeostars.com/aeostars-logo.png",
        "description": "AI Representation & Visibility Intelligence platform. Measure, monitor, and improve how your brand appears in ChatGPT, Claude, and Gemini answers.",
        "foundingDate": "2025",
        "sameAs": [
          "https://www.linkedin.com/company/aeostars"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "email": "sales@aeostars.com",
          "contactType": "sales"
        }
      }) }} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "AEOSTARS",
        "url": "https://aeostars.com",
        "description": "AI Representation & Visibility Intelligence. Track how your brand appears in AI-generated answers.",
        "publisher": {
          "@type": "Organization",
          "name": "AEOSTARS"
        }
      }) }} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqData.map(faq => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
      }) }} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "AEOSTARS",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web",
        "description": "AI Representation & Visibility Intelligence platform for tracking and improving brand presence across ChatGPT, Claude, and Gemini",
        "offers": {
          "@type": "AggregateOffer",
          "lowPrice": "29.99",
          "highPrice": "79.99",
          "priceCurrency": "GBP",
          "availability": "https://schema.org/InStock"
        },
        "featureList": [
          "AI Visibility Monitoring across all major LLMs: Claude, OpenAI and Gemini",
          "AI Share of Voice measurement with daily automated scanning",
          "AI Perception Mirror: scored narrative profile with positioning, authority, proof, and differentiation scores",
          "Competitor AI Positioning Map: prompts where competitors appear without your brand",
          "Competitor Weakness Intelligence: exploit negative reviews and churn signals to differentiate your proposition",
          "Actions Kanban: insights automatically converted into tickets for team collaboration and issue resolution",
          "Semantic Coverage Gap Analysis: topic clusters and missing content opportunities",
          "Machine Readability Audit: schema, FAQ, author markup and structural checks",
          "Change Monitoring & Alerts: daily shift detection across all models",
          "Executive, Marketing, and Competitive Intelligence reports with PDF export"
        ]
      }) }} />
    </div>
  );
}
