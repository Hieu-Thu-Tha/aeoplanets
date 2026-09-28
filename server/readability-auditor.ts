import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromGemini } from "./services/llm-provider/gemini/usage";
import { isAiUsageCapExceededError } from "./services/ai-usage/cap";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";
import { fakeAiSleep, fakeAuditCheck, isFakeAiEnabled, maybeThrowFakeAiError } from "./services/fake-ai";

export interface AuditCheckDetail {
  name: string;
  status: "pass" | "fail" | "warning";
  whatIsThis: string;
  howItShouldWork: string;
  currentState: string;
  whatToFix: string;
  spaWarning?: string;
}

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
};

function normaliseUrl(domain: string): string {
  let base = domain.trim().replace(/\/+$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`;
  }
  return base;
}

async function safeFetch(
  url: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: FETCH_HEADERS,
      redirect: "follow",
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, finalUrl: response.url };
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  }
}

interface SpaDetectionResult {
  isSpa: boolean;
  framework: string | null;
  indicators: string[];
}

function detectSpa(html: string): SpaDetectionResult {
  const indicators: string[] = [];
  let framework: string | null = null;
  const lower = html.toLowerCase();

  if (/<div\s+id=["']root["']\s*>/i.test(html) || /<div\s+id=["']__next["']\s*>/i.test(html)) {
    indicators.push("React/Next.js root container detected");
    framework = framework || "React/Next.js";
  }
  if (/<div\s+id=["']app["']\s*>/i.test(html) || /<div\s+id=["']__nuxt["']\s*>/i.test(html)) {
    indicators.push("Vue/Nuxt root container detected");
    framework = framework || "Vue/Nuxt";
  }
  if (/ng-version=/i.test(html) || /ng-app=/i.test(html) || /<app-root/i.test(html)) {
    indicators.push("Angular application detected");
    framework = framework || "Angular";
  }
  if (/__sveltekit/i.test(html) || /svelte/i.test(html)) {
    indicators.push("Svelte/SvelteKit detected");
    framework = framework || "Svelte";
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (bodyContent.length < 200 && html.length > 5000) {
      indicators.push("Very little text content in HTML body (content likely rendered by JavaScript)");
    }
  }

  if (/<noscript[^>]*>[\s\S]*?(enable|javascript|browser)[\s\S]*?<\/noscript>/i.test(html)) {
    indicators.push("Noscript tag warns about JavaScript requirement");
  }

  const scriptTags = (html.match(/<script[^>]*src=[^>]*>/gi) || []);
  const largeChunks = scriptTags.filter((s) => /chunk|bundle|vendor|main\.[a-f0-9]/i.test(s));
  if (largeChunks.length >= 3) {
    indicators.push(`${largeChunks.length} bundled JS chunks detected (typical of SPA build)`);
  }

  if (lower.includes("window.__initial_state__") || lower.includes("window.__nuxt__") || lower.includes("self.__next")) {
    indicators.push("Client-side state hydration detected");
    framework = framework || "SSR framework";
  }

  return {
    isSpa: indicators.length >= 2,
    framework,
    indicators,
  };
}

interface CrawlFilesResult {
  robotsTxt: { found: boolean; content: string };
  aiTxt: { found: boolean; content: string };
  llmsTxt: { found: boolean; content: string };
  aiBlockRules: string[];
}

async function fetchCrawlFiles(baseUrl: string): Promise<CrawlFilesResult> {
  const origin = new URL(baseUrl).origin;

  const [robotsRes, aiRes, llmsRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, 8000),
    safeFetch(`${origin}/ai.txt`, 8000),
    safeFetch(`${origin}/llms.txt`, 8000),
  ]);

  const isTextFile = (res: typeof robotsRes) =>
    res.ok && res.text.length > 5 && !res.text.trimStart().startsWith("<!") && !res.text.trimStart().startsWith("<html");

  const robotsTxt = {
    found: isTextFile(robotsRes),
    content: isTextFile(robotsRes) ? robotsRes.text.slice(0, 3000) : "",
  };
  const aiTxt = {
    found: isTextFile(aiRes),
    content: isTextFile(aiRes) ? aiRes.text.slice(0, 2000) : "",
  };
  const llmsTxt = {
    found: isTextFile(llmsRes),
    content: isTextFile(llmsRes) ? llmsRes.text.slice(0, 2000) : "",
  };

  const aiBlockRules: string[] = [];
  if (robotsTxt.found) {
    const lines = robotsTxt.content.split("\n");
    const aiAgents = ["gptbot", "chatgpt-user", "claudebot", "anthropic-ai", "google-extended", "cohere-ai", "bytespider", "ccbot", "omgili", "diffbot", "perplexitybot"];
    let currentAgent = "";
    for (const line of lines) {
      const agentMatch = line.match(/^user-agent:\s*(.+)/i);
      if (agentMatch) {
        currentAgent = agentMatch[1].trim().toLowerCase();
      }
      const disallowMatch = line.match(/^disallow:\s*(.*)/i);
      if (disallowMatch && aiAgents.includes(currentAgent)) {
        aiBlockRules.push(`${currentAgent}: Disallow ${disallowMatch[1] || "/"}`);
      }
    }
    if (lines.some((l) => /^user-agent:\s*\*/i.test(l))) {
      let inWildcard = false;
      for (const line of lines) {
        if (/^user-agent:\s*\*/i.test(line)) inWildcard = true;
        else if (/^user-agent:/i.test(line)) inWildcard = false;
        const disMatch = line.match(/^disallow:\s+\/\s*$/i);
        if (inWildcard && disMatch) {
          aiBlockRules.push("Wildcard (*): Disallow / (blocks all crawlers)");
        }
      }
    }
  }

  return { robotsTxt, aiTxt, llmsTxt, aiBlockRules };
}

interface StrategyMetrics {
  performanceScore: number | null;
  overallCategory: string;
  lab: {
    fcp: { value: number | null; display: string | null; score: number | null };
    lcp: { value: number | null; display: string | null; score: number | null };
    cls: { value: number | null; display: string | null; score: number | null };
    tbt: { value: number | null; display: string | null; score: number | null };
    si: { value: number | null; display: string | null; score: number | null };
    tti: { value: number | null; display: string | null; score: number | null };
    serverResponseTime: { value: number | null; display: string | null; score: number | null };
  };
  field: {
    lcp: { percentile: number | null; category: string; distributions: { min: number; max?: number; proportion: number }[] } | null;
    fcp: { percentile: number | null; category: string; distributions: { min: number; max?: number; proportion: number }[] } | null;
    cls: { percentile: number | null; category: string; distributions: { min: number; max?: number; proportion: number }[] } | null;
    ttfb: { percentile: number | null; category: string; distributions: { min: number; max?: number; proportion: number }[] } | null;
    inp: { percentile: number | null; category: string; distributions: { min: number; max?: number; proportion: number }[] } | null;
  };
  mobileFriendly: boolean | null;
}

interface PageSpeedResult {
  success: boolean;
  mobile: StrategyMetrics | null;
  desktop: StrategyMetrics | null;
  error?: string;
}

async function fetchStrategyData(url: string, strategy: "mobile" | "desktop"): Promise<StrategyMetrics | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=PERFORMANCE${apiKey ? `&key=${apiKey}` : ""}`;

  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) return null;

  const data = await response.json();
  const lighthouseScore = data?.lighthouseResult?.categories?.performance?.score;
  const audits = data?.lighthouseResult?.audits;
  const crux = data?.loadingExperience?.metrics;

  function extractAudit(key: string) {
    const a = audits?.[key];
    if (!a) return { value: null, display: null, score: null };
    return { value: a.numericValue ?? null, display: a.displayValue || null, score: a.score ?? null };
  }

  function extractCrux(key: string) {
    const m = crux?.[key];
    if (!m) return null;
    return {
      percentile: m.percentile ?? null,
      category: (m.category || "unknown").toLowerCase(),
      distributions: m.distributions || [],
    };
  }

  const viewport = audits?.["viewport"]?.score;

  return {
    performanceScore: lighthouseScore != null ? Math.round(lighthouseScore * 100) : null,
    overallCategory: (data?.loadingExperience?.overall_category || "unknown").toLowerCase(),
    lab: {
      fcp: extractAudit("first-contentful-paint"),
      lcp: extractAudit("largest-contentful-paint"),
      cls: extractAudit("cumulative-layout-shift"),
      tbt: extractAudit("total-blocking-time"),
      si: extractAudit("speed-index"),
      tti: extractAudit("interactive"),
      serverResponseTime: extractAudit("server-response-time"),
    },
    field: {
      lcp: extractCrux("LARGEST_CONTENTFUL_PAINT_MS"),
      fcp: extractCrux("FIRST_CONTENTFUL_PAINT_MS"),
      cls: extractCrux("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
      ttfb: extractCrux("EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
      inp: extractCrux("INTERACTION_TO_NEXT_PAINT"),
    },
    mobileFriendly: viewport != null ? viewport >= 0.9 : null,
  };
}

async function fetchPageSpeedData(url: string): Promise<PageSpeedResult> {
  try {
    const [mobile, desktop] = await Promise.all([
      fetchStrategyData(url, "mobile").catch(() => null),
      fetchStrategyData(url, "desktop").catch(() => null),
    ]);

    if (!mobile && !desktop) {
      return { success: false, mobile: null, desktop: null, error: "Both mobile and desktop API calls failed" };
    }

    return { success: true, mobile, desktop };
  } catch (err: any) {
    return { success: false, mobile: null, desktop: null, error: err?.message || "Failed to fetch PageSpeed data" };
  }
}

function cleanJsonString(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

type CheckDefinition = {
  id: string;
  name: string;
  type: "ai_only" | "hybrid";
  prompt: (domain: string, brandName: string, context?: string) => string;
};

/**
 * Deterministic seed derived from domain so the same site always gets
 * the same random seed for Gemini generateContent calls. Combined with
 * temperature=0 this makes LLM outputs stable across runs on the same domain.
 */
function domainSeed(domain: string): number {
  const salt = "aeostars-readability-audit-v1";
  const str = domain.toLowerCase().trim() + ":" + salt;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 2147483647;
}

const AUDIT_CHECKS: CheckDefinition[] = [
  {
    id: "organisation_schema",
    name: "Organisation Schema",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if the site uses JSON-LD structured data with "@type": "Organization" or "@type": "LocalBusiness" schema markup. Look at the homepage source and any schema validators or cached versions. Report what you find about their Organization schema implementation.`,
  },
  {
    id: "faq_schema",
    name: "FAQ Schema",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if any pages on this site implement FAQPage schema markup (JSON-LD "@type": "FAQPage"). Look for FAQ pages, help centres, or support pages. Report what you find about their FAQ structured data.`,
  },
  {
    id: "article_schema",
    name: "Article / Content Schema",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if their blog posts, articles, or content pages use Article, BlogPosting, or NewsArticle schema markup. Look at their blog or resources section. Report what you find about their content structured data.`,
  },
  {
    id: "author_markup",
    name: "Author & E-E-A-T Signals",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check for author attribution and E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals. Look for: Person schema, author bios on content, rel="author" links, author pages, credentials displayed. Report what you find.`,
  },
  {
    id: "internal_linking",
    name: "Internal Linking Structure",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Assess the internal linking structure. Look at the homepage navigation, footer links, content interlinking, breadcrumbs, and overall site architecture. Is there good topical clustering and deep linking between related pages? Report what you find about their internal linking.`,
  },
  {
    id: "canonical_tags",
    name: "Canonical Tags & URL Structure",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if the site properly implements canonical tags (link rel="canonical") and has clean URL structures. Look for any duplicate content issues, proper URL hierarchy, and canonical implementation. Report your findings.`,
  },
  {
    id: "comparison_pages",
    name: "Comparison & Alternative Pages",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if they have any comparison pages, "alternatives to" pages, "vs" pages, or competitive positioning content. These pages are critical for AI models when users ask for product comparisons. Look for pages like "${brandName} vs [competitor]" or "best alternatives to [product]". Report what you find.`,
  },
  {
    id: "meta_descriptions",
    name: "Meta Descriptions & Page Summaries",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check if key pages have well-written meta descriptions that clearly summarise what the page is about. Look at the homepage, main product/service pages, and blog posts. Are the meta descriptions descriptive, unique per page, and within the 150-160 character best practice? Report your findings.`,
  },
  {
    id: "site_speed",
    name: "Site Performance & Core Web Vitals",
    type: "hybrid",
    prompt: (_domain, brandName, context) => {
      if (context && !context.includes("API call failed")) {
        return `Analyse the following REAL PageSpeed Insights data that was fetched directly from Google's API for this website. This is factual, measured data — do not contradict it or use different numbers.

${context}

Provide a thorough assessment covering:
1. Overall performance scores for both mobile and desktop, and how they compare
2. Core Web Vitals status: LCP, CLS, and INP (if available) — are they passing Google's thresholds? Note: FCP is a useful diagnostic metric but is NOT one of the three Core Web Vitals
3. Other performance metrics: FCP, Total Blocking Time, Speed Index — how fast does content appear and become interactive?
4. Server response time — is the backend fast enough?
5. If field data (real user metrics from Chrome UX Report) is available, compare lab vs field results and note any discrepancies
6. The distribution of real user experiences (what percentage of users get good vs poor experiences)
7. Specific, actionable fixes for any metric that is rated NEEDS IMPROVEMENT or POOR
8. If there's a significant gap between mobile and desktop scores, explain likely causes

Reference the specific numbers provided throughout your analysis. If any metrics were unavailable, note that some data could not be measured but do NOT mark it as failing just because data is missing.`;
      }
      return `USE_SEARCH_FALLBACK:Search Google for the real Core Web Vitals and performance data for the website ${_domain} (brand: ${brandName}).

Specifically search for:
- "${_domain}" site speed OR Core Web Vitals OR PageSpeed
- "${_domain}" performance score
- Search "web.dev/measure" or "pagespeed.web.dev" results for ${_domain}

Look for real performance metrics: LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift), INP (Interaction to Next Paint) or FID (First Input Delay), TTFB (Time to First Byte), and overall performance score.

Report ONLY metrics you actually find in search results. If you cannot find real performance data, state that clearly and assess based on general indicators like page load experience.`;
    },
  },
  {
    id: "content_freshness",
    name: "Content Freshness & Update Frequency",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check how recently the site's content has been updated. Look at their blog posting frequency, last updated dates on key pages, news section, and any timestamps visible. Is the content fresh and regularly maintained? Report your findings about content freshness.`,
  },
  {
    id: "social_proof",
    name: "Social Proof & Trust Signals",
    type: "ai_only",
    prompt: (domain, brandName) =>
      `Research the website ${domain} (brand: ${brandName}). Check for social proof and trust signals that AI models use to assess authority: customer testimonials with real names, case studies, review aggregation schema, trust badges, industry awards, certifications, partner logos, and G2/Capterra/Trustpilot presence. Report what you find.`,
  },
  {
    id: "ai_crawlability",
    name: "AI Bot Crawlability",
    type: "hybrid",
    prompt: (_domain, _brandName, context) =>
      `Analyse the following REAL data about this website's crawler configuration. This data was fetched directly from the live website — these are facts, not guesses. Do not contradict what is shown here.

${context}

Based on this actual crawl data, assess whether AI bots (GPTBot, ClaudeBot, Google-Extended, etc.) can access this site. Reference the specific files found and any block rules detected.`,
  },
];

interface AuditBatchGroup {
  batchName: string;
  checkIds: string[];
}

const AUDIT_BATCHES: AuditBatchGroup[] = [
  { batchName: "Structured Data & Schema", checkIds: ["organisation_schema", "faq_schema", "article_schema", "author_markup"] },
  { batchName: "Technical SEO", checkIds: ["internal_linking", "canonical_tags", "meta_descriptions"] },
  { batchName: "Content & Authority", checkIds: ["comparison_pages", "content_freshness", "social_proof"] },
];

async function assessBatch(
  client: InstanceType<typeof GoogleGenAI>,
  checks: CheckDefinition[],
  domain: string,
  brandName: string,
  spaInfo?: SpaDetectionResult,
  usage?: AiUsageContext
): Promise<AuditCheckDetail[]> {
  const checkDescriptions = checks.map((check) => {
    const researchPrompt = check.prompt(domain, brandName);
    return `### ${check.name} (id: ${check.id})\n${researchPrompt}`;
  }).join("\n\n");

  const spaNote = spaInfo?.isSpa
    ? `\n\nIMPORTANT: This site appears to be a Single Page Application${spaInfo.framework ? ` (${spaInfo.framework})` : ""}. SPAs render content via JavaScript, so HTML source inspection may show minimal content. Consider this when assessing.`
    : "";

  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("readability batch audit");
    return checks.map((check) => fakeAuditCheck(check.name, check.id, domain));
  }

  const fullPrompt = `You are auditing the website ${domain} (brand: ${brandName}) for AI machine readability. You MUST use Google Search to find current, live information about this website.

Research the site and assess ALL of the following checks in a SINGLE analysis:

${checkDescriptions}${spaNote}

Respond with a JSON object where each key is the check id and the value is an assessment object. Use EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
${checks.map(c => `  "${c.id}": {
    "status": "pass" or "fail" or "warning",
    "whatIsThis": "1-2 sentence explanation of what this check measures and why it matters for AI visibility.",
    "howItShouldWork": "2-3 sentence description of best practice.",
    "currentState": "2-3 sentence factual assessment of what was found.",
    "whatToFix": "2-4 sentence specific actionable steps to improve."
  }`).join(",\n")}
}

Status rules: "pass" = clearly implements well, "warning" = partially implemented, "fail" = missing or very poor.
Be honest and specific. Base assessments on actual findings from Google Search.`;

  const response = await executeAiCall(
    usage,
    "gemini",
    "gemini-2.5-flash",
    () => client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        temperature: 0,
        seed: domainSeed(domain),
        tools: [{ googleSearch: {} }],
      },
    }),
    usageFromGemini,
    { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
  );

  const text = response.text?.trim() || "";
  if (!text) throw new Error("Empty batch response from AI");

  const cleaned = cleanJsonString(text);
  const parsed = JSON.parse(cleaned);

  const results: AuditCheckDetail[] = [];
  for (const check of checks) {
    const data = parsed[check.id];
    if (data) {
      const validStatuses = ["pass", "fail", "warning"];
      const result: AuditCheckDetail = {
        name: check.name,
        status: validStatuses.includes(data.status) ? data.status : "warning",
        whatIsThis: data.whatIsThis || "No description available.",
        howItShouldWork: data.howItShouldWork || "No best practice description available.",
        currentState: data.currentState || "Could not determine current state.",
        whatToFix: data.whatToFix || "No specific recommendations available.",
      };
      if (spaInfo?.isSpa) {
        result.spaWarning = `This site is a Single Page Application${spaInfo.framework ? ` built with ${spaInfo.framework}` : ""}. Some checks that rely on HTML source inspection may not fully reflect the rendered page content.`;
      }
      results.push(result);
    }
  }

  return results;
}

