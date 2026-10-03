import OpenAI from "openai";
import { storage } from "./storage";
import type { Brand } from "@shared/schema";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromOpenAI } from "./services/llm-provider/openai/usage";
import { fakeAiSleep, fakeCoverageResult, isFakeAiEnabled, maybeThrowFakeAiError } from "./services/fake-ai";

export interface TopicCluster {
  topic: string;
  coverage: "strong" | "weak" | "competitor-owned";
  description?: string;
}

export interface GapRow {
  topic: string;
  brand: string;
  competitors: Record<string, string>;
  gapSeverity: "high" | "medium" | "low";
  recommendedAction: string;
}

function buildBrandContext(brand: Brand): string {
  const parts: string[] = [];
  const domain = brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  parts.push(`Brand/Domain: ${domain}`);
  if (brand.category) parts.push(`Category: ${brand.category}`);
  if (brand.problemStatement) parts.push(`Problem they solve: ${brand.problemStatement}`);
  if (brand.targetAudience) parts.push(`Target audience: ${brand.targetAudience}`);
  if (brand.brandPositioning) parts.push(`Brand positioning: ${brand.brandPositioning}`);
  if (brand.territory) parts.push(`Territory: ${brand.territory}`);
  if (brand.location) parts.push(`Location: ${brand.location}`);
  if (brand.products) parts.push(`Products/Services: ${brand.products}`);
  if (brand.differentiators) parts.push(`Key differentiators: ${brand.differentiators}`);
  if (brand.keyTopics) parts.push(`Key topics: ${brand.keyTopics}`);
  return parts.join("\n");
}

async function analyzeCoverageWithLLM(brand: Brand, usage: AiUsageContext): Promise<{
  topicClusters: TopicCluster[];
  missingTopics: string[];
  competitorCoverage: Record<string, string[]>;
  recommendations: GapRow[];
}> {
  const brandContext = buildBrandContext(brand);
  const competitorNames = (brand.competitors || []).map(c =>
    c.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  );

  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("coverage analysis");
    return fakeCoverageResult(brand.domain, brand.competitors || []);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });

  const prompt = `You are analysing semantic content coverage for a brand versus its competitors in AI search visibility. Here is the brand:

${brandContext}

Competitors: ${competitorNames.join(", ") || "none identified yet"}

Based on your knowledge of this brand, its competitors, and the broader market, analyse what topics and content areas this brand covers well, where it has gaps, and where competitors have stronger AI visibility.

Respond ONLY with JSON in this exact format:

\`\`\`json
{
  "topicClusters": [
    {"topic": "specific topic name relevant to this brand's market", "coverage": "strong|weak|competitor-owned", "description": "why this coverage level — be specific to the brand"}
  ],
  "missingTopics": ["specific topic this brand should cover but doesn't appear to"],
  "competitorCoverage": {
    "competitor_domain": ["topic1 they cover well", "topic2"]
  },
  "recommendations": [
    {
      "topic": "specific topic",
      "brand": "none|partial|good",
      "competitors": {"competitor_domain": "none|partial|good"},
      "gapSeverity": "high|medium|low",
      "recommendedAction": "Specific, actionable recommendation for THIS brand — not generic advice"
    }
  ]
}
\`\`\`

Requirements:
- Provide 5-8 topic clusters specific to this brand's market and category
- Provide 3-5 missing topics that are genuinely relevant to their business
- Provide 3-5 recommendations with specific, actionable steps
- Every recommendation must reference the brand's actual products, market, or positioning
- Do NOT provide generic SEO advice — every item must be specific to this brand
- If you have limited knowledge of a competitor, say so rather than guessing

Respond ONLY with the JSON block.`;

  const response = await executeAiCall(
    usage,
    "openai",
    "gpt-4o-mini",
    () => client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.3,
    }),
    usageFromOpenAI,
  );

  const text = response.choices[0]?.message?.content || "";

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
  } catch (e) {
    console.error("Failed to parse coverage analysis JSON:", e);
  }

  return {
    topicClusters: [],
    missingTopics: [],
    competitorCoverage: {},
    recommendations: [],
  };
}

export const coverageAnalyzer = {
  async analyze(brandId: number, source: AiUsageContext["source"] = "manual"): Promise<void> {
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error(`Brand ${brandId} not found`);

    const data = await analyzeCoverageWithLLM(brand, {
      userId: brand.userId,
      brandId: brand.id,
      feature: "coverage",
      source,
    });

    await storage.upsertCoverageGap({
      brandId,
      topicClusters: data.topicClusters,
      missingTopics: data.missingTopics,
      competitorCoverage: data.competitorCoverage,
      recommendations: data.recommendations,
    });

    console.log(`Coverage analysis complete for brand ${brandId} (${data.topicClusters.length} clusters, ${data.recommendations.length} recommendations)`);
  },
};
