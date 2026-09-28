import {
  anthropicWebSearchMeterSchema,
  expectedMeterSchema,
  expectedMetersSchema,
  type ExpectedMeter,
  type MeterUsage,
  type PricedMeterUsage,
} from "./schema-validation";

// Provider taxonomy — billing-domain, owned by the meter SKU contract. The
// client may mirror this from @shared/ai-billing; server-only types (features,
// job context) live in server/services/ai-usage/types.ts.
export const AI_PROVIDERS = ["openai", "anthropic", "gemini", "perplexity", "dataforseo"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const OPENAI_WEB_SEARCH_METER = {
  sku: "openai.web_search",
  category: "tool",
  unit: "call",
  maxQuantity: 1,
} as const satisfies ExpectedMeter;

export const GEMINI_GROUNDED_PROMPT_METER = {
  sku: "gemini.google_search_grounded_prompt",
  category: "tool",
  unit: "grounded_prompt",
  maxQuantity: 1,
} as const satisfies ExpectedMeter;

export const GEMINI_SEARCH_QUERY_METER = {
  sku: "gemini.google_search_query",
  category: "tool",
  unit: "query",
} as const satisfies ExpectedMeter;

export const PERPLEXITY_SEARCH_WEB_METER = {
  sku: "perplexity.search_web",
  category: "tool",
  unit: "search_request",
} as const satisfies ExpectedMeter;

export const DATAFORSEO_AI_MODE_METER = {
  sku: "dataforseo.google_ai_mode",
  category: "tool",
  unit: "task",
} as const satisfies ExpectedMeter;

export const DATAFORSEO_AI_OVERVIEW_METER = {
  sku: "dataforseo.google_ai_overview",
  category: "tool",
  unit: "task",
} as const satisfies ExpectedMeter;

export function anthropicWebSearchMeter(maxQuantity: number) {
  return anthropicWebSearchMeterSchema.parse({
    sku: "anthropic.web_search",
    category: "tool",
    unit: "search",
    maxQuantity,
  });
}

export function geminiGoogleSearchMeter(model: string) {
  if (/^gemini-3(?:[.-]|$)/.test(model)) return GEMINI_SEARCH_QUERY_METER;
  if (/^gemini-2\.5(?:[.-]|$)/.test(model)) return GEMINI_GROUNDED_PROMPT_METER;
  throw new TypeError(`No Google Search billing meter is defined for Gemini model: ${model}`);
}

export function canonicalizeExpectedMeters(input: unknown = []): ExpectedMeter[] {
  return [...expectedMetersSchema.parse(input)].sort((left, right) =>
    left.sku.localeCompare(right.sku)
  );
}

export function expectedMeterFromUsage(
  meter: MeterUsage | PricedMeterUsage,
): ExpectedMeter {
  return expectedMeterSchema.parse({
    sku: meter.sku,
    category: meter.category,
    unit: meter.unit,
    ...("maxQuantity" in meter ? { maxQuantity: meter.maxQuantity } : {}),
  });
}

export function providerForMeter(meter: ExpectedMeter): AiProvider {
  if (meter.sku.startsWith("openai.")) return "openai";
  if (meter.sku.startsWith("anthropic.")) return "anthropic";
  if (meter.sku.startsWith("perplexity.")) return "perplexity";
  if (meter.sku.startsWith("dataforseo.")) return "dataforseo";
  return "gemini";
}
