import { storage } from "./storage";
import { buildPrompts, getBrandDisplayName } from "./prompt-builder";
import { runPromptAcrossModels, runPromptForDailyModel } from "./llm-runner";
import { buildBrandContext, buildMinimalContext, estimateSearchVolumes } from "./assessment-engine";
import { changeMonitor } from "./change-monitor";
import { perceptionAnalyzer } from "./perception-analyzer";
import { coverageAnalyzer } from "./coverage-analyzer";
import { readabilityAuditor } from "./readability-auditor";
import type { InsertVisibilityRun } from "@shared/schema";
import { isAiUsageCapExceededError } from "./services/ai-usage/cap";
import { runScheduledAiJob } from "./services/ai-jobs/admission";

const VALID_PROMPT_TYPES = ["awareness", "consideration", "commercial"];
const INACTIVE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const WEEKLY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

async function isBrandActive(brandId: number, brand: { createdAt: Date | null; userId: string }): Promise<boolean> {
  try {
    const brandAccess = await storage.getAiCache(brandId, "brand_activity", "last_access");
    if (brandAccess?.refreshedAt) {
      const age = Date.now() - new Date(brandAccess.refreshedAt).getTime();
      if (age < INACTIVE_THRESHOLD_MS) return true;
    }

    if (brand.createdAt) {
      const age = Date.now() - new Date(brand.createdAt).getTime();
      if (age < INACTIVE_THRESHOLD_MS) return true;
    }

    return false;
  } catch {
    return false;
  }
}

function isSunday(): boolean {
  return new Date().getDay() === 0;
}

async function shouldRunWeeklyAnalysis(brandId: number, analysisType: string): Promise<boolean> {
  try {
    const cache = await storage.getAiCache(brandId, "weekly_cadence", analysisType);
    if (!cache || !cache.refreshedAt) return true;
    const age = Date.now() - new Date(cache.refreshedAt).getTime();
    return age > WEEKLY_THRESHOLD_MS;
  } catch {
    return true;
  }
}

async function markWeeklyAnalysisRun(brandId: number, analysisType: string): Promise<void> {
  try {
    await storage.upsertAiCache(brandId, "weekly_cadence", analysisType, { lastRun: new Date().toISOString() });
  } catch (err) {
    console.warn(`Daily: failed to mark weekly cadence for ${analysisType} brand ${brandId}:`, err);
  }
}

