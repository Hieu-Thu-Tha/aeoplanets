import { GoogleGenAI } from "@google/genai";
import type { Brand, VisibilityRun, PerceptionProfile, CoverageGap, ReadabilityAudit } from "@shared/schema";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromGemini } from "./services/llm-provider/gemini/usage";

export interface ReportData {
  brand: Brand;
  visibilityRuns: VisibilityRun[];
  perceptionProfile: PerceptionProfile | undefined;
  coverageGap: CoverageGap | undefined;
  readabilityAudit: ReadabilityAudit | undefined;
  competitorWeaknesses?: Record<string, any>;
}

export interface ExecutiveReportContent {
  reportType: "executive";
  brandDomain: string;
  generatedAt: string;
  executiveSummary: string;
  overallShareOfVoice: number;
  commercialScore: number;
  categoryScore: number;
  problemBasedScore: number;
  brandDirectScore: number;
  modelBreakdown: { model: string; appeared: number; total: number; percentage: number }[];
  promptTypeBreakdown: { type: string; appeared: number; total: number; percentage: number }[];
  competitorFrequency: { name: string; mentions: number; percentage: number }[];
  perceptionScores: { positioning: number; authority: number; proof: number; differentiation: number };
  strengths: string[];
  weaknesses: string[];
  strategicActions: { action: string; reasoning: string; priority: string }[];
  competitorPositioning: string;
  progressIndicators: string;
  readabilityScore: number;
}

export interface MarketingActionReportContent {
  reportType: "marketing";
  brandDomain: string;
  generatedAt: string;
  executiveSummary: string;
  actionItems: {
    title: string;
    reasoning: string;
    steps: string[];
    exampleContent: string;
    wordsToUse: string[];
    expectedImpact: string;
    priority: string;
  }[];
  faqStrategy: {
    questions: string[];
    implementation: string;
  };
  comparisonPages: {
    competitor: string;
    pageTitle: string;
    keyPoints: string[];
    sampleHeadings: string[];
  }[];
  contentCalendar: string;
}

export interface CompetitiveIntelReportContent {
  reportType: "competitive";
  brandDomain: string;
  generatedAt: string;
  executiveSummary: string;
  competitorProminence: { name: string; mentions: number; percentage: number; dominantTypes: string[] }[];
  competitorDominancePrompts: { prompt: string; competitors: string[]; analysis: string }[];
  gapAnalysis: string;
  competitorStrategies: { competitor: string; aiStrategy: string; keyPhrases: string[]; dominantAreas: string[] }[];
  differentiationOpportunities: { opportunity: string; reasoning: string; implementation: string }[];
  aiClaimsRepeated: { claim: string; frequency: string; source: string }[];
  threatAssessment: string;
}

type ReportContent = ExecutiveReportContent | MarketingActionReportContent | CompetitiveIntelReportContent;

