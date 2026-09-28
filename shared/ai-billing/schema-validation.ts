import { z } from "zod";
import type { TokenUsage } from "./types";

const safeNonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const safePositiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const openAiWebSearchMeterSchema = z.object({
  sku: z.literal("openai.web_search"),
  category: z.literal("tool"),
  unit: z.literal("call"),
  maxQuantity: z.literal(1),
}).strict();

const anthropicWebSearchMeterSchema = z.object({
  sku: z.literal("anthropic.web_search"),
  category: z.literal("tool"),
  unit: z.literal("search"),
  maxQuantity: safePositiveInteger,
}).strict();

const geminiGroundedPromptMeterSchema = z.object({
  sku: z.literal("gemini.google_search_grounded_prompt"),
  category: z.literal("tool"),
  unit: z.literal("grounded_prompt"),
  maxQuantity: z.literal(1),
}).strict();

const geminiSearchQueryMeterSchema = z.object({
  sku: z.literal("gemini.google_search_query"),
  category: z.literal("tool"),
  unit: z.literal("query"),
}).strict();

const perplexitySearchWebMeterSchema = z.object({
  sku: z.literal("perplexity.search_web"),
  category: z.literal("tool"),
  unit: z.literal("search_request"),
}).strict();

// DataForSEO bills per API task and does not expose token usage — the unit of
// consumption is the call itself (quantity 1 per request, deterministic), and
// the billed actual is the vendor's own reported task cost.
const dataforseoAiModeMeterSchema = z.object({
  sku: z.literal("dataforseo.google_ai_mode"),
  category: z.literal("tool"),
  unit: z.literal("task"),
}).strict();

const dataforseoAiOverviewMeterSchema = z.object({
  sku: z.literal("dataforseo.google_ai_overview"),
  category: z.literal("tool"),
  unit: z.literal("task"),
}).strict();

export const expectedMeterSchema = z.discriminatedUnion("sku", [
  openAiWebSearchMeterSchema,
  anthropicWebSearchMeterSchema,
  geminiGroundedPromptMeterSchema,
  geminiSearchQueryMeterSchema,
  perplexitySearchWebMeterSchema,
  dataforseoAiModeMeterSchema,
  dataforseoAiOverviewMeterSchema,
]);
export type ExpectedMeter = z.infer<typeof expectedMeterSchema>;
export type MeterSku = ExpectedMeter["sku"];

const meterSourceSchema = z.enum([
  "provider_reported",
  "deterministic",
  "estimated",
]);
export type MeterSource = z.infer<typeof meterSourceSchema>;
const deterministicMeterSourceSchema = z.enum(["deterministic", "estimated"]);
const reportedMeterSourceSchema = z.enum(["provider_reported", "estimated"]);

// Cost the provider itself billed for this meter in the response — when
// present it overrides quantity × config rate for the billed actual
// (provider truth), while estimation keeps pricing quantities × current rate.
const providerCostMicroUsd = safeNonNegativeInteger.optional();

