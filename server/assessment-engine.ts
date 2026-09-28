import { storage } from "./storage";
import { buildPrompts, getBrandDisplayName } from "./prompt-builder";
import { runPromptAcrossModels, BrandContext } from "./llm-runner";
import { perceptionAnalyzer } from "./perception-analyzer";
import { coverageAnalyzer } from "./coverage-analyzer";
import { readabilityAuditor } from "./readability-auditor";
import type { InsertVisibilityRun, Brand } from "@shared/schema";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromOpenAI } from "./services/llm-provider/openai/usage";
import { usageFromGemini } from "./services/llm-provider/gemini/usage";
import { isAiUsageCapExceededError } from "./services/ai-usage/cap";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";
import {
  fakeAiSleep,
  fakeDiscoveredCompetitors,
  fakeVolumeEstimates,
  fakeWeaknessReport,
  isFakeAiEnabled,
  maybeThrowFakeAiError,
} from "./services/fake-ai";

const VALID_PROMPT_TYPES = ["awareness", "consideration", "commercial"];
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;

export async function estimateSearchVolumes(
  brandId: number,
  brand: Brand,
  source: AiUsageContext["source"] = "manual",
): Promise<void> {
  try {
    const questions = await storage.getActiveUserQuestionsByBrand(brandId);
    const needsEstimate = questions.filter(q => !q.searchVolume);
    if (needsEstimate.length === 0) return;

    const region = brand.territory === "regional" && brand.location ? brand.location : "global";
    const category = brand.category || "general";

    if (isFakeAiEnabled()) {
      const fakes = fakeVolumeEstimates(`volumes:${brandId}`, needsEstimate.length);
      let updated = 0;
      for (let i = 0; i < needsEstimate.length; i++) {
        const est = fakes[i];
        await storage.updateUserQuestion(needsEstimate[i].id, {
          searchVolume: est.volume_label,
          searchVolumeMin: est.volume_min,
          searchVolumeMax: est.volume_max,
        });
        updated++;
      }
      console.log(`Search volume estimation (FAKE_AI): updated ${updated}/${needsEstimate.length} questions for brand ${brandId}`);
      return;
    }

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });

    const VOL_BATCH = 10;
    let updated = 0;

    for (let i = 0; i < needsEstimate.length; i += VOL_BATCH) {
      const batch = needsEstimate.slice(i, i + VOL_BATCH);
      const questionList = batch.map((q, idx) => `${idx + 1}. "${q.question}"`).join("\n");

      const prompt = `You are a search volume estimation expert. Estimate the monthly search traffic volume for each of the following questions/queries within the ${region} market, in the ${category} industry.

For each question, provide a tight estimated monthly search volume range. The range should be narrow (e.g., "200-350" not "100-10000"). Consider:
- How likely real users are to search this exact phrase or very similar variations
- The specificity of the query (very specific = lower volume, broad = higher)
- The market size in ${region}
- Include related semantic variations that would match this intent

Questions:
${questionList}

Respond ONLY with a JSON array of objects, one per question, in the same order:
[{"index": 1, "volume_min": 200, "volume_max": 350, "volume_label": "200-350"}]

Rules:
- volume_min and volume_max must be integers
- The range should be tight (max should be no more than 3x the min for most queries)
- Very niche B2B queries might be 10-50/month
- Broad consumer queries could be 1000-5000/month
- Be realistic, not inflated
- Return ONLY valid JSON array, no markdown`;

      try {
        const response = await executeAiCall(
          { userId: brand.userId, brandId, feature: "volume_estimation", source },
          "openai",
          "gpt-4o-mini",
          () => client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature: 0.3,
          }),
          usageFromOpenAI,
        );

        const text = response.choices[0]?.message?.content || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const estimates = JSON.parse(jsonMatch[0]);
          for (const est of estimates) {
            const idx = (est.index || 0) - 1;
            if (idx >= 0 && idx < batch.length && est.volume_min != null && est.volume_max != null) {
              await storage.updateUserQuestion(batch[idx].id, {
                searchVolume: est.volume_label || `${est.volume_min}-${est.volume_max}`,
                searchVolumeMin: est.volume_min,
                searchVolumeMax: est.volume_max,
              });
              updated++;
            }
          }
        }
      } catch (err) {
        if (isAiUsageCapExceededError(err)) throw err;
        console.error(`Volume estimation batch failed for brand ${brandId}:`, err);
      }

      if (i + VOL_BATCH < needsEstimate.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`Search volume estimation: updated ${updated}/${needsEstimate.length} questions for brand ${brandId}`);
  } catch (err) {
    if (isAiUsageCapExceededError(err)) throw err;
    console.error(`Search volume estimation failed for brand ${brandId}:`, err);
  }
}