function computeMetrics(data: ReportData) {
  const { visibilityRuns, perceptionProfile, coverageGap, readabilityAudit, brand } = data;
  const total = visibilityRuns.length;
  const appeared = visibilityRuns.filter(r => r.appeared).length;
  const shareOfVoice = total > 0 ? Math.round((appeared / total) * 100) : 0;

  const byType = (type: string) => {
    const runs = visibilityRuns.filter(r => r.promptType === type);
    const app = runs.filter(r => r.appeared).length;
    return { appeared: app, total: runs.length, percentage: runs.length > 0 ? Math.round((app / runs.length) * 100) : 0 };
  };

  const commercialScore = byType("commercial").percentage;
  const categoryScore = byType("consideration").percentage;
  const problemScore = byType("awareness").percentage;
  const brandDirectScore = byType("awareness").percentage;

  const modelBreakdown = ["openai", "anthropic", "gemini"].map(model => {
    const runs = visibilityRuns.filter(r => r.modelId === model);
    const app = runs.filter(r => r.appeared).length;
    return {
      model: model === "openai" ? "ChatGPT" : model === "anthropic" ? "Claude Haiku 4.5" : "Gemini 3.1",
      appeared: app,
      total: runs.length,
      percentage: runs.length > 0 ? Math.round((app / runs.length) * 100) : 0,
    };
  });

  const promptTypeBreakdown = ["awareness", "consideration", "commercial"].map(type => ({
    type: type.replace(/\b\w/g, c => c.toUpperCase()),
    ...byType(type),
  }));

  const competitorFrequency: Record<string, number> = {};
  for (const run of visibilityRuns) {
    const comps = run.competitorsMentioned as string[];
    if (Array.isArray(comps)) {
      for (const c of comps) {
        competitorFrequency[c] = (competitorFrequency[c] || 0) + 1;
      }
    }
  }
  const topCompetitors = Object.entries(competitorFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, mentions]) => ({
      name,
      mentions,
      percentage: total > 0 ? Math.round((mentions / total) * 100) : 0,
    }));

  const notAppearedButCompetitorDid = visibilityRuns.filter(
    r => !r.appeared && Array.isArray(r.competitorsMentioned) && (r.competitorsMentioned as string[]).length > 0
  );

  const sentimentBreakdown = {
    positive: visibilityRuns.filter(r => r.sentiment === "positive").length,
    neutral: visibilityRuns.filter(r => r.sentiment === "neutral").length,
    negative: visibilityRuns.filter(r => r.sentiment === "negative").length,
  };

  return {
    total,
    appeared,
    shareOfVoice,
    commercialScore,
    categoryScore,
    problemScore,
    brandDirectScore,
    modelBreakdown,
    promptTypeBreakdown,
    topCompetitors,
    notAppearedButCompetitorDid,
    sentimentBreakdown,
    perceptionScores: {
      positioning: perceptionProfile?.positioningScore ?? 0,
      authority: perceptionProfile?.authorityScore ?? 0,
      proof: perceptionProfile?.proofScore ?? 0,
      differentiation: perceptionProfile?.differentiationScore ?? 0,
    },
    strengths: perceptionProfile?.strengths ?? [],
    weaknesses: perceptionProfile?.weaknesses ?? [],
    topImprovements: perceptionProfile?.topImprovements ?? [],
    confusionMarkers: perceptionProfile?.confusionMarkers ?? [],
    readabilityScore: readabilityAudit?.score ?? 0,
    brand,
    coverageGap,
    competitorWeaknesses: data.competitorWeaknesses || {},
  };
}

function cleanJsonString(raw: string): any {
  let text = raw.trim();
  if (text.startsWith('<')) {
    const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) text = scriptMatch[1].trim();
  }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) text = codeBlock[1].trim();
  else {
    const braceMatch = text.match(/\{[\s\S]*\}/s);
    if (braceMatch) text = braceMatch[0];
  }
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
  text = text.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(text);
  } catch (e) {
    text = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    try {
      return JSON.parse(text);
    } catch (e2) {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) {
        let truncated = text.slice(0, lastBrace + 1);
        let openBraces = (truncated.match(/\{/g) || []).length;
        let closeBraces = (truncated.match(/\}/g) || []).length;
        let openBrackets = (truncated.match(/\[/g) || []).length;
        let closeBrackets = (truncated.match(/\]/g) || []).length;

        while (openBraces > closeBraces) { truncated += '}'; closeBraces++; }
        while (openBrackets > closeBrackets) { truncated += ']'; closeBrackets++; }

        const lastQuoteIdx = truncated.lastIndexOf('"');
        const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          truncated = truncated.slice(0, lastQuoteIdx) + truncated.slice(lastQuoteIdx + 1);
        }

        try {
          return JSON.parse(truncated);
        } catch {
          throw e;
        }
      }
      throw e;
    }
  }
}

async function callGemini(prompt: string, usage?: AiUsageContext): Promise<string> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await executeAiCall(
    usage,
    "gemini",
    "gemini-3.1-pro-preview",
    () => client.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    }),
    usageFromGemini,
  );
  return response.text ?? "";
}

function reportUsage(data: ReportData): AiUsageContext {
  return { userId: data.brand.userId, brandId: data.brand.id, feature: "report" };
}