async function assessBatchWithRetry(
  client: InstanceType<typeof GoogleGenAI>,
  checks: CheckDefinition[],
  domain: string,
  brandName: string,
  spaInfo?: SpaDetectionResult,
  maxRetries = 2,
  usage?: AiUsageContext
): Promise<AuditCheckDetail[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await assessBatch(client, checks, domain, brandName, spaInfo, usage);
    } catch (err: any) {
      if (isAiUsageCapExceededError(err)) throw err;
      lastError = err;
      console.warn(`Batch audit attempt ${attempt + 1} failed for [${checks.map(c => c.id).join(", ")}]: ${err?.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }

  console.error(`Batch audit failed after ${maxRetries + 1} attempts for [${checks.map(c => c.id).join(", ")}]`);
  throw lastError || new Error("Batch audit failed after max retries");
}

async function assessCheck(
  client: InstanceType<typeof GoogleGenAI>,
  check: CheckDefinition,
  domain: string,
  brandName: string,
  hybridContext?: string,
  spaInfo?: SpaDetectionResult,
  usage?: AiUsageContext
): Promise<AuditCheckDetail> {
  const researchPrompt = check.prompt(domain, brandName, hybridContext);

  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError(`readability check ${check.id}`);
    return fakeAuditCheck(check.name, check.id, domain);
  }

  const useSearchFallback = researchPrompt.startsWith("USE_SEARCH_FALLBACK:");
  const cleanedPrompt = useSearchFallback ? researchPrompt.replace("USE_SEARCH_FALLBACK:", "") : researchPrompt;
  const needsSearch = check.type === "ai_only" || useSearchFallback;

  const spaNote =
    spaInfo?.isSpa && check.type === "ai_only"
      ? `\n\nIMPORTANT: This site appears to be a Single Page Application${spaInfo.framework ? ` (${spaInfo.framework})` : ""}. SPAs render content via JavaScript, so HTML source inspection may show minimal content. Consider this when assessing — the site may have these features implemented client-side even if they are not visible in the raw HTML. Note this SPA context in your currentState assessment if relevant.`
      : "";

  const fullPrompt = `${cleanedPrompt}${spaNote}

${needsSearch ? "You MUST use Google Search to find current, live information about this website. Do NOT rely on training data alone.\n\n" : ""}Based on your analysis, respond with a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "status": "pass" or "fail" or "warning",
  "whatIsThis": "A 1-2 sentence explanation of what this check measures and why it matters for AI visibility. Written for a non-technical marketing person.",
  "howItShouldWork": "A 2-3 sentence description of what best practice looks like for this check. Be specific about what should be implemented.",
  "currentState": "A 2-3 sentence factual assessment of what was found right now. Be specific — mention what was checked and what was found or not found.",
  "whatToFix": "Specific, actionable steps they need to take to improve. If they pass, explain what they're doing well and any minor optimisations. 2-4 sentences."
}

Rules for status:
- "pass" = clearly implements this well
- "warning" = partially implemented or could be improved
- "fail" = missing or very poorly implemented
- Be honest and specific. Base your assessment on actual findings.`;

  const response = await executeAiCall(
    usage,
    "gemini",
    "gemini-2.5-flash",
    () => client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        temperature: 0,
        seed: domainSeed(domain),
        tools: needsSearch ? [{ googleSearch: {} }] : undefined,
      },
    }),
    usageFromGemini,
    {
      expectedMeters: needsSearch ? [GEMINI_GROUNDED_PROMPT_METER] : [],
    },
  );

  const text = response.text?.trim() || "";
  if (!text) {
    throw new Error("Empty response from AI");
  }

  const cleaned = cleanJsonString(text);
  const parsed = JSON.parse(cleaned);

  const validStatuses = ["pass", "fail", "warning"];
  const status = validStatuses.includes(parsed.status) ? parsed.status : "warning";

  const result: AuditCheckDetail = {
    name: check.name,
    status,
    whatIsThis: parsed.whatIsThis || "No description available.",
    howItShouldWork: parsed.howItShouldWork || "No best practice description available.",
    currentState: parsed.currentState || "Could not determine current state.",
    whatToFix: parsed.whatToFix || "No specific recommendations available.",
  };

  if (spaInfo?.isSpa && check.type === "ai_only") {
    result.spaWarning = `This site is a Single Page Application${spaInfo.framework ? ` built with ${spaInfo.framework}` : ""}. Some checks that rely on HTML source inspection may not fully reflect the rendered page content. Server-side rendering (SSR) or pre-rendering is recommended for optimal AI readability.`;
  }

  return result;
}

async function assessCheckWithRetry(
  client: InstanceType<typeof GoogleGenAI>,
  check: CheckDefinition,
  domain: string,
  brandName: string,
  hybridContext?: string,
  spaInfo?: SpaDetectionResult,
  maxRetries = 2,
  usage?: AiUsageContext
): Promise<AuditCheckDetail> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await assessCheck(client, check, domain, brandName, hybridContext, spaInfo, usage);
    } catch (err: any) {
      if (isAiUsageCapExceededError(err)) throw err;
      lastError = err;
      console.warn(`Audit check "${check.name}" attempt ${attempt + 1} failed: ${err?.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }

  console.error(`Audit check "${check.name}" failed after ${maxRetries + 1} attempts:`, lastError?.message);
  return {
    name: check.name,
    status: "warning",
    whatIsThis: "This check measures an important AI readability signal.",
    howItShouldWork: "Best practices could not be retrieved at this time.",
    currentState: `Assessment failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}. This does not mean your site is failing — the check could not be completed.`,
    whatToFix: "Try running the audit again. If this error persists, it may be a temporary issue with the AI service.",
  };
}

