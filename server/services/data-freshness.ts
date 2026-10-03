import type { IStorage } from "../storage";
import type { VisibilityRun, PerceptionProfile, CoverageGap, ReadabilityAudit } from "@shared/schema";
import { executeAiCall } from "./ai-usage";
import { usageFromGemini } from "./llm-provider/gemini/usage";
import { isAiUsageCapExceededError } from "./ai-usage/cap";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";
import { fakeAiSleep, fakeWeaknessReport, isFakeAiEnabled, maybeThrowFakeAiError } from "./fake-ai";

export interface FreshDataBundle {
  visibilityRuns: VisibilityRun[];
  perceptionProfile: PerceptionProfile | undefined;
  coverageGap: CoverageGap | undefined;
  readabilityAudit: ReadabilityAudit | undefined;
  competitorWeaknesses: Record<string, any>;
  dataRefreshed: boolean;
}

const DATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(timestamp: Date | string | null | undefined): boolean {
  if (!timestamp) return true;
  const age = Date.now() - new Date(timestamp).getTime();
  return age > DATA_MAX_AGE_MS;
}

async function refreshCompetitorWeakness(
  brandId: number,
  competitorName: string,
  brand: any,
  storage: IStorage
): Promise<any> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError(`weakness refresh ${competitorName}`);
    const fake = fakeWeaknessReport(competitorName);
    await storage.upsertAiCache(brandId, "competitor_weakness", competitorName.toLowerCase().trim(), fake);
    return fake;
  }
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const brandName = brand.domain
    ? brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : "";

  const searchPrompt = `Search the web thoroughly for real customer complaints, negative reviews, and known problems with "${competitorName}".

Specifically search for:
- "${competitorName}" reviews on G2
- "${competitorName}" reviews on Capterra
- "${competitorName}" reviews on Trustpilot
- "${competitorName}" complaints on Reddit
- "${competitorName}" problems OR issues OR bugs
- "${competitorName}" vs competitors comparison
- why customers leave "${competitorName}"

${brandName ? `Context: This analysis is for "${brandName}"${brand.category ? ` (in the ${brand.category} space)` : ""}, who competes with ${competitorName}.` : ""}

Report ONLY what you actually find in search results. For each complaint or issue you find, cite which website or review platform it came from. Include actual review scores from G2, Capterra, or Trustpilot if they appear in search results.

Do NOT make up or fabricate any complaints. If you cannot find real negative feedback about this company, say so clearly.`;

  let searchResults = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const searchResponse = await executeAiCall(
        { userId: brand.userId, brandId, feature: "data_freshness" },
        "gemini",
        "gemini-2.5-flash",
        () => client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: searchPrompt,
          config: { tools: [{ googleSearch: {} }] },
        }),
        usageFromGemini,
        { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
      );
      searchResults = searchResponse.text?.trim() || "";
      if (searchResults) break;
      console.log(`[DataFreshness] Weakness search attempt ${attempt + 1} empty for ${competitorName}`);
    } catch (err: any) {
      if (isAiUsageCapExceededError(err)) throw err;
      console.log(`[DataFreshness] Weakness search attempt ${attempt + 1} failed for ${competitorName}: ${err?.message}`);
      if (attempt === 1) return null;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!searchResults) return null;

  const structurePrompt = `You are given real search results about "${competitorName}" gathered from the web. Your job is to structure this information into a JSON format. Do NOT add any information that isn't in the search results below.

=== SEARCH RESULTS ===
${searchResults}
=== END SEARCH RESULTS ===

Structure the findings into this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "summary": "A 2-3 sentence factual overview based ONLY on what was found in the search results above.",
  "overallSentiment": "positive|mixed|negative",
  "reviewScore": "The actual review score found in search results (e.g. '4.2/5 on G2') or null if none was found",
  "complaints": [
    {
      "category": "Category name (e.g. 'Customer Support', 'Pricing', 'Product Reliability')",
      "severity": "high|medium|low",
      "detail": "The specific complaint as described in the search results.",
      "frequency": "How common based on what the search results indicate",
      "source": "The specific platform or website where this was found"
    }
  ],
  "vulnerabilities": [
    "A specific vulnerability identified from the search results"
  ],
  "customerChurnReasons": [
    "A specific reason customers leave, based on the search results"
  ]
}

Rules:
- ONLY include complaints, vulnerabilities, and churn reasons that are supported by the search results above
- If the search results are thin on negative feedback, include fewer items rather than fabricating
- Order complaints by severity (high first)
- Return ONLY valid JSON`;

  const structureResponse = await executeAiCall(
    { userId: brand.userId, brandId, feature: "data_freshness" },
    "gemini",
    "gemini-2.5-flash",
    () => client.models.generateContent({ model: "gemini-2.5-flash", contents: structurePrompt }),
    usageFromGemini,
  );

  const text = structureResponse.text?.trim() || "";
  if (!text) return null;

  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(`Failed to parse competitor weakness JSON for ${competitorName}`);
    return null;
  }

  await storage.upsertAiCache(brandId, "competitor_weakness", competitorName.toLowerCase().trim(), parsed);
  return parsed;
}