export async function generateExecutiveReport(data: ReportData): Promise<ExecutiveReportContent> {
  const m = computeMetrics(data);

  const prompt = `You are an AI visibility intelligence analyst writing an executive report for ${m.brand.domain}.

BRAND CONTEXT:
- Domain: ${m.brand.domain}
- Category: ${m.brand.category || "Unknown"}
- Positioning: ${m.brand.brandPositioning || "Not defined"}
- Target Audience: ${m.brand.targetAudience || "Not defined"}
- Competitors tracked: ${m.brand.competitors?.join(", ") || "None"}

CURRENT METRICS:
- Overall AI Share of Voice: ${m.shareOfVoice}% (appeared in ${m.appeared} of ${m.total} prompts)
- Brand Direct Recognition: ${m.brandDirectScore}%
- Category Comparison Visibility: ${m.categoryScore}%
- Commercial Intent Visibility: ${m.commercialScore}%
- Problem-Based Visibility: ${m.problemScore}%

MODEL PERFORMANCE:
${m.modelBreakdown.map(mb => `- ${mb.model}: ${mb.percentage}% (${mb.appeared}/${mb.total})`).join("\n")}

PERCEPTION SCORES:
- Positioning Clarity: ${m.perceptionScores.positioning}/100
- Authority Depth: ${m.perceptionScores.authority}/100
- Proof Strength: ${m.perceptionScores.proof}/100
- Differentiation Clarity: ${m.perceptionScores.differentiation}/100

STRENGTHS: ${m.strengths.join("; ") || "None identified"}
WEAKNESSES: ${m.weaknesses.join("; ") || "None identified"}
READABILITY SCORE: ${m.readabilityScore}/100

TOP COMPETITORS BY AI MENTIONS:
${m.topCompetitors.map(c => `- ${c.name}: ${c.mentions} mentions (${c.percentage}%)`).join("\n") || "None detected"}

COMPETITOR VULNERABILITIES (from real review data):
${Object.entries(m.competitorWeaknesses).map(([name, data]: [string, any]) => {
    if (!data) return "";
    const complaints = Array.isArray(data.complaints) ? data.complaints.filter((c: any) => c.severity === "high").slice(0, 2).map((c: any) => c.detail).join("; ") : "";
    const vulns = Array.isArray(data.vulnerabilities) ? data.vulnerabilities.slice(0, 2).join("; ") : "";
    return `- ${name}: ${data.summary || "No data"} | Key complaints: ${complaints || "None"} | Vulnerabilities: ${vulns || "None"}`;
  }).filter(Boolean).join("\n") || "No competitor weakness data available"}

Write a thorough executive report. Respond ONLY with valid JSON in this exact format:
{
  "executiveSummary": "A 200-word executive summary of the brand's current AI visibility position, highlighting the most critical findings and the overall trajectory",
  "strategicActions": [
    {
      "action": "Specific action title",
      "reasoning": "Why this matters for AI visibility - 2-3 sentences with data",
      "priority": "critical|high|medium"
    }
  ],
  "competitorPositioning": "A 150-word analysis of how competitors are positioned in AI responses vs this brand, with specific observations about what they do differently",
  "progressIndicators": "A 100-word section describing what metrics to watch and what constitutes progress for this brand"
}

Return 5-7 strategic actions. Be specific to ${m.brand.domain}, not generic. Reference actual data points.`;

  let aiResponse: { executiveSummary: string; strategicActions: { action: string; reasoning: string; priority: string }[]; competitorPositioning: string; progressIndicators: string };
  try {
    const raw = await callGemini(prompt, reportUsage(data));
    aiResponse = cleanJsonString(raw);
  } catch (e) {
    console.error("Gemini executive report error:", e);
    aiResponse = {
      executiveSummary: `${m.brand.domain} currently holds a ${m.shareOfVoice}% AI Share of Voice across ${m.total} tracked prompts. The brand is recognized in direct queries (${m.brandDirectScore}%) but struggles in category comparisons (${m.categoryScore}%) and commercial intent searches (${m.commercialScore}%).`,
      strategicActions: m.topImprovements.slice(0, 5).map((imp, i) => ({
        action: imp,
        reasoning: "Based on perception analysis findings.",
        priority: i < 2 ? "critical" : i < 4 ? "high" : "medium",
      })),
      competitorPositioning: `Top competitors include ${m.topCompetitors.map(c => c.name).join(", ")}. They dominate category and commercial prompts where ${m.brand.domain} is absent.`,
      progressIndicators: "Track Share of Voice weekly, monitor commercial intent visibility, and measure positioning score improvements.",
    };
  }

  return {
    reportType: "executive",
    brandDomain: m.brand.domain,
    generatedAt: new Date().toISOString(),
    executiveSummary: aiResponse.executiveSummary,
    overallShareOfVoice: m.shareOfVoice,
    commercialScore: m.commercialScore,
    categoryScore: m.categoryScore,
    problemBasedScore: m.problemScore,
    brandDirectScore: m.brandDirectScore,
    modelBreakdown: m.modelBreakdown,
    promptTypeBreakdown: m.promptTypeBreakdown,
    competitorFrequency: m.topCompetitors,
    perceptionScores: m.perceptionScores,
    strengths: m.strengths,
    weaknesses: m.weaknesses,
    strategicActions: aiResponse.strategicActions || [],
    competitorPositioning: aiResponse.competitorPositioning,
    progressIndicators: aiResponse.progressIndicators,
    readabilityScore: m.readabilityScore,
  };
}