function buildCrawlContext(crawlFiles: CrawlFilesResult, domain: string): string {
  const parts: string[] = [`Website: ${domain}`, ""];

  parts.push("=== robots.txt ===");
  if (crawlFiles.robotsTxt.found) {
    parts.push("Status: FOUND");
    parts.push("Content:");
    parts.push(crawlFiles.robotsTxt.content);
  } else {
    parts.push("Status: NOT FOUND (no robots.txt file exists at this URL)");
  }
  parts.push("");

  parts.push("=== ai.txt ===");
  if (crawlFiles.aiTxt.found) {
    parts.push("Status: FOUND");
    parts.push("Content:");
    parts.push(crawlFiles.aiTxt.content);
  } else {
    parts.push("Status: NOT FOUND");
  }
  parts.push("");

  parts.push("=== llms.txt ===");
  if (crawlFiles.llmsTxt.found) {
    parts.push("Status: FOUND");
    parts.push("Content:");
    parts.push(crawlFiles.llmsTxt.content);
  } else {
    parts.push("Status: NOT FOUND");
  }
  parts.push("");

  if (crawlFiles.aiBlockRules.length > 0) {
    parts.push("=== AI-Specific Block Rules Detected ===");
    for (const rule of crawlFiles.aiBlockRules) {
      parts.push(`- ${rule}`);
    }
  } else {
    parts.push("=== AI-Specific Block Rules ===");
    parts.push("No AI-specific crawler blocks detected in robots.txt");
  }

  return parts.join("\n");
}