export interface DiscoveredCompetitor {
  name: string;
  domain?: string;
  mentionCount: number;
  lastSeen: string;
}

async function extractDiscoveredCompetitors(
  brandId: number,
  source: AiUsageContext["source"] = "manual",
): Promise<void> {
  try {
    const brand = await storage.getBrand(brandId);
    if (!brand) return;

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const runs = await storage.getVisibilityRunsSince(brandId, since);
    if (runs.length === 0) return;

    const responses = runs
      .filter(r => r.rawResponse && r.rawResponse.length > 20)
      .map(r => r.rawResponse!)
      .slice(0, 50);

    if (responses.length === 0) return;

    const brandName = getBrandDisplayName(brand);
    const rawCompetitors = (brand.competitors || []).map((c: string) => c.toLowerCase().trim());
    const competitorBases = rawCompetitors.map((c: string) =>
      c.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('.')[0]
    );
    const configuredSet = new Set([...rawCompetitors, ...competitorBases]);
    const brandNameLower = brandName.toLowerCase().trim();
    const domainBase = brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('.')[0].toLowerCase();

    let extracted: Array<{ name: string; domain?: string }>;
    if (isFakeAiEnabled()) {
      await fakeAiSleep();
      maybeThrowFakeAiError("discovered competitors");
      extracted = fakeDiscoveredCompetitors(brandName);
    } else {
      const combinedText = responses.join("\n---\n").slice(0, 15000);

      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

      const prompt = `Analyze the following AI-generated responses about "${brandName}" and extract ALL brand names, company names, product names, and tool names mentioned as alternatives, competitors, or related solutions.

For each entity found, provide:
- name: The brand/company/product name (proper casing)
- domain: Their website domain if inferable (optional)

Do NOT include:
- "${brandName}" itself or variations of it
- Generic terms like "AI", "machine learning", "cloud" etc.
- Technology names that aren't products (e.g., "Python", "JavaScript")

Respond ONLY with a valid JSON array:
[{"name": "CompanyName", "domain": "company.com"}]

If no competitors found, return: []

Responses to analyze:
${combinedText}`;

      const result = await executeAiCall(
        { userId: brand.userId, brandId, feature: "competitor_research", source },
        "gemini",
        "gemini-2.5-flash",
        () => genai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt }),
        usageFromGemini,
      );

      const text = result.text || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      try {
        extracted = JSON.parse(jsonMatch[0]);
      } catch {
        return;
      }

      if (!Array.isArray(extracted) || extracted.length === 0) return;
    }

    const filtered = extracted.filter(e => {
      if (!e.name || typeof e.name !== 'string') return false;
      const nameLower = e.name.toLowerCase().trim();
      if (nameLower === brandNameLower) return false;
      if (nameLower === domainBase) return false;
      if (configuredSet.has(nameLower)) return false;
      const extractedBase = nameLower.replace(/\.(com|org|net|co|io|ai|co\.uk|com\.au|edu|gov|app|dev|us|ca|de|fr)$/i, '');
      if (configuredSet.has(extractedBase)) return false;
      if (nameLower.length < 2) return false;
      return true;
    });

    if (filtered.length === 0) return;

    const existing: DiscoveredCompetitor[] = Array.isArray(brand.discoveredCompetitors)
      ? (brand.discoveredCompetitors as DiscoveredCompetitor[])
      : [];

    const now = new Date().toISOString();
    const merged = new Map<string, DiscoveredCompetitor>();

    for (const dc of existing) {
      merged.set(dc.name.toLowerCase(), dc);
    }

    for (const e of filtered) {
      const key = e.name.toLowerCase().trim();
      const prev = merged.get(key);
      if (prev) {
        prev.mentionCount += 1;
        prev.lastSeen = now;
        if (e.domain && !prev.domain) prev.domain = e.domain;
      } else {
        merged.set(key, {
          name: e.name.trim(),
          domain: e.domain || undefined,
          mentionCount: 1,
          lastSeen: now,
        });
      }
    }

    const updatedList = Array.from(merged.values())
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 50);

    await storage.updateBrand(brandId, { discoveredCompetitors: updatedList });
    console.log(`Discovered competitors: found ${updatedList.length} for brand ${brandId}`);
  } catch (err) {
    if (isAiUsageCapExceededError(err)) throw err;
    console.error(`Discovered competitors extraction failed for brand ${brandId}:`, err);
  }
}

