import { useState } from "react";
import {
  PageShell,
  PageHeading,
  SectionHeader,
} from "@/components/ui/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import blueBgPattern from "@assets/blue-background_1776335377885.webp";
import {
  Copy,
  Download,
  Code,
  FileText,
  Bot,
  Search,
  ChevronDown,
  ChevronRight,
  Globe,
  FileCode2,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Info,
  Lightbulb,
  BookOpen,
} from "lucide-react";

interface SampleItem {
  id: string;
  title: string;
  whyItMatters: string;
  whatItDoes: string;
  howToImplement: string[];
  commonMistakes?: string[];
  proTip?: string;
  language: string;
  fileName: string;
  content: string;
}

interface SampleCategory {
  id: string;
  label: string;
  icon: typeof Code;
  intro: string;
  items: SampleItem[];
}

const SAMPLES: SampleCategory[] = [
  {
    id: "schemas",
    label: "Structured Data Schemas",
    icon: Code,
    intro:
      "Structured data is the language AI models use to understand your brand. When ChatGPT, Claude, or Gemini encounter your website, they look for JSON-LD schema markup to quickly parse who you are, what you offer, and why you matter. Without it, AI models have to guess — and they often guess wrong or skip you entirely. Each schema below serves a different purpose in building your AI visibility profile.",
    items: [
      {
        id: "org-schema",
        title: "Organisation Schema",
        whyItMatters:
          "This is the single most important piece of structured data for AI visibility. Organisation Schema acts as your brand's identity card for AI models. When an LLM crawls your site, this tells it your company name, what you do, where you're based, and how to contact you. Without it, AI models may confuse you with similarly-named companies, misattribute your services, or simply not know enough about you to recommend you.",
        whatItDoes:
          'Defines your company as a formal entity that AI models can reference. It includes your name, URL, logo, founding date, social profiles, contact details, physical address, team size, service area, and — critically — a "knowsAbout" field that tells AI models your areas of expertise. This last field is particularly powerful because it directly influences whether AI models associate you with specific topics.',
        howToImplement: [
          "Copy the template below and replace all placeholder values with your actual company information",
          'Wrap it in a <script type="application/ld+json"> tag',
          "Place it inside the <head> section of your homepage (index.html, or your CMS layout template)",
          'If you use a CMS like WordPress, use a plugin like Yoast SEO or Rank Math which can generate this for you — but check the output includes "knowsAbout"',
          "Validate your markup at https://validator.schema.org/ or Google's Rich Results Test",
        ],
        commonMistakes: [
          'Forgetting the "knowsAbout" field — this is what links your brand to topic areas in AI models',
          "Using a generic description instead of a specific, keyword-rich one",
          "Not including social media links — AI models use these to verify your brand identity across platforms",
          "Using HTTP instead of HTTPS in URLs",
        ],
        proTip:
          'Fill "knowsAbout" with the exact phrases your customers would search for. Use specific terms relevant to your industry — not vague descriptions. For example, if you sell accounting software, use "cloud accounting", "invoice automation", "financial reporting" rather than just "business software".',
        language: "json",
        fileName: "organisation-schema.json",
        content: `{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Company Name",
  "url": "https://www.yourcompany.com",
  "logo": "https://www.yourcompany.com/logo.png",
  "description": "Brief description of what your company does — this is what AI models read.",
  "foundingDate": "2020",
  "sameAs": [
    "https://www.linkedin.com/company/yourcompany",
    "https://twitter.com/yourcompany",
    "https://www.facebook.com/yourcompany"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+44-123-456-7890",
    "contactType": "customer service",
    "email": "hello@yourcompany.com",
    "availableLanguage": ["English"]
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Business Street",
    "addressLocality": "London",
    "postalCode": "EC1A 1BB",
    "addressCountry": "GB"
  },
  "numberOfEmployees": {
    "@type": "QuantitativeValue",
    "minValue": 10,
    "maxValue": 50
  },
  "areaServed": "GB",
  "knowsAbout": [
    "Your Primary Topic",
    "Your Secondary Topic",
    "Your Industry Specialisation"
  ]
}`,
      },
      {
        id: "faq-schema",
        title: "FAQ Schema",
        whyItMatters:
          'FAQ Schema is one of the most effective ways to get your brand cited directly by AI models. When someone asks ChatGPT a question like "How much does [product] cost?" or "What\'s the best tool for [category]?", the AI looks for structured FAQ content it can quote. If your FAQ answers are marked up with this schema, AI models are significantly more likely to pull your exact words into their response — giving you a direct, attributed mention.',
        whatItDoes:
          "Wraps your frequently asked questions in a format that AI models and search engines can parse instantly. Each question-answer pair becomes a discrete, quotable unit of information. Google also uses this for rich results (expandable FAQ snippets in search), giving you double the visibility benefit.",
        howToImplement: [
          "Write 5-10 questions that your target customers actually ask — check your sales team's most common enquiries, support tickets, or the questions AEOSTARS identifies in your dashboard",
          "Write clear, factual answers that include your brand name, specific features, and differentiators",
          'Wrap the JSON-LD in a <script type="application/ld+json"> tag',
          "Place it on the page where the FAQ content actually appears — your FAQ page, relevant product pages, or service pages",
          "The visible page content should match what's in the schema — Google penalises mismatches",
        ],
        commonMistakes: [
          "Writing questions nobody actually asks — use real customer language, not marketing speak",
          "Putting FAQ schema on pages that don't visibly display the questions and answers",
          'Writing vague answers — "We offer great service" tells AI nothing useful. Be specific with features, numbers, and differentiators',
          "Only including 1-2 questions — aim for at least 5 to give AI models enough context",
        ],
        proTip:
          'Include a comparison question like "How does [your brand] compare to [competitor]?" with an honest, factual answer. AI models frequently surface these when users ask for comparisons, and having your own structured answer means you control the narrative.',
        language: "json",
        fileName: "faq-schema.json",
        content: `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What does your company do?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We provide [your service/product] that helps [target audience] achieve [key benefit]. Our platform includes [feature 1], [feature 2], and [feature 3]."
      }
    },
    {
      "@type": "Question",
      "name": "How much does your product cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our pricing starts at [price] per month for the Starter plan, with Growth at [price] and Enterprise plans available for larger teams. All plans include [key feature]."
      }
    },
    {
      "@type": "Question",
      "name": "How does your product compare to [competitor]?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Unlike [competitor], we specialise in [your differentiator]. Our key advantages include [advantage 1], [advantage 2], and [advantage 3]. We serve [specific audience] with a focus on [unique value]."
      }
    },
    {
      "@type": "Question",
      "name": "What industries do you serve?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We primarily serve [industry 1], [industry 2], and [industry 3]. Our solution is particularly effective for [specific use case] in these sectors."
      }
    },
    {
      "@type": "Question",
      "name": "Do you offer a free trial?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, we offer a [duration] free trial with full access to [features included]. No credit card required. You can sign up at [URL]."
      }
    }
  ]
}`,
      },
      {
        id: "article-schema",
        title: "Article Schema",
        whyItMatters:
          "AI models weigh content authority heavily when deciding what to cite. Article Schema tells them who wrote a piece, their credentials, when it was published, and when it was last updated. This is the structured data equivalent of E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) — the framework Google and AI models use to decide whether your content is worth referencing. Without it, your blog posts and thought leadership content are just anonymous text to an AI.",
        whatItDoes:
          "Marks up individual articles and blog posts with author details (name, job title, LinkedIn profile), publication and modification dates, publisher information, keywords, and word count. This gives AI models the confidence to cite your content as an authoritative source, attribute it to a named expert, and prefer it over undated or anonymous alternatives.",
        howToImplement: [
          "Add this schema to every blog post and article page on your site",
          "Fill in the author's real name, job title, and LinkedIn profile — AI models cross-reference these",
          "Always include both datePublished and dateModified — AI models favour recently updated content",
          "Set the mainEntityOfPage URL to the canonical URL of the article",
          "Use relevant, specific keywords in the keywords array",
          "If you use WordPress, plugins like Yoast SEO can auto-generate this — but check the output includes author sameAs links",
        ],
        commonMistakes: [
          'Using "Admin" or "Staff" as the author — always use a real person\'s name with verifiable credentials',
          "Not updating dateModified when you refresh content — stale dates make AI models skip your article",
          "Missing the author's LinkedIn or social profiles — these are how AI models verify the author is real",
          "Setting wordCount to 0 or omitting it — longer, comprehensive articles rank higher in AI responses",
        ],
        proTip:
          "Create author profile pages on your site (e.g., /team/jane-smith) and link to them in the author URL field. AI models follow these links to build a picture of the author's expertise, which strengthens the authority signal of every article they write.",
        language: "json",
        fileName: "article-schema.json",
        content: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title — Keep Under 110 Characters",
  "description": "A concise summary of the article in 150-160 characters for AI and search engines.",
  "image": "https://www.yourcompany.com/images/article-hero.jpg",
  "datePublished": "2025-01-15T09:00:00+00:00",
  "dateModified": "2025-02-20T14:30:00+00:00",
  "author": {
    "@type": "Person",
    "name": "Author Name",
    "url": "https://www.yourcompany.com/team/author-name",
    "jobTitle": "Head of [Department]",
    "worksFor": {
      "@type": "Organization",
      "name": "Your Company Name"
    },
    "sameAs": [
      "https://www.linkedin.com/in/author-name",
      "https://twitter.com/author-name"
    ]
  },
  "publisher": {
    "@type": "Organization",
    "name": "Your Company Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.yourcompany.com/logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.yourcompany.com/blog/your-article-slug"
  },
  "keywords": ["keyword 1", "keyword 2", "keyword 3"],
  "wordCount": 2500,
  "articleSection": "Your Category"
}`,
      },
    ],
  },
  {
    id: "seo",
    label: "SEO Essentials",
    icon: Search,
    intro:
      "Traditional SEO and AI visibility are deeply connected. The same HTML elements that help Google understand your pages — canonical tags, meta descriptions, Open Graph tags — are also read by AI crawlers when they index your content. Getting these right ensures that when an AI model encounters your site, it picks up the correct page version, understands your value proposition, and has clean, well-structured information to work with.",
    items: [
      {
        id: "canonical-tags",
        title: "Canonical Tags",
        whyItMatters:
          'If AI models find multiple versions of the same page (with different URL parameters, www vs non-www, HTTP vs HTTPS), they get confused about which one to reference. This dilutes your visibility because the AI may cite a random variant — or skip you entirely because it can\'t determine the authoritative source. Canonical tags solve this by pointing every variant to the single "official" version of each page.',
        whatItDoes:
          'A canonical tag is a small HTML element placed in the <head> of every page that tells crawlers and AI models: "This is the primary URL for this content." Even if someone reaches your page via a tracking link (e.g., ?utm_source=email), the canonical tag ensures AI models index and cite the clean URL.',
        howToImplement: [
          'Add a <link rel="canonical" href="..."> tag inside the <head> section of every page on your site',
          "Always use the full, absolute URL including https:// and your preferred domain format (www or non-www)",
          "For paginated content (e.g., blog page 2, page 3), point the canonical back to page 1",
          "For product pages with colour or size variants in the URL, point all variants to the main product URL",
          "In WordPress, Yoast SEO handles this automatically — but always verify the output",
          "In Next.js or React apps, set this in your <Head> component or via a meta tag plugin",
        ],
        commonMistakes: [
          "Using relative URLs (/page) instead of absolute URLs (https://www.yourcompany.com/page)",
          "Having multiple canonical tags on the same page — only one is allowed",
          "Pointing the canonical to a URL that returns a 404 or redirect",
          "Inconsistent domain format — mixing www and non-www, or HTTP and HTTPS",
        ],
        proTip:
          'Run a quick check: visit your homepage, a product page, and a blog post, then view the page source and search for "canonical". If any page is missing it, or if the URLs are inconsistent, fix those first — they\'re the pages AI models are most likely to encounter.',
        language: "html",
        fileName: "canonical-tag-examples.html",
        content: `<!-- BASIC CANONICAL TAG -->
<!-- Place in <head> of every page -->
<link rel="canonical" href="https://www.yourcompany.com/your-page" />

<!-- EXAMPLE: Homepage -->
<head>
  <title>Your Company — Brief Tagline</title>
  <link rel="canonical" href="https://www.yourcompany.com/" />
</head>

<!-- EXAMPLE: Product page with query parameters -->
<!-- Even if accessed via ?ref=campaign or ?utm_source=google, -->
<!-- the canonical should point to the clean URL -->
<head>
  <title>Product Name — Your Company</title>
  <link rel="canonical" href="https://www.yourcompany.com/products/product-name" />
</head>

<!-- EXAMPLE: Blog post -->
<head>
  <title>How to Do X — Your Company Blog</title>
  <link rel="canonical" href="https://www.yourcompany.com/blog/how-to-do-x" />
</head>

<!-- EXAMPLE: Paginated content -->
<!-- Page 1 is the canonical; pages 2+ point back to page 1 -->
<head>
  <title>All Articles — Page 3 — Your Company</title>
  <link rel="canonical" href="https://www.yourcompany.com/blog" />
  <link rel="prev" href="https://www.yourcompany.com/blog?page=2" />
  <link rel="next" href="https://www.yourcompany.com/blog?page=4" />
</head>

<!-- COMMON MISTAKES TO AVOID: -->
<!-- 1. Don't use relative URLs -->
<!--    BAD:  <link rel="canonical" href="/products/item" /> -->
<!--    GOOD: <link rel="canonical" href="https://www.yourcompany.com/products/item" /> -->

<!-- 2. Don't have multiple canonical tags on one page -->

<!-- 3. Don't point canonical to a redirected or 404 URL -->

<!-- 4. Always use the HTTPS www (or non-www) version consistently -->`,
      },
      {
        id: "meta-descriptions",
        title: "Meta Descriptions & Page Titles",
        whyItMatters:
          "Meta descriptions and page titles are often the first (and sometimes only) text an AI model reads about your page before deciding whether to dig deeper. A well-written meta description acts as a summary pitch — if it clearly communicates what the page offers, AI models are more likely to index the content and reference it in responses. Vague or missing descriptions mean AI models have to guess what your page is about, and they'll usually pick a competitor with better metadata instead.",
        whatItDoes:
          'Page titles appear in browser tabs, search results, and AI model indexes. Meta descriptions provide a 150-160 character summary of the page\'s content. Together, they form the "label" that AI models attach to each page of your site. Open Graph tags extend this to social media platforms, ensuring your content looks professional when shared on LinkedIn, Twitter, or Facebook.',
        howToImplement: [
          'Every page on your site needs a unique <title> tag and <meta name="description"> — no exceptions',
          "Keep titles under 60 characters and include your primary keyword plus brand name",
          "Keep descriptions between 150-160 characters — enough to be informative but not truncated",
          "Include specific details: features, prices, audience, use cases — not generic marketing language",
          "Add Open Graph (og:) tags for social sharing — these also feed into AI model context",
          'For comparison pages ("Brand A vs Brand B"), include both brand names in the title — AI models love structured comparisons',
        ],
        commonMistakes: [
          "Using the same title and description across multiple pages — each must be unique",
          "Writing descriptions that are just a list of keywords instead of readable sentences",
          "Forgetting to include your brand name in the title",
          "Making descriptions too short (under 100 characters) or too long (over 160 characters)",
        ],
        proTip:
          'Create comparison pages ("[Your Brand] vs [Competitor]") with unique meta descriptions that include both brand names, the year, and your key differentiator. These pages are extremely effective for AI visibility because they directly match the comparison questions users ask AI models.',
        language: "html",
        fileName: "meta-descriptions.html",
        content: `<!-- HOMEPAGE -->
<head>
  <title>Your Company — [Primary Keyword] for [Target Audience]</title>
  <meta name="description" content="[Company Name] helps [target audience] 
    achieve [key benefit] with [product/service]. Trusted by [social proof]. 
    Start your free trial today." />
  <meta name="robots" content="index, follow" />
</head>
<!-- Keep titles under 60 characters, descriptions 150-160 characters -->

<!-- PRODUCT / SERVICE PAGE -->
<head>
  <title>[Product Name] — [Key Benefit] | Your Company</title>
  <meta name="description" content="[Product Name] provides [specific feature] 
    that helps [audience] [solve problem]. Includes [feature 1], [feature 2]. 
    Plans from [price]/month." />
</head>

<!-- COMPARISON PAGE (great for AI visibility) -->
<head>
  <title>[Your Brand] vs [Competitor] — Honest Comparison [Year]</title>
  <meta name="description" content="Compare [Your Brand] and [Competitor] 
    side by side. See pricing, features, pros and cons. Find out which 
    [category] tool is right for your [audience]." />
</head>

<!-- BLOG POST -->
<head>
  <title>[Article Title] — [Category] Guide | Your Company</title>
  <meta name="description" content="Learn [what the article teaches] in this 
    comprehensive guide. Covers [topic 1], [topic 2], and [topic 3]. Written 
    by [author credential]." />
</head>

<!-- FAQ PAGE -->
<head>
  <title>[Category] FAQ — Common Questions Answered | Your Company</title>
  <meta name="description" content="Get answers to the most common questions 
    about [topic]. Learn about [question topic 1], [question topic 2], and 
    [question topic 3]. Updated [month year]." />
</head>

<!-- OPEN GRAPH TAGS (for social sharing and AI context) -->
<meta property="og:title" content="Your Page Title" />
<meta property="og:description" content="Same or similar to meta description" />
<meta property="og:image" content="https://www.yourcompany.com/og-image.jpg" />
<meta property="og:url" content="https://www.yourcompany.com/page" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Your Company" />`,
      },
    ],
  },
  {
    id: "ai-files",
    label: "AI & Crawler Files",
    icon: Bot,
    intro:
      "Beyond structured data and SEO tags, there are three configuration files that sit at the root of your website and directly control how AI bots interact with your content. These files are the gatekeepers — they determine whether AI models can access your site at all, what they're allowed to do with your content, and what they should know about your brand before they even start reading your pages. If you only implement three things from this entire resource library, make it these.",
    items: [
      {
        id: "robots-txt",
        title: "robots.txt",
        whyItMatters:
          "robots.txt is the first file any crawler — search engine or AI — looks for when visiting your site. If it's missing, misconfigured, or actively blocking AI crawlers, you're invisible. Many websites accidentally block AI bots like GPTBot, ClaudeBot, or Google-Extended without realising it, because their robots.txt was written before AI crawlers existed. This is the most common reason brands score zero on AI visibility despite having great content.",
        whatItDoes:
          'This plain text file sits at your domain root (e.g., yourcompany.com/robots.txt) and tells every crawler what it\'s allowed to access. Each "User-agent" section targets a specific bot, and the "Allow" and "Disallow" directives control which parts of your site they can see. A well-configured robots.txt explicitly welcomes all major AI crawlers while blocking internal or private areas.',
        howToImplement: [
          "Create a plain text file called robots.txt (no extension, no capitalisation)",
          "Upload it to the root of your domain so it's accessible at https://www.yourcompany.com/robots.txt",
          "Include explicit Allow directives for each major AI bot: GPTBot (OpenAI), ClaudeBot (Anthropic), Google-Extended (Gemini), PerplexityBot, and others",
          "Block only genuinely private directories like /admin/, /api/, /staging/",
          "Include your sitemap URL at the bottom — this helps AI bots find all your content efficiently",
          "Test by visiting your robots.txt URL in a browser — it should display as plain text",
        ],
        commonMistakes: [
          'Using a blanket "Disallow: /" that blocks all bots from your entire site',
          "Not including AI-specific bot names — older robots.txt files only mention Googlebot and Bingbot",
          "Blocking /blog/ or /resources/ directories that contain your most valuable content for AI",
          "Forgetting to include the sitemap URL",
          "Having the file at the wrong path (e.g., /pages/robots.txt instead of /robots.txt)",
        ],
        proTip:
          "Check your current robots.txt right now by visiting yourdomain.com/robots.txt. If you see \"Disallow: /\" under a wildcard User-agent, you're blocking everything. If you don't see GPTBot or ClaudeBot mentioned at all, AI bots are relying on your wildcard rules — which might be too restrictive.",
        language: "text",
        fileName: "robots.txt",
        content: `# robots.txt — AI & Search Crawler Configuration
# Place at: https://www.yourcompany.com/robots.txt

# Allow all standard search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Allow AI model crawlers (important for AI visibility)
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Bytespider
Allow: /

# Block areas you don't want indexed
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /private/
Disallow: /staging/
Disallow: /tmp/
Disallow: /*.json$
Disallow: /internal/

# Sitemap location
Sitemap: https://www.yourcompany.com/sitemap.xml`,
      },
      {
        id: "ai-txt",
        title: "ai.txt",
        whyItMatters:
          "ai.txt is an emerging standard that goes beyond robots.txt to specifically address how AI models may use your content. While robots.txt controls access (can the bot visit?), ai.txt controls usage (can the AI quote you, summarise you, or train on your data?). Adopting it early signals to AI platforms that you're an informed, AI-ready publisher — and explicitly granting citation permissions makes it more likely that AI models will attribute answers to your brand by name.",
        whatItDoes:
          "This file declares your organisation's AI usage policy in a machine-readable format. You can grant or deny permissions for specific AI activities like search grounding (using your content to answer queries), summarisation, citation, and training. You can set these permissions globally or per AI platform. It also includes metadata about your organisation that AI systems can reference.",
        howToImplement: [
          "Create a plain text file called ai.txt",
          "Upload it to your domain root: https://www.yourcompany.com/ai.txt",
          "Set permissions for AI-Search-Grounding, AI-Summarization, and AI-Citation — these are the ones that affect visibility",
          "Include your organisation name, description, industry, and contact email",
          "Set a preferred citation format so AI models know how to attribute your content",
          "Review and update this file quarterly as the specification evolves",
        ],
        commonMistakes: [
          "Blocking AI-Search-Grounding — this prevents AI models from using your content to answer user queries, which is the entire point of AI visibility",
          "Not including a Preferred-Citation-Format — without it, AI models use generic attribution or none at all",
          "Forgetting to include your organisation description — this is extra context AI models can use",
        ],
        proTip:
          'The Preferred-Citation-Format field is surprisingly powerful. Setting it to something like "[Title] by [Your Brand] (yourdomain.com)" means that when an AI model does cite you, it uses your brand name and domain — free, attributed visibility every time.',
        language: "text",
        fileName: "ai.txt",
        content: `# ai.txt — AI Usage Policy
# Place at: https://www.yourcompany.com/ai.txt
# Specification: https://site-for-ai.org/

# General AI permissions
User-Agent: *
Allow: AI-Search-Grounding
Allow: AI-Summarization
Allow: AI-Citation

# Specific permissions for major AI platforms
User-Agent: GPTBot
Allow: AI-Search-Grounding
Allow: AI-Summarization
Allow: AI-Citation

User-Agent: Google-Extended
Allow: AI-Search-Grounding
Allow: AI-Summarization
Allow: AI-Citation

User-Agent: anthropic-ai
Allow: AI-Search-Grounding
Allow: AI-Summarization
Allow: AI-Citation

# Organisation details for AI context
Organization: Your Company Name
Contact: hello@yourcompany.com
Description: Brief description of your company for AI models to reference.
Industry: Your Industry
URL: https://www.yourcompany.com

# Content usage preferences
Preferred-Citation-Format: "[Title] by [Company Name] (yourcompany.com)"
Data-Freshness: Content is updated regularly; check dateModified in schema.`,
      },
      {
        id: "llms-txt",
        title: "llms.txt",
        whyItMatters:
          "llms.txt is your brand's elevator pitch written specifically for AI models. Unlike robots.txt (which controls access) or ai.txt (which controls permissions), llms.txt is pure content — a structured markdown summary of who you are, what you offer, what makes you different, and where to find your key pages. Think of it as your company's Wikipedia entry, but optimised for machine reading. AI models that encounter this file get an instant, comprehensive understanding of your brand without having to crawl and interpret dozens of pages.",
        whatItDoes:
          "Provides a single, markdown-formatted document at your domain root that LLMs can quickly parse to understand your entire business. It includes your company overview, products and services, differentiators, industries served, key facts, important page links, and contact information. Because it's structured with headers and bullet points, AI models can extract specific facts efficiently.",
        howToImplement: [
          "Create a markdown-formatted text file called llms.txt",
          "Upload it to your domain root: https://www.yourcompany.com/llms.txt",
          "Start with a one-line summary of your company under the # heading",
          "Fill in each section with specific, factual information — not marketing fluff",
          "Include links to your most important pages (homepage, product, pricing, about, blog, FAQ)",
          "List your genuine differentiators — what you do that competitors don't",
          "Update this file whenever you launch a new product, enter a new market, or reach a significant milestone",
        ],
        commonMistakes: [
          "Writing marketing copy instead of factual statements — AI models prefer specifics over superlatives",
          "Not listing competitors or comparison points — this is a missed opportunity to position yourself",
          "Forgetting to include pricing information or a link to your pricing page",
          "Not updating it when your product or positioning changes — stale data means stale AI responses",
        ],
        proTip:
          'In the "What Makes Us Different" section, frame each differentiator as a direct comparison: "Unlike [category norm], we [your approach]." This gives AI models ready-made language to use when someone asks how you compare to alternatives.',
        language: "markdown",
        fileName: "llms.txt",
        content: `# Your Company Name

> Brief one-line description of what your company does.

## About

[Company Name] is a [type of company] that provides [core product/service] 
for [target audience]. Founded in [year], we help [customers] achieve 
[key outcome] through [unique approach].

## Key Products & Services

- **[Product 1]**: [One-line description of what it does]
- **[Product 2]**: [One-line description of what it does]
- **[Product 3]**: [One-line description of what it does]

## What Makes Us Different

- [Differentiator 1 — what you do that competitors don't]
- [Differentiator 2 — your unique approach or technology]
- [Differentiator 3 — your specific expertise or market position]

## Industries We Serve

- [Industry 1]
- [Industry 2]
- [Industry 3]

## Key Facts

- **Founded**: [Year]
- **Headquarters**: [Location]
- **Team Size**: [Number] employees
- **Customers**: [Number]+ companies trust us
- **Website**: https://www.yourcompany.com

## Important Pages

- [Homepage](https://www.yourcompany.com/)
- [Product Overview](https://www.yourcompany.com/product)
- [Pricing](https://www.yourcompany.com/pricing)
- [About Us](https://www.yourcompany.com/about)
- [Blog](https://www.yourcompany.com/blog)
- [Contact](https://www.yourcompany.com/contact)
- [FAQ](https://www.yourcompany.com/faq)

## Contact

- **Email**: hello@yourcompany.com
- **Phone**: +44 123 456 7890
- **LinkedIn**: https://linkedin.com/company/yourcompany
- **Twitter**: https://twitter.com/yourcompany`,
      },
    ],
  },
];