function ratingLabel(score: number | null): string {
  if (score == null) return "N/A";
  if (score >= 0.9) return "GOOD";
  if (score >= 0.5) return "NEEDS IMPROVEMENT";
  return "POOR";
}

function buildStrategyContext(metrics: StrategyMetrics, strategy: string): string {
  const parts: string[] = [];

  parts.push(`=== ${strategy.toUpperCase()} Results ===`);
  parts.push("");

  if (metrics.performanceScore != null) {
    parts.push(`Overall Performance Score: ${metrics.performanceScore}/100`);
    if (metrics.performanceScore >= 90) parts.push("Rating: GOOD");
    else if (metrics.performanceScore >= 50) parts.push("Rating: NEEDS IMPROVEMENT");
    else parts.push("Rating: POOR");
  } else {
    parts.push("Overall Performance Score: Not available");
  }

  if (metrics.overallCategory && metrics.overallCategory !== "unknown") {
    parts.push(`Chrome UX Report Overall Category: ${metrics.overallCategory.toUpperCase()}`);
  }
  parts.push("");

  parts.push("--- Lab Data (Lighthouse Simulation) ---");
  const lab = metrics.lab;

  if (lab.lcp.value != null) {
    parts.push(`LCP (Largest Contentful Paint): ${lab.lcp.display || (lab.lcp.value / 1000).toFixed(1) + "s"} — ${ratingLabel(lab.lcp.score)} (good < 2.5s, poor > 4.0s)`);
  } else {
    parts.push("LCP: Not measured");
  }

  if (lab.fcp.value != null) {
    parts.push(`FCP (First Contentful Paint): ${lab.fcp.display || (lab.fcp.value / 1000).toFixed(1) + "s"} — ${ratingLabel(lab.fcp.score)} (good < 1.8s, poor > 3.0s)`);
  } else {
    parts.push("FCP: Not measured");
  }

  if (lab.cls.value != null) {
    parts.push(`CLS (Cumulative Layout Shift): ${lab.cls.display || lab.cls.value.toFixed(3)} — ${ratingLabel(lab.cls.score)} (good < 0.1, poor > 0.25)`);
  } else {
    parts.push("CLS: Not measured");
  }

  if (lab.tbt.value != null) {
    parts.push(`TBT (Total Blocking Time): ${lab.tbt.display || lab.tbt.value + "ms"} — ${ratingLabel(lab.tbt.score)} (good < 200ms, poor > 600ms)`);
  } else {
    parts.push("TBT: Not measured");
  }

  if (lab.si.value != null) {
    parts.push(`Speed Index: ${lab.si.display || (lab.si.value / 1000).toFixed(1) + "s"} — ${ratingLabel(lab.si.score)} (good < 3.4s, poor > 5.8s)`);
  }

  if (lab.tti.value != null) {
    parts.push(`TTI (Time to Interactive): ${lab.tti.display || (lab.tti.value / 1000).toFixed(1) + "s"} — ${ratingLabel(lab.tti.score)} (good < 3.8s, poor > 7.3s)`);
  }

  if (lab.serverResponseTime.value != null) {
    parts.push(`Server Response Time (TTFB): ${lab.serverResponseTime.display || lab.serverResponseTime.value + "ms"} — ${ratingLabel(lab.serverResponseTime.score)} (good < 600ms)`);
  }

  parts.push("");

  const field = metrics.field;
  const hasField = field.lcp || field.fcp || field.cls || field.ttfb || field.inp;
  if (hasField) {
    parts.push("--- Field Data (Real User Metrics from Chrome UX Report) ---");

    function formatFieldMetric(name: string, crux: typeof field.lcp, unit: string, thresholds: string) {
      if (!crux) return;
      let p75: string;
      if (crux.percentile != null) {
        if (unit === "score") {
          p75 = (crux.percentile / 100).toFixed(2);
        } else if (unit === "ms_raw") {
          p75 = `${crux.percentile}ms`;
        } else {
          p75 = `${(crux.percentile / 1000).toFixed(1)}s`;
        }
      } else {
        p75 = "N/A";
      }
      const good = Math.round((crux.distributions[0]?.proportion || 0) * 100);
      const mid = Math.round((crux.distributions[1]?.proportion || 0) * 100);
      const poor = Math.round((crux.distributions[2]?.proportion || 0) * 100);
      parts.push(`${name}: p75 = ${p75} — ${crux.category.toUpperCase()} ${thresholds}`);
      parts.push(`  Distribution: ${good}% good, ${mid}% needs improvement, ${poor}% poor`);
    }

    formatFieldMetric("LCP (Core Web Vital)", field.lcp, "ms", "(good < 2.5s, poor > 4.0s)");
    formatFieldMetric("INP (Core Web Vital)", field.inp, "ms_raw", "(good < 200ms, poor > 500ms)");
    formatFieldMetric("CLS (Core Web Vital)", field.cls, "score", "(good < 0.1, poor > 0.25)");
    formatFieldMetric("FCP", field.fcp, "ms", "(good < 1.8s, poor > 3.0s)");
    formatFieldMetric("TTFB", field.ttfb, "ms", "(good < 800ms, poor > 1800ms)");
    parts.push("");
  }

  if (metrics.mobileFriendly != null) {
    parts.push(`Mobile-Friendly Viewport: ${metrics.mobileFriendly ? "Yes" : "No"}`);
    parts.push("");
  }

  return parts.join("\n");
}