export async function generateMarketingReport(data: ReportData): Promise<MarketingActionReportContent> {
  const m = computeMetrics(data);
  const missingTopics = (m.coverageGap?.missingTopics as { topic: string; severity: string }[] | null) ?? [];
  const recommendations = (m.coverageGap?.recommendations as { action: string; priority: string; topic?: string }[] | null) ?? [];
  const topicClusters = (m.coverageGap?.topicClusters as { topic: string; coverage: string; description: string }[] | null) ?? [];

  const brandContext = `Domain: ${m.brand.domain} | Category: ${m.brand.category || "Unknown"} | Positioning: ${m.brand.brandPositioning || "Not defined"} | Target: ${m.brand.targetAudience || "Not defined"} | Competitors: ${m.brand.competitors?.join(", ") || "None"} | SoV: ${m.shareOfVoice}% | Commercial: ${m.commercialScore}% | Category: ${m.categoryScore}%`;

  const actionsPrompt = `You are an AI visibility marketing strategist. Create action items for ${m.brand.domain}.

${brandContext}

WEAKNESSES: ${m.weaknesses.slice(0, 3).join("; ") || "None"}
MISSING TOPICS: ${missingTopics.slice(0, 5).map(t => t.topic).join(", ") || "None"}

COMPETITOR VULNERABILITIES TO EXPLOIT IN CONTENT:
${Object.entries(m.competitorWeaknesses).map(([name, data]: [string, any]) => {
    if (!data) return "";
    const churn = Array.isArray(data.customerChurnReasons) ? data.customerChurnReasons.slice(0, 2).join("; ") : "";
    const complaints = Array.isArray(data.complaints) ? data.complaints.slice(0, 2).map((c: any) => `${c.category}: ${c.detail}`).join("; ") : "";
    return `- ${name}: Churn reasons: ${churn || "Unknown"} | Complaints: ${complaints || "None"}`;
  }).filter(Boolean).join("\n") || "No competitor weakness data available"}

Respond ONLY with valid JSON. Keep values concise (under 80 words each). No newlines within string values.
{
  "executiveSummary": "100-word strategy overview",
  "actionItems": [
    {
      "title": "Page/content title",
      "reasoning": "Why this matters - 1-2 sentences",
      "steps": ["Step 1", "Step 2", "Step 3", "Step 4"],
      "exampleContent": "50-word example of real content to write",
      "wordsToUse": ["phrase1", "phrase2", "phrase3"],
      "expectedImpact": "Expected improvement",
      "priority": "critical|high|medium"
    }
  ]
}
Include exactly 5 action items. Be specific to ${m.brand.domain}. Use real brand/competitor names.`;

  const supplementPrompt = `You are an AI visibility strategist creating supplemental content for ${m.brand.domain}.

${brandContext}

Respond ONLY with valid JSON. Keep values concise. No newlines within string values.
{
  "faqStrategy": {
    "questions": ["FAQ question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6"],
    "implementation": "Brief FAQ schema implementation guide"
  },
  "comparisonPages": [
    {
      "competitor": "name",
      "pageTitle": "Page title",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "sampleHeadings": ["H2 1", "H2 2", "H2 3"]
    }
  ],
  "contentCalendar": "3-month content plan with specific topics per month"
}
Create comparison pages for the top 3 competitors: ${m.brand.competitors?.slice(0, 3).join(", ") || "competitors"}. Be specific to ${m.brand.domain}.`;

  let actionsResponse: any = {};
  let supplementResponse: any = {};

  const [actionsResult, supplementResult] = await Promise.allSettled([
    callGemini(actionsPrompt, reportUsage(data)).then(cleanJsonString),
    callGemini(supplementPrompt, reportUsage(data)).then(cleanJsonString),
  ]);

  if (actionsResult.status === "fulfilled") {
    actionsResponse = actionsResult.value;
  } else {
    console.error("Gemini marketing actions error:", actionsResult.reason);
    actionsResponse = {
      executiveSummary: `Marketing action plan for ${m.brand.domain} to improve AI visibility from ${m.shareOfVoice}%.`,
      actionItems: missingTopics.slice(0, 5).map(t => ({
        title: `Create content: ${t.topic}`,
        reasoning: `Coverage gap with ${t.severity} severity.`,
        steps: ["Research topic thoroughly", "Write comprehensive content", "Add schema markup", "Publish and monitor results"],
        exampleContent: `Detailed guide about ${t.topic} for ${m.brand.category || "professionals"}.`,
        wordsToUse: [t.topic, m.brand.category || ""].filter(Boolean),
        expectedImpact: "Improved category visibility",
        priority: t.severity === "high" ? "critical" : "high",
      })),
    };
  }

  if (supplementResult.status === "fulfilled") {
    supplementResponse = supplementResult.value;
  } else {
    console.error("Gemini marketing supplement error:", supplementResult.reason);
    supplementResponse = {
      faqStrategy: { questions: [], implementation: "Add FAQ schema markup to key pages." },
      comparisonPages: [],
      contentCalendar: "Month 1: Foundation pages. Month 2: Comparison content. Month 3: Authority building.",
    };
  }

  return {
    reportType: "marketing",
    brandDomain: m.brand.domain,
    generatedAt: new Date().toISOString(),
    executiveSummary: actionsResponse.executiveSummary || "",
    actionItems: actionsResponse.actionItems || [],
    faqStrategy: supplementResponse.faqStrategy || { questions: [], implementation: "" },
    comparisonPages: supplementResponse.comparisonPages || [],
    contentCalendar: supplementResponse.contentCalendar || "",
  };
}

