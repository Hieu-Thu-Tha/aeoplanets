import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Perplexity from "@perplexity-ai/perplexity_ai";
import { storage } from "./storage";
import type { Brand } from "@shared/schema";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromOpenAI } from "./services/llm-provider/openai/usage";
import { usageFromAnthropic } from "./services/llm-provider/anthropic/usage";
import { usageFromGemini } from "./services/llm-provider/gemini/usage";
import { usageFromPerplexity } from "./services/llm-provider/perplexity/usage";
import { PERPLEXITY_SEARCH_WEB_METER } from "@shared/ai-billing";
import { perplexityOutputText, perplexityCitationAppendix, stripPerplexityMarkers } from "./services/llm-provider/perplexity/output";
import { extractGeminiCitations } from "./services/llm-provider/gemini/output";
import { formatSourcesAppendix } from "./services/llm-provider/citations";
import { isAiUsageCapExceededError } from "./services/ai-usage/cap";
import { fakeAiSleep, fakePerceptionResult, isFakeAiEnabled, maybeThrowFakeAiError } from "./services/fake-ai";

export interface PerceptionData {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  inferredAudience: string;
  marketTier: string;
  confusionMarkers: string[];
  positioningScore: number;
  authorityScore: number;
  proofScore: number;
  differentiationScore: number;
  topImprovements: string[];
}

function buildBrandContext(brand: Brand): string {
  const parts: string[] = [];
  const domain = brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  parts.push(`Brand/Domain: ${domain}`);
  if (brand.category) parts.push(`Category: ${brand.category}`);
  if (brand.problemStatement) parts.push(`Problem they solve: ${brand.problemStatement}`);
  if (brand.targetAudience) parts.push(`Target audience: ${brand.targetAudience}`);
  if (brand.brandPositioning) parts.push(`Positioning: ${brand.brandPositioning}`);
  if (brand.territory) parts.push(`Territory: ${brand.territory}`);
  if (brand.location) parts.push(`Location: ${brand.location}`);
  if (brand.products) parts.push(`Products/Services: ${brand.products}`);
  if (brand.differentiators) parts.push(`Key differentiators: ${brand.differentiators}`);
  if (brand.keyTopics) parts.push(`Key topics: ${brand.keyTopics}`);
  if (brand.competitors && Array.isArray(brand.competitors) && brand.competitors.length > 0) {
    parts.push(`Key competitors: ${brand.competitors.join(", ")}`);
  }
  return parts.join("\n");
}

function buildPerceptionPrompt(brand: Brand): string {
  const context = buildBrandContext(brand);

  return `You are analysing how well-known and well-positioned a brand is in your training data. Here is the brand:

${context}

Based on everything you know about this brand, its market, its competitors, and its online presence, provide a detailed perception analysis as JSON:

\`\`\`json
{
  "summary": "A 200-word narrative about how this brand appears in AI knowledge. Be specific about what you know and don't know. Reference their actual products, market position, and reputation.",
  "strengths": ["List 3-5 specific strengths based on what you actually know about this brand"],
  "weaknesses": ["List 2-4 specific weaknesses or gaps in their AI visibility"],
  "inferredAudience": "Who appears to be their primary target audience based on available information",
  "marketTier": "enterprise|mid-market|smb|unknown",
  "confusionMarkers": ["Any areas where information about this brand is unclear, contradictory, or easily confused with another entity"],
  "positioningScore": 0-100,
  "authorityScore": 0-100,
  "proofScore": 0-100,
  "differentiationScore": 0-100,
  "topImprovements": ["5 specific, actionable recommendations to improve this brand's AI visibility and representation"]
}
\`\`\`

Scoring criteria:
- positioningScore: How clearly and consistently is this brand positioned in AI knowledge? Does the AI associate it with the right category, audience, and value proposition?
- authorityScore: How authoritative does this brand appear? Is it recognised as a leader, cited in comparisons, mentioned alongside credible sources?
- proofScore: How much verifiable evidence supports this brand's claims? Case studies, customer mentions, awards, third-party reviews, data points?
- differentiationScore: How distinct is this brand from its competitors in AI knowledge? Can the AI clearly articulate what makes it different?

Be honest. If you have limited knowledge of this brand, reflect that in lower scores and say so explicitly. Do not fabricate information. Every strength, weakness, and recommendation must be specific to THIS brand, not generic advice.

Respond ONLY with the JSON block.`;
}

function parseLLMPerceptionResponse(text: string): Partial<PerceptionData> {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return parsed;
    }
  } catch {
  }

  return {};
}

async function getPerceptionFromOpenAI(brand: Brand, usage?: AiUsageContext): Promise<Partial<PerceptionData>> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("openai perception");
    return fakePerceptionResult(brand.domain);
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });
  const prompt = buildPerceptionPrompt(brand);

  const response = await executeAiCall(
    usage,
    "openai",
    "gpt-4o-mini",
    () => client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }),
    usageFromOpenAI,
  );

  const text = response.choices[0]?.message?.content || "";
  return parseLLMPerceptionResponse(text);
}

async function getPerceptionFromAnthropic(brand: Brand, usage?: AiUsageContext): Promise<Partial<PerceptionData>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPerceptionPrompt(brand);

  const response = await executeAiCall(
    usage,
    "anthropic",
    "claude-haiku-4-5",
    () => client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
    usageFromAnthropic,
  );

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseLLMPerceptionResponse(text);
}