export function buildBrandContext(brand: Brand): BrandContext {
  return {
    territory: brand.territory,
    location: brand.location,
    category: brand.category,
    targetAudience: brand.targetAudience,
    products: brand.products,
    differentiators: brand.differentiators,
    brandTone: brand.brandTone,
  };
}

export function buildMinimalContext(brand: Brand): BrandContext {
  return {
    territory: brand.territory,
    location: brand.location,
    category: brand.category,
  };
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  onBatchComplete?: (completed: number, total: number) => void
): Promise<PromiseSettledResult<R>[]> {
  const allResults: PromiseSettledResult<R>[] = [];
  const total = items.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    const capFailure = batchResults.find(
      (result) => result.status === "rejected" && isAiUsageCapExceededError(result.reason),
    );
    if (capFailure?.status === "rejected") throw capFailure.reason;
    allResults.push(...batchResults);

    const completed = Math.min(i + batchSize, total);
    if (onBatchComplete) onBatchComplete(completed, total);

    if (i + batchSize < total) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return allResults;
}

export { extractDiscoveredCompetitors };

export const assessmentEngine = {
  async runFullScan(
    brandId: number,
    source: AiUsageContext["source"] = "manual",
  ): Promise<void> {
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error(`Brand ${brandId} not found`);

    await storage.updateBrand(brandId, { scanStatus: "running:0/1" });
    console.log(`Starting full scan for brand ${brandId} (${brand.domain})`);

    const brandName = getBrandDisplayName(brand);
    const competitors = brand.competitors || [];
    const companyName = brand.companyName;
    const fullContext = buildBrandContext(brand);
    const minimalContext = buildMinimalContext(brand);

    try {
      const visibilityRuns: InsertVisibilityRun[] = [];

      const activeQuestions = await storage.getActiveUserQuestionsByBrand(brandId);

      if (activeQuestions.length > 0) {
        const totalQuestions = activeQuestions.length;
        console.log(`Running ${totalQuestions} user questions for brand ${brandId} in batches of ${BATCH_SIZE}`);

        const questionResults = await processBatch(
          activeQuestions,
          BATCH_SIZE,
          async (uq) => {
            const isBrandQuestion = uq.questionCategory === "brand_sentiment";
            const context = isBrandQuestion ? fullContext : minimalContext;
            const results = await runPromptAcrossModels(uq.question, brandName, competitors, companyName, context, { userId: brand.userId, brandId, feature: "visibility_scan" as const, source });
            const promptType = VALID_PROMPT_TYPES.includes(uq.questionType || "") ? uq.questionType! : "consideration";
            return { uq, results, promptType };
          },
          async (completed, total) => {
            await storage.updateBrand(brandId, { scanStatus: `running:${completed}/${total}` });
            console.log(`Brand ${brandId}: completed ${completed}/${total} questions`);
          }
        );

        for (const [i, qr] of questionResults.entries()) {
          if (qr.status === "fulfilled") {
            const { uq, results, promptType } = qr.value;
            for (const result of results) {
              visibilityRuns.push({
                brandId,
                trackedTermId: uq.trackedTermId,
                userQuestionId: uq.id,
                promptText: uq.question,
                promptType,
                modelId: result.modelId,
                appeared: result.appeared,
                position: result.position,
                sentiment: result.sentiment,
                competitorsMentioned: result.competitorsMentioned,
                citationPresent: result.citationPresent,
                rawResponse: result.rawResponse,
              });
            }
          } else {
            console.error(`LLM call failed for question ${activeQuestions[i].id} (brand ${brandId}):`, qr.reason);
          }
        }
      } else {
        console.log(`No user questions found — falling back to prompt builder for brand ${brandId}`);
        const promptBatches = buildPrompts(brand);

        const batchResults = await processBatch(
          promptBatches,
          BATCH_SIZE,
          async (batch) => {
            const results = await runPromptAcrossModels(batch.promptText, brandName, competitors, companyName, fullContext, { userId: brand.userId, brandId, feature: "visibility_scan" as const, source });
            return { batch, results };
          },
          async (completed, total) => {
            await storage.updateBrand(brandId, { scanStatus: `running:${completed}/${total}` });
            console.log(`Brand ${brandId}: completed ${completed}/${total} prompt batches`);
          }
        );

        for (const [i, br] of batchResults.entries()) {
          if (br.status === "fulfilled") {
            const { batch, results } = br.value;
            for (const result of results) {
              visibilityRuns.push({
                brandId,
                promptText: batch.promptText,
                promptType: batch.promptType,
                modelId: result.modelId,
                appeared: result.appeared,
                position: result.position,
                sentiment: result.sentiment,
                competitorsMentioned: result.competitorsMentioned,
                citationPresent: result.citationPresent,
                rawResponse: result.rawResponse,
              });
            }
          } else {
            console.error(`LLM batch failed for prompt "${promptBatches[i].promptText.slice(0, 50)}..." (brand ${brandId}):`, br.reason);
          }
        }
      }

      if (visibilityRuns.length > 0) {
        await storage.bulkCreateVisibilityRuns(visibilityRuns);
        console.log(`Stored ${visibilityRuns.length} visibility runs for brand ${brandId}`);
      } else {
        console.error(`WARNING: Brand ${brandId} scan produced ZERO visibility runs — all LLM calls may have failed`);
      }

      await storage.updateBrand(brandId, { scanStatus: "running:analyzing" });
      console.log(`Brand ${brandId}: starting analysis phase (perception, coverage, readability)`);

      const analysisResults = await Promise.allSettled([
        perceptionAnalyzer.analyze(brandId, source),
        coverageAnalyzer.analyze(brandId, source),
        readabilityAuditor.audit(brandId, source),
      ]);
      for (const [i, result] of analysisResults.entries()) {
        if (result.status === "rejected") {
          if (isAiUsageCapExceededError(result.reason)) throw result.reason;
          const names = ["perceptionAnalyzer", "coverageAnalyzer", "readabilityAuditor"];
          console.error(`${names[i]} failed for brand ${brandId}:`, result.reason);
        }
      }

      console.log(`Brand ${brandId}: estimating search volumes for new questions`);
      await estimateSearchVolumes(brandId, brand, source);

      console.log(`Brand ${brandId}: extracting discovered competitors`);
      await extractDiscoveredCompetitors(brandId, source);

      await storage.updateBrand(brandId, { scanStatus: "completed" });
      console.log(`Full scan completed for brand ${brandId}`);
    } catch (err) {
      console.error(`Full scan failed for brand ${brandId}:`, err);
      await storage.updateBrand(brandId, { scanStatus: "idle" });
      throw err;
    }
  },

  async runTermScan(
    brandId: number,
    trackedTermId: number,
    termText: string,
    source: AiUsageContext["source"] = "manual",
  ): Promise<void> {
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error(`Brand ${brandId} not found`);

    await storage.updateBrand(brandId, { scanStatus: "running" });
    console.log(`Starting term scan for brand ${brandId}, term: "${termText}"`);

    const brandName = getBrandDisplayName(brand);
    const competitors = brand.competitors || [];
    const companyName = brand.companyName;
    const fullContext = buildBrandContext(brand);
    const minimalContext = buildMinimalContext(brand);

    try {
      const visibilityRuns: InsertVisibilityRun[] = [];

      const questions = await storage.getUserQuestionsByTerm(trackedTermId);
      const activeQuestions = questions.filter(q => q.isActive);

      if (activeQuestions.length > 0) {
        const termQuestionResults = await processBatch(
          activeQuestions,
          BATCH_SIZE,
          async (uq) => {
            const isBrandQuestion = uq.questionCategory === "brand_sentiment";
            const context = isBrandQuestion ? fullContext : minimalContext;
            const results = await runPromptAcrossModels(uq.question, brandName, competitors, companyName, context, { userId: brand.userId, brandId, feature: "visibility_scan" as const, source });
            const promptType = VALID_PROMPT_TYPES.includes(uq.questionType || "") ? uq.questionType! : "consideration";
            return { uq, results, promptType };
          },
          async (completed, total) => {
            console.log(`Brand ${brandId} term scan: completed ${completed}/${total} questions`);
          }
        );

        for (const [i, tqr] of termQuestionResults.entries()) {
          if (tqr.status === "fulfilled") {
            const { uq, results, promptType } = tqr.value;
            for (const result of results) {
              visibilityRuns.push({
                brandId,
                trackedTermId,
                userQuestionId: uq.id,
                promptText: uq.question,
                promptType,
                modelId: result.modelId,
                appeared: result.appeared,
                position: result.position,
                sentiment: result.sentiment,
                competitorsMentioned: result.competitorsMentioned,
                citationPresent: result.citationPresent,
                rawResponse: result.rawResponse,
              });
            }
          } else {
            console.error(`LLM call failed for question ${activeQuestions[i].id} in term scan (brand ${brandId}):`, tqr.reason);
          }
        }
      } else {
        const results = await runPromptAcrossModels(termText, brandName, competitors, companyName, fullContext, { userId: brand.userId, brandId, feature: "visibility_scan" as const, source });
        for (const result of results) {
          visibilityRuns.push({
            brandId,
            trackedTermId,
            promptText: termText,
            promptType: "consideration",
            modelId: result.modelId,
            appeared: result.appeared,
            position: result.position,
            sentiment: result.sentiment,
            competitorsMentioned: result.competitorsMentioned,
            citationPresent: result.citationPresent,
            rawResponse: result.rawResponse,
          });
        }
      }

      if (visibilityRuns.length > 0) {
        await storage.bulkCreateVisibilityRuns(visibilityRuns);
        console.log(`Stored ${visibilityRuns.length} visibility runs for term "${termText}" (brand ${brandId})`);
      }

      const termAnalysisResults = await Promise.allSettled([
        perceptionAnalyzer.analyze(brandId, source),
        coverageAnalyzer.analyze(brandId, source),
      ]);
      for (const [i, result] of termAnalysisResults.entries()) {
        if (result.status === "rejected") {
          if (isAiUsageCapExceededError(result.reason)) throw result.reason;
          const names = ["perceptionAnalyzer", "coverageAnalyzer"];
          console.error(`${names[i]} failed for brand ${brandId} term "${termText}":`, result.reason);
        }
      }

      await estimateSearchVolumes(brandId, brand, source);

      console.log(`Brand ${brandId}: extracting discovered competitors (term scan)`);
      await extractDiscoveredCompetitors(brandId, source);

      await storage.updateBrand(brandId, { scanStatus: "completed" });
      console.log(`Term scan completed for brand ${brandId}, term: "${termText}"`);
    } catch (err) {
      console.error(`Term scan failed for brand ${brandId}, term "${termText}":`, err);
      await storage.updateBrand(brandId, { scanStatus: "completed" });
      throw err;
    }
  },
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function refreshWeaknessData(brandId: number, brand: Brand): Promise<void> {
  const brandName = getBrandDisplayName(brand);
  const category = brand.category || "";
  const targetAudience = brand.targetAudience || null;
  const competitors = brand.competitors || [];

  const targets: { name: string; domain?: string }[] = [];

  targets.push({ name: brandName, domain: brand.domain });

  for (const comp of competitors) {
    const domain = comp.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const name = domain.replace(/\.(com|org|net|co|io|ai|co\.uk|com\.au|edu|gov|app|dev|us|ca|de|fr)$/i, "");
    targets.push({ name, domain });
  }

  for (const target of targets) {
    const cacheKey = target.name.toLowerCase().trim();

    try {
      const cached = await storage.getAiCache(brandId, "competitor_weakness", cacheKey);
      if (cached && cached.refreshedAt) {
        const age = Date.now() - new Date(cached.refreshedAt).getTime();
        if (age < THIRTY_DAYS_MS) {
          console.log(`[WeaknessRefresh] Skipping "${target.name}" for brand ${brandId} — cache is fresh (${Math.round(age / 86400000)}d old)`);
          continue;
        }
      }

      console.log(`[WeaknessRefresh] Researching weaknesses for "${target.name}" (brand ${brandId})`);

      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError(`weakness refresh ${target.name}`);
        await storage.upsertAiCache(brandId, "competitor_weakness", cacheKey, fakeWeaknessReport(target.name));
        console.log(`[WeaknessRefresh] Cached FAKE_AI weakness data for "${target.name}" (brand ${brandId})`);
        continue;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const domainContext = target.domain ? ` (website: ${target.domain})` : "";
      const prompt = `Using Google Search, research real customer complaints, negative reviews, and known problems with "${target.name}"${domainContext}.

Search for reviews on G2, Capterra, Trustpilot, Reddit complaints, known issues/bugs, and why customers leave "${target.name}".

Context: This analysis is for "${brandName}"${category ? ` (in the ${category} space)` : ""}${targetAudience ? `, who serves ${targetAudience}` : ""}. Focus on weaknesses that are most relevant to ${brandName}'s target customers.

Based on what you find in search results, return this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "summary": "A 2-3 sentence factual overview based ONLY on what was found in search results.",
  "overallSentiment": "positive|mixed|negative",
  "reviewScore": "The actual review score found in search results (e.g. '4.2/5 on G2') or null if none was found",
  "complaints": [
    {
      "category": "Category name (e.g. 'Customer Support', 'Pricing', 'Product Reliability')",
      "severity": "high|medium|low",
      "detail": "The specific complaint as described in search results. Quote or closely paraphrase what reviewers actually said.",
      "frequency": "How common based on what search results indicate",
      "source": "The specific platform or website where this was found"
    }
  ],
  "vulnerabilities": [
    "A specific vulnerability identified from search results"
  ],
  "customerChurnReasons": [
    "A specific reason customers leave, based on search results"
  ]
}

Rules:
- Report ONLY what you actually find in search results — do NOT fabricate complaints
- For each complaint, cite which website or review platform it came from
- Include actual review scores from G2, Capterra, or Trustpilot if found
- If search results are thin on negative feedback, include fewer items rather than fabricating
- Order complaints by severity (high first)
- Return ONLY valid JSON`;

      let text = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await executeAiCall(
            { userId: brand.userId, brandId, feature: "data_freshness" },
            "gemini",
            "gemini-2.5-flash",
            () => client.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config: { tools: [{ googleSearch: {} }] },
            }),
            usageFromGemini,
            { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
          );
          text = response.text?.trim() || "";
          if (text) break;
        } catch (err: any) {
          console.log(`[WeaknessRefresh] Attempt ${attempt + 1} failed for "${target.name}": ${err?.message}`);
          if (attempt === 1) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!text) {
        console.warn(`[WeaknessRefresh] No results for "${target.name}", skipping`);
        continue;
      }

      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error(`[WeaknessRefresh] JSON parse failed for "${target.name}"`);
        parsed = {
          summary: cleaned.slice(0, 500),
          overallSentiment: "mixed",
          reviewScore: null,
          complaints: [],
          vulnerabilities: [],
          customerChurnReasons: [],
        };
      }

      await storage.upsertAiCache(brandId, "competitor_weakness", cacheKey, parsed);
      console.log(`[WeaknessRefresh] Cached weakness data for "${target.name}" (brand ${brandId})`);

      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`[WeaknessRefresh] Failed for "${target.name}" (brand ${brandId}):`, err);
    }
  }
}