function buildPageSpeedContext(psi: PageSpeedResult, domain: string): string {
  const parts: string[] = [`Website: ${domain}`, ""];

  if (!psi.success || (!psi.mobile && !psi.desktop)) {
    parts.push(`PageSpeed Insights API call failed: ${psi.error || "Unknown error"}`);
    parts.push("API call failed. Some or all performance data is unavailable.");
    return parts.join("\n");
  }

  parts.push("Data source: Google PageSpeed Insights API (live measurement)");
  parts.push("");

  if (psi.mobile) {
    parts.push(buildStrategyContext(psi.mobile, "Mobile"));
  }

  if (psi.desktop) {
    parts.push(buildStrategyContext(psi.desktop, "Desktop"));
  }

  if (psi.mobile && psi.desktop && psi.mobile.performanceScore != null && psi.desktop.performanceScore != null) {
    parts.push("=== Mobile vs Desktop Comparison ===");
    parts.push(`Mobile Score: ${psi.mobile.performanceScore}/100 | Desktop Score: ${psi.desktop.performanceScore}/100`);
    const diff = psi.desktop.performanceScore - psi.mobile.performanceScore;
    if (diff > 15) {
      parts.push(`Note: Desktop score is ${diff} points higher than mobile. This suggests mobile-specific performance issues that should be investigated.`);
    } else if (diff < -15) {
      parts.push(`Note: Mobile score is ${Math.abs(diff)} points higher than desktop, which is unusual and may indicate desktop-specific issues.`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

export const readabilityAuditor = {
  async audit(brandId: number, source: AiUsageContext["source"] = "manual"): Promise<{ success: boolean; error?: string }> {
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error(`Brand ${brandId} not found`);

    const domain = brand.domain;
    const baseUrl = normaliseUrl(domain);
    const brandName = brand.category || domain.replace(/^www\./, "").split(".")[0];

    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const usage: AiUsageContext = { userId: brand.userId, brandId, feature: "readability_audit", source };

    console.log(`Starting AI audit for brand ${brandId} (${domain})...`);

    const [crawlFiles, pageSpeedData, homepageRes] = await Promise.all([
      fetchCrawlFiles(baseUrl),
      fetchPageSpeedData(baseUrl),
      safeFetch(baseUrl, 15000),
    ]);

    const spaInfo = homepageRes.ok ? detectSpa(homepageRes.text) : { isSpa: false, framework: null, indicators: [] };

    if (spaInfo.isSpa) {
      console.log(`SPA detected for ${domain}: ${spaInfo.framework || "unknown framework"} — ${spaInfo.indicators.join("; ")}`);
    }

    const hybridContexts: Record<string, string> = {
      ai_crawlability: buildCrawlContext(crawlFiles, domain),
      site_speed: buildPageSpeedContext(pageSpeedData, domain),
    };

    const allChecks: AuditCheckDetail[] = [];

    const batchPromises = AUDIT_BATCHES.map((batch) => {
      const checks = batch.checkIds
        .map((id) => AUDIT_CHECKS.find((c) => c.id === id))
        .filter((c): c is CheckDefinition => !!c);
      return assessBatchWithRetry(client, checks, domain, brandName, spaInfo, 2, usage);
    });

    const hybridChecks = AUDIT_CHECKS.filter((c) => c.type === "hybrid");
    const hybridPromises = hybridChecks.map((check) =>
      assessCheckWithRetry(client, check, domain, brandName, hybridContexts[check.id], spaInfo, 2, usage)
    );

    const [batchResults, hybridResults] = await Promise.all([
      Promise.allSettled(batchPromises),
      Promise.allSettled(hybridPromises),
    ]);

    for (const result of [...batchResults, ...hybridResults]) {
      if (result.status === "rejected" && isAiUsageCapExceededError(result.reason)) {
        throw result.reason;
      }
    }

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        allChecks.push(...result.value);
      }
    }
    for (const result of hybridResults) {
      if (result.status === "fulfilled") {
        allChecks.push(result.value);
      }
    }

    if (spaInfo.isSpa) {
      for (const check of allChecks) {
        if (!check.spaWarning && check.name !== "Site Performance & Core Web Vitals" && check.name !== "AI Bot Crawlability") {
          continue;
        }
      }
    }

    const passCount = allChecks.filter((c) => c.status === "pass").length;
    const warningCount = allChecks.filter((c) => c.status === "warning").length;
    const total = allChecks.length;
    const score = total > 0 ? Math.round(((passCount + warningCount * 0.5) / total) * 100) : 0;

    await storage.upsertReadabilityAudit({
      brandId,
      score,
      checks: allChecks,
    });

    console.log(`Readability audit complete for brand ${brandId}: score=${score}, checks=${allChecks.length}, spa=${spaInfo.isSpa}`);
    return { success: true };
  },
};
