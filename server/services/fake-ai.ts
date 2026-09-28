/**
 * FAKE AI MODE — zero-token stress-test harness.
 *
 * Enable with `FAKE_AI=1` (also accepts true/yes/on). When enabled, every
 * domain AI call site checks `isFakeAiEnabled()` FIRST — before constructing
 * any provider SDK client — then awaits `fakeAiSleep()` (an arbitrary async
 * wait via setTimeout, standing in for network + inference latency) and
 * returns synthetic data that already satisfies the caller's expected schema.
 *
 * Design rules:
 * - This module must NEVER import a provider SDK (or any module that does).
 *   Only `import type` is allowed, so enabling fake mode cannot require API
 *   keys and cannot perform network I/O.
 * - Fakes are deterministic per input (FNV-1a hash of the seed key), so
 *   repeated stress runs produce stable, comparable results. Only the delay
 *   uses Math.random, and only when a min/max range is configured.
 * - Fake paths bypass `executeAiCall` entirely: no tokens are spent, no
 *   `ai_usage_logs` rows are written, and quota/cap checks are not consumed.
 *   The job-admission lifecycle is unaffected (zero-call admissions finalize
 *   normally), so concurrency/load behaviour stays realistic.
 *
 * Knobs (all optional unless noted):
 * - FAKE_AI=1                       — master switch (required to enable).
 * - FAKE_AI_DELAY_MS=120            — fixed artificial latency per AI call.
 * - FAKE_AI_DELAY_MIN_MS / _MAX_MS  — when both are set, sleep a uniform
 *                                     random duration in [min, max] instead.
 * - FAKE_AI_ERROR_RATE=0            — 0..1 fraction of fake calls that throw
 *                                     a transient-style Error, exercising the
 *                                     callers' retry/fallback paths.
 */
import type { PerceptionData } from "../perception-analyzer";
import type { AuditCheckDetail } from "../readability-auditor";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isFakeAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return TRUE_VALUES.has((env.FAKE_AI ?? "").trim().toLowerCase());
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function fakeAiDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const min = readPositiveInt(env.FAKE_AI_DELAY_MIN_MS, -1);
  const max = readPositiveInt(env.FAKE_AI_DELAY_MAX_MS, -1);
  if (min >= 0 && max >= 0) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return readPositiveInt(env.FAKE_AI_DELAY_MS, 120);
}

export function fakeAiSleep(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, fakeAiDelayMs(env)));
}

export function fakeAiErrorRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseFloat(env.FAKE_AI_ERROR_RATE ?? "");
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

/** Throw a transient-looking error when chaos is configured. Call AFTER sleeping. */
export function maybeThrowFakeAiError(label: string, env: NodeJS.ProcessEnv = process.env): void {
  if (Math.random() < fakeAiErrorRate(env)) {
    throw new Error(`FAKE_AI simulated transient failure in ${label} (FAKE_AI_ERROR_RATE)`);
  }
}

/** FNV-1a hash — deterministic variant selection per seed key. */
export function hashSeedKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function variant(key: string, count: number): number {
  return hashSeedKey(key) % count;
}

function scoreIn(key: string, salt: string, lo: number, hi: number): number {
  const span = hi - lo + 1;
  return lo + (hashSeedKey(`${key}:${salt}`) % span);
}

