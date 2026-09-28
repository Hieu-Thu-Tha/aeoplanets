import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler, Response } from "express";
import type { AiFeature, AiJobContext } from "../ai-usage";
import {
  finishAiJobReservation,
  reserveAiJob,
} from "./reservation";
import {
  getAiJobMaxOvershootMicroUsd,
} from "../system-config";
import { getEstimatedAiJobCostMicroUsd } from "../ai-cost-estimation";
import type { AiProvider } from "@shared/ai-billing";
import {
  canonicalizeExpectedMeters,
  type ExpectedMeter,
} from "@shared/ai-billing";
import { isAiUsageCapExceededError } from "../ai-usage/cap";
import { notifyScheduledAiQuotaBlocked } from "../scheduled-ai-quota-notification";

type ReservationResult = Awaited<ReturnType<typeof reserveAiJob>>;
type ReserveAiJob = typeof reserveAiJob;
type FinishAiJobReservation = typeof finishAiJobReservation;
type GetAiJobCostMicroUsd = (
  feature: AiFeature,
  provider?: AiProvider,
  model?: string,
  meters?: readonly ExpectedMeter[],
) => Promise<number>;
export type AiJobReservationContext = AiJobContext & (
  | { provider: AiProvider; model: string; meters?: ExpectedMeter[] }
  | { provider?: undefined; model?: undefined; meters?: undefined }
);

export type AiJobAdmissionState = {
  reservation?: Promise<ReservationResult>;
  response?: Response;
  responseFinished: boolean;
  responseFailed: boolean;
  backgroundJobs: number;
  backgroundFailed: boolean;
  activeCalls: number;
  nextCallIndex: number;
  completedCallIndexes: Set<number>;
  finalization?: Promise<void>;
};

export type AiJobCallAttribution = {
  jobId: string;
  callIndex: number;
};

type AiJobAdmission = Readonly<{
  accountOwnerId: string;
  feature?: AiFeature;
  reserve: ReserveAiJob;
  finish: FinishAiJobReservation;
  getReservationCost: GetAiJobCostMicroUsd;
  getMaxOvershootCost: GetAiJobCostMicroUsd;
  state: AiJobAdmissionState;
}>;

export type AiJobAdmissionOptions = {
  feature?: AiFeature;
  reserve?: ReserveAiJob;
  finish?: FinishAiJobReservation;
  getReservationCost?: GetAiJobCostMicroUsd;
  getMaxOvershootCost?: GetAiJobCostMicroUsd;
};

type ScheduledAiJobOptions = {
  notifyBlocked?: typeof notifyScheduledAiQuotaBlocked;
  admission?: Omit<AiJobAdmissionOptions, "feature">;
};

export const aiJobAdmissionStorage = new AsyncLocalStorage<AiJobAdmission>();
export const aiJobBackgroundWorkStorage = new AsyncLocalStorage<true>();

function currentAdmission(accountOwnerId?: string): AiJobAdmission | undefined {
  const admission = aiJobAdmissionStorage.getStore();
  if (!admission) return undefined;
  if (accountOwnerId && admission.accountOwnerId !== accountOwnerId) return undefined;
  return admission;
}

export async function finalizeAdmission(admission: AiJobAdmission): Promise<void> {
  const { state } = admission;
  if (
    !state.responseFinished
    || state.backgroundJobs > 0
    || state.activeCalls > 0
    || state.finalization
  ) return;

  state.finalization = (async () => {
    if (!state.reservation) return;
    let result: ReservationResult;
    try {
      result = await state.reservation;
    } catch {
      return;
    }

    const status = state.responseFailed || state.backgroundFailed ? "failed" : "completed";
    await admission.finish(
      result.job.id,
      admission.accountOwnerId,
      status,
      state.completedCallIndexes.size,
    );
  })().catch((error) => {
    console.error("[ai-job-admission] FAILED to finalize reservation", error);
  });

  await state.finalization;
}

/** Run one operation inside a trusted, account-scoped AI job context. */
export function runWithAiJobAdmission<T>(
  accountOwnerId: string,
  operation: () => T,
  options: AiJobAdmissionOptions = {},
): T {
  if (!accountOwnerId) {
    throw new TypeError("accountOwnerId is required to admit an AI job");
  }

  const admission: AiJobAdmission = Object.freeze({
    accountOwnerId,
    feature: options.feature,
    reserve: options.reserve ?? reserveAiJob,
    finish: options.finish ?? finishAiJobReservation,
    getReservationCost: options.getReservationCost ?? getEstimatedAiJobCostMicroUsd,
    getMaxOvershootCost: options.getMaxOvershootCost ?? getAiJobMaxOvershootMicroUsd,
    state: {
      responseFinished: false,
      responseFailed: false,
      backgroundJobs: 0,
      backgroundFailed: false,
      activeCalls: 0,
      nextCallIndex: 0,
      completedCallIndexes: new Set<number>(),
    },
  });
  return aiJobAdmissionStorage.run(admission, operation);
}

