import {
  billableUsageSchema,
  canonicalizeExpectedMeters,
  expectedMeterFromUsage,
  pricedMeterUsageSchema,
  providerForMeter,
  type BillableUsage,
  type ExpectedMeter,
  type PricedMeterUsage,
} from "@shared/ai-billing";
import type { AiProvider } from "@shared/ai-billing";
import { getMeterPricing, getModelPricing } from "../system-config";
import { computeTokenCostMicroUsd } from "./tokens";
import type { ComputedAiUsageCost } from "./types";
import type { AiUsageDependencies } from "./types";

export function validateObservedMeters(
  provider: AiProvider,
  usage: BillableUsage,
  expectedMeters: readonly ExpectedMeter[],
): BillableUsage {
  const parsed = billableUsageSchema.parse(usage);
  if (parsed.meters.some((meter) => meter.source === "estimated")) {
    throw new TypeError("Observed AI usage cannot contain estimated meters");
  }
  const observedMeters = canonicalizeExpectedMeters(
    parsed.meters.map(expectedMeterFromUsage),
  );
  if (JSON.stringify(observedMeters) !== JSON.stringify(expectedMeters)) {
    throw new TypeError("Observed meter usage does not match expected meters");
  }
  if (expectedMeters.some((meter) => providerForMeter(meter) !== provider)) {
    throw new TypeError(`Meter usage does not belong to provider: ${provider}`);
  }
  return parsed;
}

export async function computeCostMicroUsd(
  provider: AiProvider,
  model: string,
  usage: BillableUsage,
  dependencies: Pick<AiUsageDependencies, "getPricing" | "getMeterPricing" | "expectedMeters"> = {},
): Promise<ComputedAiUsageCost> {
  const expectedMeters = canonicalizeExpectedMeters(dependencies.expectedMeters);
  const validatedMeters = validateObservedMeters(provider, usage, expectedMeters);

  const [modelRate, pricedMeters] = await Promise.all([
    (dependencies.getPricing ?? getModelPricing)(provider, model),

    // Price each metered usage
    Promise.all(validatedMeters.meters.map(async (meter): Promise<PricedMeterUsage> => {
      const rate = await (dependencies.getMeterPricing ?? getMeterPricing)(meter.sku);
      if (rate.unit !== meter.unit) {
        throw new TypeError(`Configured unit for ${meter.sku} must be ${meter.unit}`);
      }
      // Provider-reported cost, when the API provides it explicitly, prices the
      // billed actual; otherwise the configured rate prices the quantity.
      const costMicroUsd = meter.providerCostMicroUsd ?? meter.quantity * rate.rateMicroUsd;
      if (!Number.isSafeInteger(costMicroUsd)) {
        throw new RangeError(`Meter cost exceeds safe integer range: ${meter.sku}`);
      }
      return pricedMeterUsageSchema.parse({
        ...meter,
        rateMicroUsd: rate.rateMicroUsd,
        costMicroUsd,
      });
    })),
  ]);

  const tokenCostMicroUsd = computeTokenCostMicroUsd(validatedMeters.tokens, modelRate);
  const costMicroUsd = pricedMeters.reduce(
    (total, meter) => total + meter.costMicroUsd,
    tokenCostMicroUsd,
  );
  if (!Number.isSafeInteger(costMicroUsd)) {
    throw new RangeError("AI usage cost exceeds safe integer range");
  }
  return { costMicroUsd, meters: pricedMeters };
}