const openAiWebSearchUsageSchema = openAiWebSearchMeterSchema.extend({
  quantity: safeNonNegativeInteger.max(1),
  source: deterministicMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const anthropicWebSearchUsageSchema = anthropicWebSearchMeterSchema.extend({
  quantity: safeNonNegativeInteger,
  source: reportedMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const geminiGroundedPromptUsageSchema = geminiGroundedPromptMeterSchema.extend({
  quantity: safeNonNegativeInteger.max(1),
  source: reportedMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const geminiSearchQueryUsageSchema = geminiSearchQueryMeterSchema.extend({
  quantity: safeNonNegativeInteger,
  source: reportedMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const perplexitySearchWebUsageSchema = perplexitySearchWebMeterSchema.extend({
  quantity: safeNonNegativeInteger,
  source: reportedMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const dataforseoAiModeUsageSchema = dataforseoAiModeMeterSchema.extend({
  quantity: safeNonNegativeInteger.max(1),
  source: deterministicMeterSourceSchema,
  providerCostMicroUsd,
}).strict();
const dataforseoAiOverviewUsageSchema = dataforseoAiOverviewMeterSchema.extend({
  quantity: safeNonNegativeInteger.max(2),
  source: deterministicMeterSourceSchema,
  providerCostMicroUsd,
}).strict();

export const meterUsageSchema = z.union([
  openAiWebSearchUsageSchema,
  anthropicWebSearchUsageSchema,
  geminiGroundedPromptUsageSchema,
  geminiSearchQueryUsageSchema,
  perplexitySearchWebUsageSchema,
  dataforseoAiModeUsageSchema,
  dataforseoAiOverviewUsageSchema,
]).superRefine((meter, ctx) => {
  if (meter.sku === "anthropic.web_search" && meter.quantity > meter.maxQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quantity"],
      message: "quantity cannot exceed maxQuantity",
    });
  }
});
export type MeterUsage = z.infer<typeof meterUsageSchema>;

const requiredTokenUsageSchema = z.object({
  inputTokens: safeNonNegativeInteger,
  outputTokens: safeNonNegativeInteger,
  thinkingTokens: safeNonNegativeInteger,
  cacheReadTokens: safeNonNegativeInteger,
  cacheWriteTokens: safeNonNegativeInteger,
  cacheWrite1hTokens: safeNonNegativeInteger,
}).strict();

function rejectDuplicateSkus(
  meters: readonly unknown[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  meters.forEach((meter, index) => {
    const sku = typeof meter === "object" && meter != null && "sku" in meter
      ? String(meter.sku)
      : "";
    if (seen.has(sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "sku"],
        message: `duplicate meter SKU: ${sku}`,
      });
    }
    seen.add(sku);
  });
}

export const expectedMetersSchema = z.array(expectedMeterSchema).superRefine(
  rejectDuplicateSkus,
);

export type BillableUsage = {
  tokens: Required<TokenUsage>;
  meters: MeterUsage[];
};

export const billableUsageSchema = z.object({
  tokens: requiredTokenUsageSchema,
  meters: z.array(meterUsageSchema).superRefine(rejectDuplicateSkus),
}).strict();

export type PricedMeterUsage = MeterUsage & {
  rateMicroUsd: number;
  costMicroUsd: number;
};

const pricedFields = {
  rateMicroUsd: safePositiveInteger,
  costMicroUsd: safeNonNegativeInteger,
};

export const pricedMeterUsageSchema = z.union([
  openAiWebSearchUsageSchema.extend(pricedFields).strict(),
  anthropicWebSearchUsageSchema.extend(pricedFields).strict(),
  geminiGroundedPromptUsageSchema.extend(pricedFields).strict(),
  geminiSearchQueryUsageSchema.extend(pricedFields).strict(),
  perplexitySearchWebUsageSchema.extend(pricedFields).strict(),
  dataforseoAiModeUsageSchema.extend(pricedFields).strict(),
  dataforseoAiOverviewUsageSchema.extend(pricedFields).strict(),
]).superRefine((meter, ctx) => {
  if (meter.sku === "anthropic.web_search" && meter.quantity > meter.maxQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quantity"],
      message: "quantity cannot exceed maxQuantity",
    });
  }
  if (meter.providerCostMicroUsd === undefined) {
    if (meter.costMicroUsd !== meter.quantity * meter.rateMicroUsd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["costMicroUsd"],
        message: "costMicroUsd must equal quantity times rateMicroUsd",
      });
    }
  } else if (meter.costMicroUsd !== meter.providerCostMicroUsd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["costMicroUsd"],
      message: "costMicroUsd must equal providerCostMicroUsd when the provider reports cost",
    });
  }
});

export const pricedMetersSchema = z.array(pricedMeterUsageSchema).superRefine(
  rejectDuplicateSkus,
);

// Re-exported for the meter factory in ./constants; the remaining meter
// schemas stay private to this file.
export { anthropicWebSearchMeterSchema };