export async function ensureFreshData(
  brandId: number,
  storage: IStorage
): Promise<FreshDataBundle> {
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    return {
      visibilityRuns: [],
      perceptionProfile: undefined,
      coverageGap: undefined,
      readabilityAudit: undefined,
      competitorWeaknesses: {},
      dataRefreshed: false,
    };
  }

  const refreshCheck = await storage.getAiCache(brandId, "data_refresh_timestamp", "last_refresh");
  const alreadyRefreshedRecently = refreshCheck && !isStale(refreshCheck.refreshedAt);

  const [visibilityRuns, perceptionProfile, coverageGap, readabilityAudit, cachedWeaknesses] = await Promise.all([
    storage.getVisibilityRunsByBrand(brandId),
    storage.getPerceptionProfile(brandId),
    storage.getCoverageGap(brandId),
    storage.getReadabilityAudit(brandId),
    storage.getAiCacheByBrandAndType(brandId, "competitor_weakness"),
  ]);

  const hasMissingData = !perceptionProfile || !coverageGap || !readabilityAudit;

  if (alreadyRefreshedRecently && !hasMissingData) {
    const competitorWeaknesses: Record<string, any> = {};
    for (const entry of cachedWeaknesses) {
      competitorWeaknesses[entry.cacheKey] = entry.data;
    }
    return {
      visibilityRuns,
      perceptionProfile,
      coverageGap,
      readabilityAudit,
      competitorWeaknesses,
      dataRefreshed: false,
    };
  }

  let dataRefreshed = false;

  const refreshPromises: Promise<void>[] = [];

  if (!perceptionProfile || isStale(perceptionProfile?.lastUpdated)) {
    dataRefreshed = true;
    refreshPromises.push(
      import("../perception-analyzer")
        .then(mod => mod.perceptionAnalyzer.analyze(brandId))
        .then(async () => {
          await storage.upsertAiCache(brandId, "weekly_cadence", "perception", { lastRun: new Date().toISOString() });
        })
        .catch(err => {
          if (isAiUsageCapExceededError(err)) throw err;
          console.error("Failed to refresh perception profile:", err?.message || err);
        })
    );
  }

  if (!coverageGap || isStale(coverageGap?.lastUpdated)) {
    dataRefreshed = true;
    refreshPromises.push(
      import("../coverage-analyzer")
        .then(mod => mod.coverageAnalyzer.analyze(brandId))
        .then(async () => {
          await storage.upsertAiCache(brandId, "weekly_cadence", "coverage", { lastRun: new Date().toISOString() });
        })
        .catch(err => {
          if (isAiUsageCapExceededError(err)) throw err;
          console.error("Failed to refresh coverage gaps:", err?.message || err);
        })
    );
  }

  if (!readabilityAudit || isStale(readabilityAudit?.lastUpdated)) {
    dataRefreshed = true;
    refreshPromises.push(
      import("../readability-auditor")
        .then(mod => mod.readabilityAuditor.audit(brandId).then(() => {}))
        .then(async () => {
          await storage.upsertAiCache(brandId, "weekly_cadence", "readability", { lastRun: new Date().toISOString() });
        })
        .catch(err => {
          if (isAiUsageCapExceededError(err)) throw err;
          console.error("Failed to refresh readability audit:", err?.message || err);
        })
    );
  }

  const competitors = (brand.competitors as string[]) || [];
  const competitorWeaknesses: Record<string, any> = {};
  const weaknessRefreshPromises: Promise<void>[] = [];

  for (const entry of cachedWeaknesses) {
    competitorWeaknesses[entry.cacheKey] = entry.data;
  }

  for (const competitor of competitors) {
    const key = competitor.toLowerCase().trim();
    const existing = cachedWeaknesses.find(c => c.cacheKey === key);
    if (!existing || isStale(existing.refreshedAt)) {
      dataRefreshed = true;
      weaknessRefreshPromises.push(
        refreshCompetitorWeakness(brandId, competitor, brand, storage)
          .then(result => {
            if (result) competitorWeaknesses[key] = result;
          })
          .catch(err => {
            if (isAiUsageCapExceededError(err)) throw err;
            console.error(`Failed to refresh competitor weakness for ${competitor}:`, err?.message || err);
          })
      );
    }
  }

  refreshPromises.push(...weaknessRefreshPromises);

  const discoveredCache = await storage.getAiCache(brandId, "weekly_cadence", "discovered_competitors");
  const discoveredStale = !discoveredCache || !discoveredCache.refreshedAt || isStale(discoveredCache.refreshedAt);
  if (discoveredStale) {
    dataRefreshed = true;
    refreshPromises.push(
      import("../assessment-engine")
        .then(mod => mod.extractDiscoveredCompetitors(brandId))
        .then(async () => {
          await storage.upsertAiCache(brandId, "weekly_cadence", "discovered_competitors", { lastRun: new Date().toISOString() });
        })
        .catch(err => {
          if (isAiUsageCapExceededError(err)) throw err;
          console.error("Failed to refresh discovered competitors:", err?.message || err);
        })
    );
  }

  if (refreshPromises.length > 0) {
    const refreshResults = await Promise.allSettled(refreshPromises);
    const capFailure = refreshResults.find(
      (result) => result.status === "rejected" && isAiUsageCapExceededError(result.reason),
    );
    if (capFailure?.status === "rejected") throw capFailure.reason;
  }

  const [freshPerception, freshCoverage, freshAudit] = await Promise.all([
    (!perceptionProfile || isStale(perceptionProfile?.lastUpdated)) ? storage.getPerceptionProfile(brandId) : Promise.resolve(perceptionProfile),
    (!coverageGap || isStale(coverageGap?.lastUpdated)) ? storage.getCoverageGap(brandId) : Promise.resolve(coverageGap),
    (!readabilityAudit || isStale(readabilityAudit?.lastUpdated)) ? storage.getReadabilityAudit(brandId) : Promise.resolve(readabilityAudit),
  ]);

  if (dataRefreshed) {
    await storage.upsertAiCache(brandId, "data_refresh_timestamp", "last_refresh", { refreshedAt: new Date().toISOString() });
  }

  return {
    visibilityRuns,
    perceptionProfile: freshPerception,
    coverageGap: freshCoverage,
    readabilityAudit: freshAudit,
    competitorWeaknesses,
    dataRefreshed,
  };
}