async function getPerceptionFromGemini(brand: Brand, usage?: AiUsageContext): Promise<Partial<PerceptionData>> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("gemini perception");
    return fakePerceptionResult(brand.domain);
  }
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildPerceptionPrompt(brand);

  const response = await executeAiCall(
    usage,
    "gemini",
    "gemini-2.5-flash",
    () => client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    }),
    usageFromGemini,
  );

  const parsed = parseLLMPerceptionResponse(response.text || "");
  // Grounding sources make the summary verifiable the same way sonar's do.
  const appendix = formatSourcesAppendix(extractGeminiCitations(response));
  if (parsed.summary && appendix) {
    parsed.summary += `\n\n${appendix}`;
  }
  return parsed;
}

async function getPerceptionFromPerplexity(brand: Brand, usage?: AiUsageContext): Promise<Partial<PerceptionData>> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("perplexity perception");
    return fakePerceptionResult(brand.domain);
  }
  const client = new Perplexity({
    apiKey: process.env.PERPLEXITY_API_KEY,
    timeout: 120_000,
  });
  const prompt = buildPerceptionPrompt(brand);

  const response = await executeAiCall(
    usage,
    "perplexity",
    "perplexity/sonar",
    () => client.responses.create({
      preset: "low",
      model: "perplexity/sonar",
      input: prompt,
    }),
    usageFromPerplexity,
    { expectedMeters: [PERPLEXITY_SEARCH_WEB_METER] },
  );

  const text = perplexityOutputText(response);
  const parsed = parseLLMPerceptionResponse(text);
  if (parsed.summary) parsed.summary = perplexityCitationAppendix(parsed.summary, response);
  if (parsed.strengths) parsed.strengths = parsed.strengths.map(stripPerplexityMarkers);
  if (parsed.weaknesses) parsed.weaknesses = parsed.weaknesses.map(stripPerplexityMarkers);
  if (parsed.confusionMarkers) parsed.confusionMarkers = parsed.confusionMarkers.map(stripPerplexityMarkers);
  if (parsed.topImprovements) parsed.topImprovements = parsed.topImprovements.map(stripPerplexityMarkers);
  return parsed;
}

function mergePerceptionData(results: Partial<PerceptionData>[]): PerceptionData {
  const valid = results.filter(r => r && Object.keys(r).length > 0);

  if (valid.length === 0) {
    return {
      summary: "Unable to gather AI perception data. All three AI models failed to return results for this brand. Please try refreshing the analysis.",
      strengths: [],
      weaknesses: [],
      inferredAudience: "Unknown",
      marketTier: "unknown",
      confusionMarkers: ["All AI models failed to analyse this brand — this itself may indicate very low AI visibility"],
      positioningScore: 0,
      authorityScore: 0,
      proofScore: 0,
      differentiationScore: 0,
      topImprovements: [],
    };
  }

  const summaries = valid.map(r => r.summary).filter(Boolean) as string[];
  const bestSummary = summaries.sort((a, b) => b.length - a.length)[0] || "No summary available.";

  const allStrengths = valid.flatMap(r => r.strengths || []);
  const allWeaknesses = valid.flatMap(r => r.weaknesses || []);
  const allConfusion = valid.flatMap(r => r.confusionMarkers || []);
  const allImprovements = valid.flatMap(r => r.topImprovements || []);

  const avgScore = (key: keyof PerceptionData) => {
    const scores = valid.map(r => r[key] as number).filter(s => typeof s === "number" && !isNaN(s));
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  const audiences = valid.map(r => r.inferredAudience).filter(Boolean) as string[];
  const tiers = valid.map(r => r.marketTier).filter(Boolean) as string[];

  return {
    summary: bestSummary,
    strengths: Array.from(new Set(allStrengths)).slice(0, 5),
    weaknesses: Array.from(new Set(allWeaknesses)).slice(0, 5),
    inferredAudience: audiences[0] || "Unknown",
    marketTier: tiers[0] || "unknown",
    confusionMarkers: Array.from(new Set(allConfusion)).slice(0, 5),
    positioningScore: avgScore("positioningScore"),
    authorityScore: avgScore("authorityScore"),
    proofScore: avgScore("proofScore"),
    differentiationScore: avgScore("differentiationScore"),
    topImprovements: Array.from(new Set(allImprovements)).slice(0, 5),
  };
}

export const perceptionAnalyzer = {
  async analyze(brandId: number, source: AiUsageContext["source"] = "manual"): Promise<void> {
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error(`Brand ${brandId} not found`);

    const usage: AiUsageContext = { userId: brand.userId, brandId, feature: "perception", source };
    const [geminiResult, openaiResult, perplexityResult] = await Promise.allSettled([
      getPerceptionFromGemini(brand, usage),
      getPerceptionFromOpenAI(brand, usage),
      getPerceptionFromPerplexity(brand, usage),
    ]);

    for (const result of [geminiResult, openaiResult, perplexityResult]) {
      if (result.status === "rejected" && isAiUsageCapExceededError(result.reason)) {
        throw result.reason;
      }
    }

    const results: Partial<PerceptionData>[] = [];
    if (geminiResult.status === "fulfilled") results.push(geminiResult.value);
    else console.error("Gemini perception failed:", geminiResult.reason?.message);

    if (openaiResult.status === "fulfilled") results.push(openaiResult.value);
    else console.error("OpenAI perception failed:", openaiResult.reason?.message);

    if (perplexityResult.status === "fulfilled") results.push(perplexityResult.value);
    else console.error("Perplexity perception failed:", perplexityResult.reason?.message);

    const merged = mergePerceptionData(results);

    await storage.upsertPerceptionProfile({
      brandId,
      ...merged,
    });

    console.log(`Perception analysis complete for brand ${brandId} (${results.length}/3 models responded)`);
  },
};