export async function generateCompetitiveReport(data: ReportData): Promise<CompetitiveIntelReportContent> {
  const m = computeMetrics(data);

  const competitorDominanceData = m.notAppearedButCompetitorDid.map(r => ({
    prompt: r.promptText.slice(0, 120),
    promptType: r.promptType,
    competitors: r.competitorsMentioned as string[],
    sentiment: r.sentiment,
  }));

  const competitorByType: Record<string, Record<string, number>> = {};
  for (const run of data.visibilityRuns) {
    const comps = run.competitorsMentioned as string[];
    if (Array.isArray(comps)) {
      for (const c of comps) {
        if (!competitorByType[c]) competitorByType[c] = {};
        competitorByType[c][run.promptType] = (competitorByType[c][run.promptType] || 0) + 1;
      }
    }
  }

  const prompt = `You are a competitive intelligence analyst writing a report about how ${m.brand.domain}'s competitors appear in AI model responses.

BRAND: ${m.brand.domain}
CATEGORY: ${m.brand.category || "Unknown"}
POSITIONING: ${m.brand.brandPositioning || "Not defined"}

COMPETITOR PROMINENCE IN AI RESPONSES:
${m.topCompetitors.map(c => {
    const types = competitorByType[c.name] || {};
    const dominantTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t]) => t.replace(/_/g, " "));
    return `- ${c.name}: ${c.mentions} mentions across ${c.percentage}% of prompts. Dominant in: ${dominantTypes.join(", ")}`;
  }).join("\n") || "No competitor data"}

PROMPTS WHERE COMPETITORS APPEARED BUT ${m.brand.domain} DID NOT:
${competitorDominanceData.slice(0, 10).map(d => `- "${d.prompt}" — ${d.competitors.join(", ")} appeared (${d.promptType})`).join("\n") || "None found"}

BRAND CONFUSION MARKERS: ${m.confusionMarkers.join("; ") || "None"}
BRAND STRENGTHS: ${m.strengths.join("; ") || "None"}

COMPETITOR VULNERABILITIES (from real customer reviews & complaints):
${Object.entries(m.competitorWeaknesses).map(([name, data]: [string, any]) => {
    if (!data) return "";
    const score = data.reviewScore || "Unknown";
    const sentiment = data.overallSentiment || "unknown";
    const complaints = Array.isArray(data.complaints) ? data.complaints.map((c: any) => `  - [${c.severity}] ${c.category}: ${c.detail} (Source: ${c.source || "review site"})`).join("\n") : "  None";
    const vulns = Array.isArray(data.vulnerabilities) ? data.vulnerabilities.map((v: string) => `  - ${v}`).join("\n") : "  None";
    const churn = Array.isArray(data.customerChurnReasons) ? data.customerChurnReasons.map((r: string) => `  - ${r}`).join("\n") : "  None";
    return `${name} (Review Score: ${score}, Sentiment: ${sentiment}):\n  Complaints:\n${complaints}\n  Vulnerabilities:\n${vulns}\n  Churn Reasons:\n${churn}`;
  }).filter(Boolean).join("\n\n") || "No competitor weakness data available"}

Respond ONLY with valid JSON:
{
  "executiveSummary": "200-word competitive intelligence overview — who dominates AI responses, key threats, and strategic opportunities",
  "competitorStrategies": [
    {
      "competitor": "competitor name",
      "aiStrategy": "Analysis of why this competitor appears frequently — what content/authority signals drive their AI visibility",
      "keyPhrases": ["Phrases AI associates with this competitor"],
      "dominantAreas": ["prompt types where they dominate"]
    }
  ],
  "differentiationOpportunities": [
    {
      "opportunity": "Specific differentiation angle",
      "reasoning": "Why this gap exists and how to exploit it — 2-3 sentences",
      "implementation": "Concrete steps to implement this differentiation"
    }
  ],
  "aiClaimsRepeated": [
    {
      "claim": "A specific claim or positioning statement AI models repeat about a competitor",
      "frequency": "How often this appears",
      "source": "Which competitor this relates to"
    }
  ],
  "threatAssessment": "150-word assessment of the competitive threat level and urgency of response needed"
}

Analyze the top 3-5 competitors. Provide 3-5 differentiation opportunities. Identify 3-5 AI claims. Be specific to the actual data — don't invent competitors not in the data.`;

  let aiResponse: any;
  try {
    const raw = await callGemini(prompt, reportUsage(data));
    aiResponse = cleanJsonString(raw);
  } catch (e) {
    console.error("Gemini competitive report error:", e);
    aiResponse = {
      executiveSummary: `Competitive intelligence analysis for ${m.brand.domain} across ${m.total} AI prompt executions.`,
      competitorStrategies: [],
      differentiationOpportunities: [],
      aiClaimsRepeated: [],
      threatAssessment: "Further data collection needed for comprehensive threat assessment.",
    };
  }

  const competitorProminence = m.topCompetitors.map(c => {
    const types = competitorByType[c.name] || {};
    const dominantTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t]) => t.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()));
    return { ...c, dominantTypes };
  });

  return {
    reportType: "competitive",
    brandDomain: m.brand.domain,
    generatedAt: new Date().toISOString(),
    executiveSummary: aiResponse.executiveSummary || "",
    competitorProminence,
    competitorDominancePrompts: competitorDominanceData.slice(0, 8).map(d => ({
      prompt: d.prompt,
      competitors: d.competitors,
      analysis: `${d.competitors.join(", ")} appeared in this ${d.promptType.replace(/_/g, " ")} prompt while ${m.brand.domain} was absent.`,
    })),
    gapAnalysis: aiResponse.gapAnalysis || "",
    competitorStrategies: aiResponse.competitorStrategies || [],
    differentiationOpportunities: aiResponse.differentiationOpportunities || [],
    aiClaimsRepeated: aiResponse.aiClaimsRepeated || [],
    threatAssessment: aiResponse.threatAssessment || "",
  };
}

export async function generateReport(reportType: string, data: ReportData): Promise<ReportContent> {
  switch (reportType) {
    case "executive":
      return generateExecutiveReport(data);
    case "marketing":
      return generateMarketingReport(data);
    case "competitive":
      return generateCompetitiveReport(data);
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}
