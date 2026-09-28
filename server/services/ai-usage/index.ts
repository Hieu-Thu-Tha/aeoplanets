/**
 * AI usage logging: records one ai_usage_logs row per LLM completion call,
 * with real token counts read from each SDK's response and a cost snapshot
 * priced from the live (admin-editable) model pricing in system config.
 *
 * Customer-attributable logging is awaited so later calls and job finalization
 * observe the committed usage row. System logging remains fire-and-forget.
 * Logging failures never discard a provider response, but are reported in full.
 */
import {
  canonicalizeExpectedMeters,
  providerForMeter,
  type BillableUsage,
  type ExpectedMeter,
} from "@shared/ai-billing";
import type { AiProvider } from "@shared/ai-billing";
import { getAiUsageCapStatus, AiUsageCapExceededError } from "./cap";
import {
  aiJobAdmissionStorage,
  aiJobBackgroundWorkStorage,
  ensureAiJobReservation,
  finalizeAdmission,
  type AiJobCallAttribution,
} from "../ai-jobs/admission";
import type { AiUsageContext, AiUsageDependencies } from "./types";
import { validateObservedMeters } from "./pricing";
import { persistAiUsage, reportLoggingFailure } from "./store";


export { computeCostMicroUsd } from "./pricing";
export { type ComputedAiUsageCost } from "./types";
export { computeTokenCostMicroUsd } from "./tokens";
export { AI_FEATURES, type AiFeature, type AiJobContext, type AiUsageContext, type AiUsageDependencies } from "./types";
export type { BillableUsage, TokenUsage } from "@shared/ai-billing";


/**
 * Complete provider path: ensure the shared reservation, assign invocation
 * order, execute the provider, then persist measured customer usage.
 * Logging failures remain non-fatal to the completed AI operation.
 */
export async function executeAiCall<T>(
  ctx: AiUsageContext | undefined,
  provider: AiProvider,
  model: string,
  call: () => Promise<T>,
  extractUsage: (response: T, expectedMeters: readonly ExpectedMeter[]) => BillableUsage,
  dependencies: AiUsageDependencies = {},
): Promise<T> {
  const expectedMeters = canonicalizeExpectedMeters(dependencies.expectedMeters);
  if (expectedMeters.some((meter) => providerForMeter(meter) !== provider)) {
    throw new TypeError(`Expected meter does not belong to provider: ${provider}`);
  }
  const resolvedDependencies = { ...dependencies, expectedMeters };
  const activeAdmission = aiJobAdmissionStorage.getStore();
  const admission = ctx && activeAdmission?.accountOwnerId === ctx.userId
    ? activeAdmission
    : undefined;
  let attribution: AiJobCallAttribution | undefined;
  let tracksActiveCall = false;

  try {
    if (ctx && ctx.source !== "system") {
      if (admission) {
        const isRegisteredBackgroundWork = aiJobBackgroundWorkStorage.getStore() === true;
        if (admission.state.responseFinished && !isRegisteredBackgroundWork) {
          throw new Error("AI job admission is already closed");
        }
        admission.state.activeCalls += 1;
        tracksActiveCall = true;
        const callIndex = admission.state.nextCallIndex;
        admission.state.nextCallIndex += 1;
        const reservation = await ensureAiJobReservation(
          { ...ctx, provider, model, meters: expectedMeters },
          { allowResponseFinished: true },
        );
        if (admission.state.responseFinished && !isRegisteredBackgroundWork) {
          throw new Error("AI job admission closed before the provider call started");
        }
        attribution = { jobId: reservation.job.id, callIndex };
      } else if (ctx.source === "scheduled") {
        throw new Error("Scheduled AI usage requires an active admission");
      } else {
        const status = await getAiUsageCapStatus(ctx.userId);
        if (status.status === "blocked") throw new AiUsageCapExceededError(status);
      }
    }

    const response = await call();
    if (!ctx) return response;

    if (admission && attribution) {
      admission.state.completedCallIndexes.add(attribution.callIndex);
    }
    const usage = validateObservedMeters(
      provider,
      extractUsage(response, expectedMeters),
      expectedMeters,
    );
    const persistence = persistAiUsage(
      ctx,
      provider,
      model,
      usage,
      attribution,
      resolvedDependencies,
    ).catch((error) => {
      reportLoggingFailure(ctx, provider, model, usage, error);
    });

    if (ctx.source === "system") {
      void persistence;
    } else {
      await persistence;
    }
    return response;
  } finally {
    if (admission && tracksActiveCall) {
      admission.state.activeCalls -= 1;
      void finalizeAdmission(admission);
    }
  }
}
