import { db } from "../../db";
import { aiUsageLogs } from "@shared/schema";
import type { BillableUsage } from "@shared/ai-billing";
import { computeCostMicroUsd } from "./pricing";
import { normalizeTokenUsage } from "./tokens";
import { invalidateAiUsageCycleSpend } from "./cycle";
import { aiJobAccountLockQuery } from "../ai-jobs/account-lock";
import type { AiProvider } from "@shared/ai-billing";
import type { AiJobCallAttribution } from "../ai-jobs/admission";
import type { AiUsageContext, AiUsageDependencies } from "./types";


/**
 * Record a completed LLM call. Fire-and-forget: never throws or rejects into
 * the calling flow; failures are logged in full for observability.
 */
export async function persistAiUsage(
  ctx: AiUsageContext,
  provider: AiProvider,
  model: string,
  usage: BillableUsage,
  attribution?: AiJobCallAttribution,
  dependencies: AiUsageDependencies = {},
): Promise<void> {
  const database = dependencies.database ?? db;
  const normalizedUsage: BillableUsage = { ...usage, tokens: normalizeTokenUsage(usage.tokens) };

  // Compute the cost and priced meters for the usage.
  // This will throw if the usage is invalid or if there are any issues with pricing.
  const priced = await computeCostMicroUsd(provider, model, normalizedUsage, dependencies);
  const createdAt = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(createdAt.getTime())) throw new RangeError("now must return a valid date");
  await database.transaction(async (transaction) => {
    await transaction.execute(aiJobAccountLockQuery(ctx.userId));
    await transaction.insert(aiUsageLogs).values({
      userId: ctx.userId,
      brandId: ctx.brandId ?? null,
      jobId: attribution?.jobId ?? null,
      callIndex: attribution?.callIndex ?? null,
      feature: ctx.feature,
      provider,
      model,
      inputTokens: normalizedUsage.tokens.inputTokens,
      outputTokens: normalizedUsage.tokens.outputTokens,
      thinkingTokens: normalizedUsage.tokens.thinkingTokens,
      cacheReadTokens: normalizedUsage.tokens.cacheReadTokens,
      cacheWriteTokens: normalizedUsage.tokens.cacheWriteTokens,
      cacheWrite1hTokens: normalizedUsage.tokens.cacheWrite1hTokens,
      meters: priced.meters,
      costMicroUsd: priced.costMicroUsd,
      createdAt,
    });
  });
  invalidateAiUsageCycleSpend(ctx.userId);
}

export function reportLoggingFailure(
  ctx: AiUsageContext,
  provider: AiProvider,
  model: string,
  usage: BillableUsage,
  err: unknown,
): void {
  console.error("[ai-usage] FAILED to record usage — data point lost", {
    userId: ctx.userId,
    brandId: ctx.brandId ?? null,
    feature: ctx.feature,
    provider,
    model,
    ...usage.tokens,
    meters: usage.meters,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });
}