function SampleCard({
  item,
  isPublic,
}: {
  item: SampleItem;
  isPublic?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(item.content);
    toast({
      title: "Copied to clipboard",
      description: `${item.title} content copied.`,
    });
  };

  const handleDownload = () => {
    const blob = new Blob([item.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const langLabel: Record<string, string> = {
    json: "JSON-LD",
    html: "HTML",
    text: "Plain Text",
    markdown: "Markdown",
  };

  const cardClasses = isPublic
    ? "border border-[#b8ddef]/30 bg-white rounded-md shadow-sm"
    : "";

  return (
    <Card className={cardClasses} data-testid={`card-sample-${item.id}`}>
      <CardContent className="p-0">
        <button
          className="w-full flex items-start gap-4 p-5 text-left hover-elevate rounded-t-md"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${item.id}`}
        >
          <div
            className={`mt-0.5 ${isPublic ? "text-[#1a3a4a]/40" : "text-muted-foreground"}`}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`text-sm font-semibold ${isPublic ? "text-[#0a2a3a]" : "text-foreground"}`}
              >
                {item.title}
              </h3>
              <Badge variant="secondary">
                {langLabel[item.language] || item.language}
              </Badge>
            </div>
            <p
              className={`text-sm mt-2 leading-relaxed ${isPublic ? "text-[#1a3a4a]/70" : "text-muted-foreground"}`}
            >
              {item.whyItMatters}
            </p>
          </div>
        </button>

        {expanded && (
          <div
            className={`border-t ${isPublic ? "border-[#b8ddef]/30" : "border-border"}`}
          >
            <div
              className={`px-5 py-4 ${isPublic ? "bg-[#e8f4fa]/50" : "bg-muted/30"}`}
            >
              <div className="flex items-start gap-2.5 mb-4">
                <Info
                  className={`h-4 w-4 mt-0.5 shrink-0 ${isPublic ? "text-[#00B8D4]" : "text-primary"}`}
                />
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${isPublic ? "text-[#1a3a4a]/50" : "text-muted-foreground"}`}
                  >
                    What it does
                  </p>
                  <p
                    className={`text-sm leading-relaxed ${isPublic ? "text-[#1a3a4a]/80" : "text-foreground/80"}`}
                  >
                    {item.whatItDoes}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`px-5 py-4 border-t ${isPublic ? "border-[#b8ddef]/30" : "border-border"}`}
            >
              <div className="flex items-start gap-2.5">
                <BookOpen
                  className={`h-4 w-4 mt-0.5 shrink-0 ${isPublic ? "text-[#00B8D4]" : "text-primary"}`}
                />
                <div className="flex-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isPublic ? "text-[#1a3a4a]/50" : "text-muted-foreground"}`}
                  >
                    How to implement — step by step
                  </p>
                  <ol className="space-y-2">
                    {item.howToImplement.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className={`text-xs font-bold mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isPublic ? "bg-[#00B8D4]/15 text-[#00B8D4]" : "bg-primary/10 text-primary"}`}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={`text-sm leading-relaxed ${isPublic ? "text-[#1a3a4a]/80" : "text-foreground/80"}`}
                        >
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            {item.commonMistakes && item.commonMistakes.length > 0 && (
              <div
                className={`px-5 py-4 border-t ${isPublic ? "border-[#b8ddef]/30" : "border-border"}`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${isPublic ? "text-amber-500" : "text-amber-500"}`}
                  />
                  <div className="flex-1">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isPublic ? "text-[#1a3a4a]/50" : "text-muted-foreground"}`}
                    >
                      Common mistakes to avoid
                    </p>
                    <ul className="space-y-1.5">
                      {item.commonMistakes.map((mistake, i) => (
                        <li
                          key={i}
                          className={`text-sm leading-relaxed flex items-start gap-2 ${isPublic ? "text-[#1a3a4a]/70" : "text-foreground/70"}`}
                        >
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-amber-500" />
                          {mistake}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {item.proTip && (
              <div
                className={`px-5 py-4 border-t ${isPublic ? "border-[#b8ddef]/30 bg-[#00B8D4]/5" : "border-border bg-primary/5"}`}
              >
                <div className="flex items-start gap-2.5">
                  <Lightbulb
                    className={`h-4 w-4 mt-0.5 shrink-0 ${isPublic ? "text-[#00B8D4]" : "text-primary"}`}
                  />
                  <div>
                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${isPublic ? "text-[#00B8D4]/70" : "text-primary/70"}`}
                    >
                      Pro tip
                    </p>
                    <p
                      className={`text-sm leading-relaxed ${isPublic ? "text-[#1a3a4a]/80" : "text-foreground/80"}`}
                    >
                      {item.proTip}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`border-t ${isPublic ? "border-[#b8ddef]/30" : "border-border"}`}
            >
              <div
                className={`px-5 py-3 flex items-center justify-between gap-4 flex-wrap ${isPublic ? "bg-[#e8f4fa]/50" : "bg-muted/20"}`}
              >
                <div className="flex items-center gap-2">
                  <Globe
                    className={`h-3.5 w-3.5 ${isPublic ? "text-[#1a3a4a]/40" : "text-muted-foreground"}`}
                  />
                  <span
                    className={`text-xs ${isPublic ? "text-[#1a3a4a]/40" : "text-muted-foreground"}`}
                  >
                    File:{" "}
                    <span
                      className={`font-mono ${isPublic ? "text-[#1a3a4a]/60" : "text-foreground/70"}`}
                    >
                      {item.fileName}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={isPublic ? "outline" : "ghost"}
                    onClick={handleCopy}
                    data-testid={`button-copy-${item.id}`}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy code
                  </Button>
                  <Button
                    size="sm"
                    variant={isPublic ? "outline" : "ghost"}
                    onClick={handleDownload}
                    data-testid={`button-download-${item.id}`}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </Button>
                </div>
              </div>

              <pre
                className={`p-5 overflow-x-auto text-xs leading-relaxed max-h-[500px] overflow-y-auto break-words ${isPublic ? "bg-[#0a2a3a] text-white/80" : "bg-muted/20 text-foreground/90"}`}
              >
                <code className="break-words">{item.content}</code>
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResourceContent({ isPublic }: { isPublic?: boolean }) {
  return (
    <Tabs defaultValue="schemas">
      <TabsList
        className="mb-6 h-auto flex-wrap justify-start"
        data-testid="tabs-resources"
      >
        {SAMPLES.map((cat) => (
          <TabsTrigger
            key={cat.id}
            value={cat.id}
            data-testid={`tab-${cat.id}`}
          >
            <cat.icon className="h-3.5 w-3.5 mr-1.5" />
            {cat.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {SAMPLES.map((cat) => (
        <TabsContent key={cat.id} value={cat.id} className="space-y-4">
          {isPublic ? (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#0a2a3a] mb-2">
                {cat.label}
              </h2>
              <p className="text-sm leading-relaxed text-[#1a3a4a]/60">
                {cat.intro}
              </p>
            </div>
          ) : (
            <SectionHeader
              title={cat.label}
              subtitle={cat.intro}
              className="mb-4"
            />
          )}
          {cat.items.map((item) => (
            <SampleCard key={item.id} item={item} isPublic={isPublic} />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function Resources() {
  const { user } = useAuth();

  if (user) {
    return (
      <PageShell
        title="Resource Library"
        subtitle="Step-by-step guides and downloadable templates to improve your brand's AI visibility and machine readability"
      >
        <ResourceContent />
      </PageShell>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#D6EEF8] text-[#0a2a3a]">
      <div className="absolute inset-0">
        <img
          src={blueBgPattern}
          alt=""
          className="w-full h-full object-cover"
          aria-hidden="true"
        />
      </div>
      <div className="relative">
        <SiteHeader />
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12 py-12 sm:py-16">
          <div className="mb-10">
            <PageHeading
              title="Resource Library"
              headingClassName="text-3xl sm:text-4xl font-bold tracking-tight text-[#0a2a3a] mb-3"
            />
            <p className="text-lg text-[#1a3a4a]/60 max-w-3xl">
              Step-by-step implementation guides and ready-to-use templates for
              structured data, SEO essentials, and AI crawler configuration.
              Each resource explains what it does, why it matters for AI
              visibility, and exactly how to add it to your site.
            </p>
          </div>
          <ResourceContent isPublic />
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}