async function runDailyChecks(): Promise<void> {
  console.log("Daily scheduler: starting visibility checks");

  let brands: Awaited<ReturnType<typeof storage.getAllBrands>>;
  try {
    brands = await storage.getAllBrands();
  } catch (err) {
    console.error("Daily scheduler: failed to fetch brands:", err);
    return;
  }

  const runAllModels = isSunday();
  let skippedInactive = 0;
  let skippedIncomplete = 0;
  let processed = 0;

  for (const brand of brands) {
    if (brand.scanStatus !== "completed") {
      console.log(`Skipping brand ${brand.id} (${brand.domain}) - scan not completed`);
      skippedIncomplete++;
      continue;
    }

    try {
      const brandOwner = await storage.getUser(brand.userId);
      if (brandOwner?.accountType === "admin_provisioned") {
        console.log(`Skipping brand ${brand.id} (${brand.domain}) - admin provisioned trial account`);
        skippedInactive++;
        continue;
      }
    } catch (err) {
      console.warn(`Skipping brand ${brand.id} (${brand.domain}) - could not verify owner account type:`, err);
      skippedInactive++;
      continue;
    }

    const active = await isBrandActive(brand.id, brand);
    if (!active) {
      console.log(`Skipping brand ${brand.id} (${brand.domain}) - no user activity in last 14 days`);
      skippedInactive++;
      continue;
    }

    processed++;

    const brandName = getBrandDisplayName(brand);
    const competitors = brand.competitors || [];
    const companyName = brand.companyName;
    const fullContext = buildBrandContext(brand);
    const minimalContext = buildMinimalContext(brand);

    try {
      try {
        await runScheduledAiJob({
          userId: brand.userId,
          brandId: brand.id,
          feature: "visibility_scan",
        }, async () => {
          const visibilityRuns: InsertVisibilityRun[] = [];
          const activeQuestions = await storage.getActiveUserQuestionsByBrand(brand.id);
          let promptResults: PromiseSettledResult<void>[];

          if (activeQuestions.length > 0) {
            console.log(`Daily: running ${activeQuestions.length} user questions for brand ${brand.id}`);
            promptResults = await Promise.allSettled(
              activeQuestions.map(async (uq) => {
                const isBrandQuestion = uq.questionCategory === "brand_sentiment";
                const context = isBrandQuestion ? fullContext : minimalContext;
                const usageCtx = { userId: brand.userId, brandId: brand.id, feature: "visibility_scan" as const, source: "scheduled" as const };
                const results = runAllModels
                  ? await runPromptAcrossModels(uq.question, brandName, competitors, companyName, context, usageCtx)
                  : await runPromptForDailyModel(uq.question, brandName, competitors, companyName, context, usageCtx);
                const promptType = VALID_PROMPT_TYPES.includes(uq.questionType || "") ? uq.questionType! : "consideration";
                for (const result of results) {
                  visibilityRuns.push({
                    brandId: brand.id,
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
              })
            );
          } else {
            console.log(`No user questions for brand ${brand.id} — falling back to prompt builder`);
            const promptBatches = buildPrompts(brand);
            promptResults = await Promise.allSettled(
              promptBatches.map(async (batch) => {
                const usageCtx = { userId: brand.userId, brandId: brand.id, feature: "visibility_scan" as const, source: "scheduled" as const };
                const results = runAllModels
                  ? await runPromptAcrossModels(batch.promptText, brandName, competitors, companyName, minimalContext, usageCtx)
                  : await runPromptForDailyModel(batch.promptText, brandName, competitors, companyName, minimalContext, usageCtx);
                for (const result of results) {
                  visibilityRuns.push({
                    brandId: brand.id,
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
              })
            );
          }

          const quotaFailure = promptResults.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected" && isAiUsageCapExceededError(result.reason),
          );
          if (quotaFailure) throw quotaFailure.reason;

          if (visibilityRuns.length > 0) {
            await storage.bulkCreateVisibilityRuns(visibilityRuns);
          }
        });
      } catch (error) {
        if (!isAiUsageCapExceededError(error)) throw error;
        console.log(`Daily: visibility scan blocked by AI quota for brand ${brand.id}`);
      }

      await changeMonitor.detectChanges(brand.id);

      const analysisPromises: Promise<void>[] = [];
      const analysisNames: string[] = [];

      if (await shouldRunWeeklyAnalysis(brand.id, "perception")) {
        analysisPromises.push(
          runScheduledAiJob({ userId: brand.userId, brandId: brand.id, feature: "perception" }, () =>
            perceptionAnalyzer.analyze(brand.id, "scheduled")
              .then(() => markWeeklyAnalysisRun(brand.id, "perception")),
          )
        );
        analysisNames.push("perceptionAnalyzer");
      }
      if (await shouldRunWeeklyAnalysis(brand.id, "coverage")) {
        analysisPromises.push(
          runScheduledAiJob({ userId: brand.userId, brandId: brand.id, feature: "coverage" }, () =>
            coverageAnalyzer.analyze(brand.id, "scheduled")
              .then(() => markWeeklyAnalysisRun(brand.id, "coverage")),
          )
        );
        analysisNames.push("coverageAnalyzer");
      }
      if (await shouldRunWeeklyAnalysis(brand.id, "readability")) {
        analysisPromises.push(
          runScheduledAiJob({ userId: brand.userId, brandId: brand.id, feature: "readability_audit" }, () =>
            readabilityAuditor.audit(brand.id, "scheduled")
              .then(() => markWeeklyAnalysisRun(brand.id, "readability")),
          )
        );
        analysisNames.push("readabilityAuditor");
      }

      if (analysisPromises.length > 0) {
        console.log(`Daily: running weekly analyses for brand ${brand.id}: ${analysisNames.join(", ")}`);
        const analysisResults = await Promise.allSettled(analysisPromises);
        for (let i = 0; i < analysisResults.length; i++) {
          if (analysisResults[i].status === "rejected") {
            console.error(`Daily: ${analysisNames[i]} failed for brand ${brand.id}:`, (analysisResults[i] as PromiseRejectedResult).reason);
          }
        }
      } else {
        console.log(`Daily: skipping weekly analyses for brand ${brand.id} — not yet due`);
      }

      console.log(`Daily: estimating search volumes for brand ${brand.id}`);
      await runScheduledAiJob({
        userId: brand.userId,
        brandId: brand.id,
        feature: "volume_estimation",
      }, () => estimateSearchVolumes(brand.id, brand, "scheduled"));

      console.log(`Daily check completed for brand ${brand.id} (${brand.domain})`);
    } catch (err) {
      console.error(`Daily check failed for brand ${brand.id}:`, err);
    }
  }

  console.log(`Daily scheduler: all brands processed (${processed} active, ${skippedInactive} skipped as inactive, ${skippedIncomplete} skipped as incomplete)`);
}

function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function startDailyScheduler(): void {
  const msUntilMidnight = getMsUntilMidnight();
  console.log(`Daily scheduler: next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);

  setTimeout(async () => {
    await runDailyChecks();
    setInterval(runDailyChecks, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