function shortDomain(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

function brandToken(brandName: string): string {
  const token = brandName.trim() || "Acme";
  return token;
}

// ---------------------------------------------------------------------------
// Visibility scan fakes (LLMResult raw text — parsed by the real extractInfo)
// ---------------------------------------------------------------------------

/**
 * Synthetic answer prose mentioning (or deliberately omitting) the brand so
 * the real `extractInfo` still exercises appeared/position/sentiment/
 * competitorsMentioned/citationPresent parsing. Variants rotate by prompt so
 * a stress run yields a realistic mix instead of identical rows.
 */
export function fakeVisibilityText(
  prompt: string,
  brandName: string,
  competitors: string[],
  modelId: string,
): string {
  const brand = brandToken(brandName);
  const comp = competitors.length > 0 ? shortDomain(competitors[0]) : "rival-example.com";
  const compBase = comp.split(".")[0];
  const v = variant(`${modelId}:${prompt}`, 4);

  switch (v) {
    case 0:
      return (
        `${brand} is a leading choice for this use case and is widely recommended. ` +
        `It is trusted by teams for its excellent reliability and top rated support, according to https://${comp}/reviews. ` +
        `Many buyers compare ${brand} with ${compBase}, but ${brand} stands out as the best option for most teams.`
      );
    case 1:
      return (
        `For this question there are several solid options, including ${compBase} and a few others. ` +
        `${brand} is mentioned as a popular alternative with great reviews and effective onboarding. ` +
        `See https://example.com/guides/comparison for a detailed breakdown of each option.`
      );
    case 2:
      // Brand-absent variant: exercises the appeared=false path.
      return (
        `The most commonly cited options for this are ${compBase} and two other established vendors. ` +
        `Buyers report poor onboarding and limited integrations with some tools, so evaluate carefully. ` +
        `Source: https://example.com/market-overview.`
      );
    default:
      return (
        `Honest assessment: ${brand} has some concerns around pricing and weak documentation, ` +
        `with users reporting issues on larger deployments. ${compBase} is often listed alongside ${brand}. ` +
        `As stated in https://example.com/hands-on-review, support responsiveness is the main differentiator.`
      );
  }
}

// ---------------------------------------------------------------------------
// Perception analyzer fake
// ---------------------------------------------------------------------------

export function fakePerceptionResult(brandLabel: string): Partial<PerceptionData> {
  const brand = brandToken(brandLabel);
  const v = variant(`perception:${brandLabel}`, 3);
  const tier = ["smb", "mid-market", "enterprise"][v];
  return {
    summary: `FAKE_AI perception summary for ${brand}: a ${tier} vendor with steady AI-surface visibility. This synthetic profile exists only for load testing and contains no real research.`,
    strengths: [
      `${brand} has clear category association in synthetic AI answers`,
      `${brand} shows consistent naming across fake model responses`,
      `Fake reviews praise ${brand} onboarding and documentation`,
    ],
    weaknesses: [
      `Synthetic coverage of ${brand} pricing is thin`,
      `Fake competitor comparisons rarely mention ${brand} unprompted`,
    ],
    inferredAudience: `Operators evaluating ${tier} tooling (synthetic)`,
    marketTier: tier,
    confusionMarkers: [`Fake ambiguity between ${brand} the product and ${brand} the company page`],
    positioningScore: scoreIn(brandLabel, "positioning", 55, 88),
    authorityScore: scoreIn(brandLabel, "authority", 50, 85),
    proofScore: scoreIn(brandLabel, "proof", 45, 80),
    differentiationScore: scoreIn(brandLabel, "differentiation", 50, 85),
    topImprovements: [
      `Publish a synthetic comparison page for ${brand} vs alternatives`,
      `Add fake FAQ schema to the ${brand} pricing page`,
      `Seed third-party review mentions of ${brand} in load-test copy`,
      `Clarify ${brand} positioning in one sentence across key pages`,
      `Add customer proof points naming ${brand} outcomes`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Coverage analyzer fake
// ---------------------------------------------------------------------------

export interface FakeCoverageResult {
  topicClusters: Array<{ topic: string; coverage: "strong" | "weak" | "competitor-owned"; description?: string }>;
  missingTopics: string[];
  competitorCoverage: Record<string, string[]>;
  recommendations: Array<{
    topic: string;
    brand: string;
    competitors: Record<string, string>;
    gapSeverity: "high" | "medium" | "low";
    recommendedAction: string;
  }>;
}

export function fakeCoverageResult(brandLabel: string, competitorDomains: string[]): FakeCoverageResult {
  const brand = brandToken(brandLabel);
  const compA = competitorDomains[0] ? shortDomain(competitorDomains[0]) : "competitor-a.example.com";
  const compB = competitorDomains[1] ? shortDomain(competitorDomains[1]) : "competitor-b.example.com";
  return {
    topicClusters: [
      { topic: `${brand} pricing and plans`, coverage: "strong", description: `Synthetic: ${brand} pricing pages surface well in fake answers.` },
      { topic: `${brand} integrations`, coverage: "weak", description: `Synthetic: integration coverage for ${brand} is thin.` },
      { topic: `${brand} vs ${shortDomain(compA)}`, coverage: "competitor-owned", description: `Synthetic: ${compA} dominates fake comparison answers.` },
      { topic: `${brand} onboarding guide`, coverage: "weak", description: `Synthetic: onboarding content rarely cites ${brand}.` },
      { topic: `${brand} security and compliance`, coverage: "strong", description: `Synthetic: compliance pages for ${brand} rank in fake results.` },
    ],
    missingTopics: [
      `${brand} migration guide`,
      `${brand} API rate limits`,
      `${brand} enterprise case studies`,
    ],
    competitorCoverage: {
      [compA]: [`${brand} alternative comparisons`, "pricing pages"],
      [compB]: ["integration directories", "review roundups"],
    },
    recommendations: [
      {
        topic: `${brand} migration guide`,
        brand: "none",
        competitors: { [compA]: "good" },
        gapSeverity: "high",
        recommendedAction: `Publish a synthetic ${brand} migration guide targeting switchers from ${compA}.`,
      },
      {
        topic: `${brand} API rate limits`,
        brand: "partial",
        competitors: { [compB]: "partial" },
        gapSeverity: "medium",
        recommendedAction: `Document ${brand} API limits with examples (synthetic, for load testing).`,
      },
      {
        topic: `${brand} enterprise case studies`,
        brand: "none",
        competitors: { [compA]: "good", [compB]: "partial" },
        gapSeverity: "medium",
        recommendedAction: `Add two synthetic enterprise case studies naming ${brand} outcomes.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Readability auditor fakes
// ---------------------------------------------------------------------------

const AUDIT_BLURBS: Record<string, { what: string; fix: string }> = {
  default: {
    what: "Synthetic check: measures a placeholder AI-readability signal for load testing.",
    fix: "No action needed: this synthetic result only exercises the audit pipeline.",
  },
};

export function fakeAuditCheck(name: string, id: string, domain: string): AuditCheckDetail {
  const statuses = ["pass", "warning", "fail"] as const;
  const status = statuses[variant(`audit:${domain}:${id}`, 3)];
  const blurb = AUDIT_BLURBS[id] ?? AUDIT_BLURBS.default;
  return {
    name,
    status,
    whatIsThis: blurb.what,
    howItShouldWork: `Synthetic best practice for ${name} on ${domain}.`,
    currentState: `FAKE_AI audit of ${domain}: synthetic finding for ${name} (status ${status}).`,
    whatToFix: blurb.fix,
  };
}

// ---------------------------------------------------------------------------
// News generator fake
// ---------------------------------------------------------------------------

export interface FakeGeneratedArticle {
  title: string;
  slug: string;
  content: string;
  metaDescription: string;
  keywords: string[];
  questionsAnswered: Array<{ question: string; answer: string }>;
  keyTakeaways: string[];
}

export function fakeGeneratedArticle(topic: string, targetKeywords: string[]): FakeGeneratedArticle {
  const short = topic.slice(0, 60) || "AEO visibility";
  const slug = short
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100) || "fake-ai-article";
  const keywords = targetKeywords.length > 0 ? targetKeywords : ["AEO indexing", "AEO improvements"];
  return {
    title: `FAKE_AI: ${short} — synthetic load-test article`,
    slug: `fake-ai-${slug}`,
    content: [
      `## What is ${short}?`,
      ``,
      `This is a synthetic article generated by FAKE_AI mode for load testing. It references ${keywords.join(", ")} naturally throughout the text.`,
      ``,
      `## Why it matters`,
      ``,
      `- Synthetic takeaway one for ${short}.`,
      `- Synthetic takeaway two for ${short}.`,
      ``,
      `## Next steps`,
      ``,
      `Re-run the real generator with FAKE_AI disabled to produce publishable copy.`,
      ``,
    ].join("\n"),
    metaDescription: `Synthetic FAKE_AI article about ${short} for load testing.`.slice(0, 160),
    keywords: keywords.slice(0, 8),
    questionsAnswered: [0, 1, 2].map((i) => ({
      question: `Fake question ${i + 1} about ${short}?`,
      answer: `Synthetic answer ${i + 1}: ${short} is covered here with enough words to satisfy validation. `.repeat(8).slice(0, 600),
    })),
    keyTakeaways: [1, 2, 3, 4, 5].map((i) => `Synthetic takeaway ${i} for ${short}`),
  };
}

// ---------------------------------------------------------------------------
// Assessment engine fakes (volumes, competitors, weaknesses)
// ---------------------------------------------------------------------------

export interface FakeVolumeEstimate {
  index: number;
  volume_min: number;
  volume_max: number;
  volume_label: string;
}

export function fakeVolumeEstimates(seedKey: string, count: number): FakeVolumeEstimate[] {
  return Array.from({ length: count }, (_, i) => {
    const min = 20 + (hashSeedKey(`${seedKey}:${i}`) % 900);
    const max = Math.min(min * 2 + 50, 5000);
    return { index: i + 1, volume_min: min, volume_max: max, volume_label: `${min}-${max}` };
  });
}

export function fakeDiscoveredCompetitors(brandName: string): Array<{ name: string; domain?: string }> {
  const brand = brandToken(brandName);
  const v = variant(`discovered:${brandName}`, 100);
  return [
    { name: `Fake competitor Alpha for ${brand}`, domain: `alpha-${v}.example.com` },
    { name: `Fake competitor Beta for ${brand}`, domain: `beta-${v}.example.com` },
  ];
}

export function fakeCompetitorList(brandName: string): Array<{ name: string; domain: string; description: string }> {
  const brand = brandToken(brandName);
  const v = variant(`competitors:${brandName}`, 100);
  return [0, 1, 2].map((i) => ({
    name: `Fake Rival ${["Alpha", "Beta", "Gamma"][i]} ${v}`,
    domain: `fake-rival-${["alpha", "beta", "gamma"][i]}-${v}.example.com`,
    description: `Synthetic competitor ${i + 1} competing with ${brand} in load-test data.`,
  }));
}

export interface FakeWeaknessReport {
  summary: string;
  overallSentiment: "positive" | "mixed" | "negative";
  reviewScore: string | null;
  complaints: Array<{ category: string; severity: string; detail: string; frequency: string; source: string }>;
  vulnerabilities: string[];
  customerChurnReasons: string[];
}

export function fakeWeaknessReport(targetName: string): FakeWeaknessReport {
  const name = targetName.trim() || "synthetic-vendor";
  return {
    summary: `FAKE_AI weakness summary for ${name}: synthetic complaints only, for load testing. No real reviews were consulted.`,
    overallSentiment: "mixed",
    reviewScore: "4.1/5 on FakeReviewSite (synthetic)",
    complaints: [
      {
        category: "Customer Support",
        severity: "high",
        detail: `Synthetic reviewers say ${name} support is slow during load tests.`,
        frequency: "Mentioned in synthetic test data",
        source: "FakeReviewSite (synthetic)",
      },
      {
        category: "Pricing",
        severity: "medium",
        detail: `Synthetic reviewers say ${name} pricing is hard to predict.`,
        frequency: "Occasional synthetic mention",
        source: "FakeReviewSite (synthetic)",
      },
    ],
    vulnerabilities: [`Synthetic: ${name} has thin synthetic comparison content`],
    customerChurnReasons: [`Synthetic: customers leave ${name} for fake rivals in load-test data`],
  };
}

export interface FakeCompetitorAnalysis {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  whyAiPrefersThem: string;
  howToCompete: string;
}

export function fakeCompetitorAnalysis(competitorName: string, brandName: string): FakeCompetitorAnalysis {
  const comp = competitorName.trim() || "Fake Rival";
  const brand = brandToken(brandName);
  return {
    overview: `FAKE_AI briefing: ${comp} is a synthetic competitor of ${brand} invented for load testing.`,
    strengths: [
      `Synthetic: ${comp} publishes frequent comparison content`,
      `Synthetic: ${comp} has consistent naming across fake answers`,
      `Synthetic: ${comp} appears in fake review roundups`,
    ],
    weaknesses: [
      `Synthetic: ${comp} pricing pages are thin in fake data`,
      `Synthetic: ${comp} rarely earns fake citation links`,
    ],
    whyAiPrefersThem: `Synthetic: fake AI models cite ${comp} because the fixture gives it comparison pages ${brand} lacks.`,
    howToCompete: `Synthetic: ${brand} should ship the fixture comparison content and FAQ schema described in fake tickets.`,
  };
}

// ---------------------------------------------------------------------------
// Routes.ts fakes (brand research, competitor lookup, misc endpoints)
// ---------------------------------------------------------------------------

export interface FakeBrandResearch {
  brandName: string;
  category: string;
  problemStatement: string;
  targetAudience: string;
  brandPositioning: string;
  products: string;
  differentiators: string;
  brandTone: string;
  suggestedTerms: string[];
}

export function fakeBrandResearch(normalisedUrl: string): FakeBrandResearch {
  const host = shortDomain(normalisedUrl);
  const base = host.split(".")[0] || "fake-brand";
  const pretty = base.charAt(0).toUpperCase() + base.slice(1);
  return {
    brandName: `${pretty} (FAKE_AI)`,
    category: "synthetic load-test tooling",
    problemStatement: `Fake customers struggle to load-test AI visibility for ${pretty}.`,
    targetAudience: "Synthetic QA teams running load tests",
    brandPositioning: `${pretty} is the synthetic fixture brand for FAKE_AI load tests`,
    products: `${pretty} Scanner, ${pretty} Tracker`,
    differentiators: "Synthetic instant results, fake zero-token scans",
    brandTone: "professional",
    suggestedTerms: [
      `is ${pretty} good for load testing`,
      `best synthetic visibility tools`,
      `${pretty} vs fake rivals`,
      `${pretty} pricing`,
      `how does ${pretty} Scanner work`,
    ],
  };
}

export function fakeCompetitorLookup(domain: string): { name: string; domain: string; description: string } {
  const host = shortDomain(domain);
  const base = host.split(".")[0] || "fake-rival";
  const pretty = base.charAt(0).toUpperCase() + base.slice(1);
  return {
    name: `${pretty} (FAKE_AI)`,
    domain: host,
    description: `Synthetic company at ${host}, invented for FAKE_AI load testing.`,
  };
}

export function fakeConfusionExplanation(marker: string, brandName: string): string {
  const brand = brandToken(brandName);
  return (
    `FAKE_AI explanation for load testing: the confusion marker "${marker}" means synthetic AI answers ` +
    `mix up ${brand} with a similarly named fixture entity. This matters because confused models recommend ` +
    `the wrong vendor. Good looks like one canonical ${brand} description repeated across the synthetic corpus.`
  );
}

export function fakeBenchmarkSummary(brandDomain: string, competitorCount: number): string {
  const domain = shortDomain(brandDomain);
  return (
    `FAKE_AI benchmark summary for ${domain} (synthetic, for load testing). ` +
    `Across ${competitorCount} fixture competitors, ${domain} scores within the synthetic mid-range on both ` +
    `mobile and desktop PageSpeed fixtures. The largest synthetic gap is mobile performance, where fixture ` +
    `rivals render less blocking script. Priority actions: defer the synthetic bundle, compress fixture images, ` +
    `and re-run with FAKE_AI disabled for real numbers.`
  );
}

export function fakeFixSuggestion(ticketTitle: string, brandDomain: string): string {
  const domain = shortDomain(brandDomain);
  const title = ticketTitle || "synthetic ticket";
  return [
    `<h3>What Needs to Change</h3>`,
    `<p>FAKE_AI fixture for "${title}" on ${domain}: synthetic content for load testing only.</p>`,
    `<h3>Production-Ready Content</h3>`,
    `<pre><code>&lt;!-- synthetic fixture for ${domain} --&gt;</code></pre>`,
    `<h3>Where to Place This</h3>`,
    `<p>Nowhere: re-run with FAKE_AI disabled to generate real fix content.</p>`,
    `<h3>Expected Impact</h3>`,
    `<p>Exercises the suggest-fix pipeline without spending tokens.</p>`,
  ].join("\n");
}

export interface FakeGeneratedQuestion {
  question: string;
  questionType: "awareness" | "consideration" | "commercial";
}

export function fakeGeneratedQuestions(
  termText: string,
  brandName: string,
  stages: Array<"awareness" | "consideration" | "commercial">,
): { userQuestions: FakeGeneratedQuestion[]; brandSentiment: FakeGeneratedQuestion[] } {
  const brand = brandToken(brandName);
  const term = termText.slice(0, 80) || "synthetic topic";
  const stageQuestions: Record<string, { user: string; sentiment: string }> = {
    awareness: {
      user: `What challenges do teams face with ${term}?`,
      sentiment: `What does ${brand} do for ${term}?`,
    },
    consideration: {
      user: `What are the leading approaches to ${term}?`,
      sentiment: `How does ${brand} compare for ${term}?`,
    },
    commercial: {
      user: `Which solution is best for ${term}?`,
      sentiment: `Should we choose ${brand} for ${term}?`,
    },
  };
  return {
    userQuestions: stages.map((s) => ({ question: stageQuestions[s].user, questionType: s })),
    brandSentiment: stages.map((s) => ({ question: stageQuestions[s].sentiment, questionType: s })),
  };
}

// ---------------------------------------------------------------------------
// Report generator fakes (narrative portions only — metrics stay real)
// ---------------------------------------------------------------------------

export interface FakeExecutiveNarrative {
  executiveSummary: string;
  strategicActions: Array<{ action: string; reasoning: string; priority: string }>;
  competitorPositioning: string;
  progressIndicators: string;
}

export function fakeExecutiveNarrative(brandDomain: string): FakeExecutiveNarrative {
  const domain = shortDomain(brandDomain);
  return {
    executiveSummary: `FAKE_AI executive summary for ${domain}: synthetic share-of-voice narrative for load testing. No real analysis was performed.`,
    strategicActions: [0, 1, 2, 3, 4].map((i) => ({
      action: `Synthetic strategic action ${i + 1} for ${domain}`,
      reasoning: `Fixture reasoning referencing synthetic metrics for ${domain}.`,
      priority: i < 2 ? "critical" : i < 4 ? "high" : "medium",
    })),
    competitorPositioning: `FAKE_AI positioning note: synthetic rivals dominate fixture prompts where ${domain} is absent.`,
    progressIndicators: "FAKE_AI: watch synthetic share of voice across repeated load-test runs.",
  };
}

export interface FakeMarketingNarrative {
  executiveSummary: string;
  actionItems: Array<{
    title: string;
    reasoning: string;
    steps: string[];
    exampleContent: string;
    wordsToUse: string[];
    expectedImpact: string;
    priority: string;
  }>;
  faqStrategy: { questions: string[]; implementation: string };
  comparisonPages: Array<{ competitor: string; pageTitle: string; keyPoints: string[]; sampleHeadings: string[] }>;
  contentCalendar: string;
}

export function fakeMarketingNarrative(brandDomain: string, competitors: string[]): FakeMarketingNarrative {
  const domain = shortDomain(brandDomain);
  const comps = competitors.slice(0, 3).map(shortDomain);
  while (comps.length < 3) comps.push(`fake-rival-${comps.length + 1}.example.com`);
  return {
    executiveSummary: `FAKE_AI marketing plan for ${domain}: synthetic actions for load testing.`,
    actionItems: [0, 1, 2, 3, 4].map((i) => ({
      title: `Synthetic content piece ${i + 1} for ${domain}`,
      reasoning: `Fixture reasoning for load testing ${domain}.`,
      steps: ["Draft fixture outline", "Write synthetic copy", "Add fixture schema", "Publish to test env"],
      exampleContent: `Synthetic example paragraph for ${domain} fixture content piece ${i + 1}.`,
      wordsToUse: [domain, "synthetic", "fixture"],
      expectedImpact: "Exercises the marketing report pipeline without tokens",
      priority: i < 2 ? "critical" : "high",
    })),
    faqStrategy: {
      questions: [1, 2, 3, 4, 5, 6].map((i) => `Synthetic FAQ ${i} for ${domain}?`),
      implementation: "FAKE_AI: add fixture FAQ schema in the test environment.",
    },
    comparisonPages: comps.map((c) => ({
      competitor: c,
      pageTitle: `${domain} vs ${c} (synthetic fixture)`,
      keyPoints: [`Fixture point 1 for ${c}`, `Fixture point 2 for ${c}`, `Fixture point 3 for ${c}`],
      sampleHeadings: [`Why ${domain} (fixture)`, `Where ${c} fits`, `Fixture verdict`],
    })),
    contentCalendar: "FAKE_AI fixture calendar — Month 1: fixtures. Month 2: fixtures. Month 3: fixtures.",
  };
}

export interface FakeCompetitiveNarrative {
  executiveSummary: string;
  competitorStrategies: Array<{ competitor: string; aiStrategy: string; keyPhrases: string[]; dominantAreas: string[] }>;
  differentiationOpportunities: Array<{ opportunity: string; reasoning: string; implementation: string }>;
  aiClaimsRepeated: Array<{ claim: string; frequency: string; source: string }>;
  threatAssessment: string;
}

export function fakeCompetitiveNarrative(brandDomain: string, competitorNames: string[]): FakeCompetitiveNarrative {
  const domain = shortDomain(brandDomain);
  const comps = competitorNames.length > 0 ? competitorNames.slice(0, 3) : ["fake-rival-alpha.example.com"];
  return {
    executiveSummary: `FAKE_AI competitive overview for ${domain}: synthetic threat narrative for load testing.`,
    competitorStrategies: comps.map((c) => ({
      competitor: c,
      aiStrategy: `Synthetic: ${c} appears in fixture answers via comparison content.`,
      keyPhrases: [`${c} fixture phrase 1`, `${c} fixture phrase 2`],
      dominantAreas: ["commercial", "consideration"],
    })),
    differentiationOpportunities: [1, 2, 3].map((i) => ({
      opportunity: `Synthetic differentiation angle ${i} for ${domain}`,
      reasoning: `Fixture reasoning for ${domain} load testing.`,
      implementation: `Ship fixture content ${i} in the test environment.`,
    })),
    aiClaimsRepeated: comps.map((c) => ({
      claim: `Synthetic claim repeated about ${c}`,
      frequency: "Often in fixture data",
      source: c,
    })),
    threatAssessment: `FAKE_AI threat assessment for ${domain}: no real threat, this is fixture data.`,
  };
}

/** Re-exported for convenience in tests. */