export function createAiJobAdmissionMiddleware(
  getOwnerId: (req: Parameters<RequestHandler>[0]) => string,
  getFeature?: (req: Parameters<RequestHandler>[0]) => AiFeature | undefined,
): RequestHandler {
  return (req, res, next) => {
    try {
      const accountOwnerId = getOwnerId(req);
      runWithAiJobAdmission(accountOwnerId, () => {
        attachAiJobAdmissionToResponse(res);
        next();
      }, { feature: getFeature?.(req) });
    } catch (error) {
      console.error("[ai-job-admission] FAILED to initialize AI job admission", error);
      res.status(503).json({
        code: "AI_USAGE_CHECK_FAILED",
        message: "We could not verify your AI allowance. Please try again shortly.",
      });
    }
  };
}

/** Return true only inside a server-created admission for this account. */
export function hasValidAiJobAdmission(accountOwnerId: string): boolean {
  return !!currentAdmission(accountOwnerId);
}

export async function runScheduledAiJob<T>(
  ctx: AiJobContext,
  operation: () => Promise<T>,
  options: ScheduledAiJobOptions = {},
): Promise<T> {
  try {
    return await runWithAiJobAdmission(ctx.userId, async () => {
      const admission = currentAdmission(ctx.userId)!;
      try {
        const result = await operation();
        admission.state.responseFinished = true;
        await finalizeAdmission(admission);
        return result;
      } catch (error) {
        admission.state.responseFinished = true;
        admission.state.responseFailed = true;
        await finalizeAdmission(admission);
        throw error;
      }
    }, { ...options.admission, feature: ctx.feature });
  } catch (error) {
    if (isAiUsageCapExceededError(error)) {
      await (options.notifyBlocked ?? notifyScheduledAiQuotaBlocked)(
        ctx.userId,
        error.capStatus,
      ).catch((notificationError) => {
        console.error("[scheduled-ai-job] FAILED to send quota notification", {
          accountOwnerId: ctx.userId,
          feature: ctx.feature,
          error: notificationError,
        });
      });
    }
    throw error;
  }
}

/**
 * Ensure this admission has one durable reservation. Routes call this before
 * side effects; executeAiCall calls it before providers. Both reuse one Promise.
 */
export async function ensureAiJobReservation(
  ctx: AiJobReservationContext,
  options: { allowResponseFinished?: boolean } = {},
): Promise<ReservationResult> {
  const admission = currentAdmission(ctx.userId);
  if (!admission) throw new Error("AI job reservation requires an active admission");
  if (admission.state.responseFinished && !options.allowResponseFinished) {
    throw new Error("AI job admission is already closed");
  }

  if (!admission.state.reservation) {
    const feature = admission.feature ?? ctx.feature;
    const entryMeters = canonicalizeExpectedMeters(ctx.meters);
    admission.state.reservation = (async () => {
      const [reservedCostMicroUsd, maxOvershootCostMicroUsd] = await Promise.all([
        admission.getReservationCost(feature, ctx.provider, ctx.model, entryMeters),
        admission.getMaxOvershootCost(feature),
      ]);
      return admission.reserve({
        accountOwnerId: admission.accountOwnerId,
        brandId: ctx.brandId ?? null,
        feature,
        entryProvider: ctx.provider ?? null,
        entryModel: ctx.model ?? null,
        entryMeters,
        reservedCostMicroUsd,
        maxOvershootCostMicroUsd,
      });
    })();
  }

  const result = await admission.state.reservation;
  if (admission.state.responseFinished && !options.allowResponseFinished) {
    admission.state.responseFailed = true;
    throw new Error("AI job admission closed before the provider call started");
  }
  const response = admission.state.response;
  if (response && !response.headersSent) {
    response.setHeader("X-AI-Usage-Status", result.aiUsageStatus.status);
  }
  return result;
}

/** Claim detached lifecycle ownership before setup, then track the started work. */
export async function registerAiJobBackgroundWork(
  start: () => Promise<unknown>,
  prepare?: () => Promise<void>,
): Promise<void> {
  const admission = currentAdmission();
  if (!admission) return;
  if (admission.state.responseFinished) {
    throw new Error("Cannot register AI background work after the response closed");
  }

  admission.state.backgroundJobs += 1;
  let work: Promise<unknown>;
  try {
    await prepare?.();
    work = aiJobBackgroundWorkStorage.run(true, start);
  } catch (error) {
    admission.state.backgroundJobs -= 1;
    admission.state.backgroundFailed = true;
    void finalizeAdmission(admission);
    throw error;
  }
  work.then(
    () => {
      admission.state.backgroundJobs -= 1;
      void finalizeAdmission(admission);
    },
    () => {
      admission.state.backgroundJobs -= 1;
      admission.state.backgroundFailed = true;
      void finalizeAdmission(admission);
    },
  );
}

/** Finalize awaited jobs on response finish, but wait for registered work. */
export function attachAiJobAdmissionToResponse(res: Response): void {
  const admission = currentAdmission();
  if (!admission) return;

  admission.state.response = res;

  res.once("finish", () => {
    admission.state.responseFinished = true;
    admission.state.responseFailed ||= res.statusCode >= 400;
    void finalizeAdmission(admission);
  });
  res.once("close", () => {
    if (admission.state.responseFinished) return;
    admission.state.responseFinished = true;
    admission.state.responseFailed = true;
    void finalizeAdmission(admission);
  });
}
