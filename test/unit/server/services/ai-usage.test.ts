import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_WEB_SEARCH_METER,
  PERPLEXITY_SEARCH_WEB_METER,
  pricedMeterUsageSchema,
} from "@shared/ai-billing";
import {
  DEFAULT_AI_METER_PRICING,
  aiMeterPricingSchema,
} from "../../../../server/config/system-config-defaults";
import {
  computeCostMicroUsd,
  executeAiCall,
  type BillableUsage,
} from "../../../../server/services/ai-usage";

function usage(source: "deterministic" | "estimated" = "deterministic"): BillableUsage {
  return {
    tokens: {
      inputTokens: 1_000_000,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
    },
    meters: [{
      ...OPENAI_WEB_SEARCH_METER,
      quantity: 1,
      source,
    }],
  };
}

test("aggregate cost includes token and individually priced meter usage", async () => {
  const result = await computeCostMicroUsd(
    "openai",
    "search-model",
    usage(),
    {
      expectedMeters: [OPENAI_WEB_SEARCH_METER],
      getPricing: async () => ({ inputPerMTok: 1, outputPerMTok: 2 }),
      getMeterPricing: async () => ({ unit: "call", rateMicroUsd: 10_000 }),
    },
  );

  assert.equal(result.costMicroUsd, 1_010_000);
  assert.deepEqual(result.meters, [{
    ...OPENAI_WEB_SEARCH_METER,
    quantity: 1,
    source: "deterministic",
    rateMicroUsd: 10_000,
    costMicroUsd: 10_000,
  }]);
});

test("actual usage cannot persist estimated or caller-priced meters", async () => {
  await assert.rejects(
    computeCostMicroUsd("openai", "search-model", usage("estimated"), {
      expectedMeters: [OPENAI_WEB_SEARCH_METER],
    }),
    /cannot contain estimated meters/,
  );

  const callerPriced = usage() as BillableUsage & {
    meters: Array<BillableUsage["meters"][number] & { costMicroUsd: number }>;
  };
  callerPriced.meters[0].costMicroUsd = 1;
  await assert.rejects(
    computeCostMicroUsd("openai", "search-model", callerPriced, {
      expectedMeters: [OPENAI_WEB_SEARCH_METER],
    }),
    /unrecognized key/i,
  );
});

test("invalid expected meter dependencies fail before provider execution", async () => {
  let providerCalls = 0;
  await assert.rejects(
    executeAiCall(
      undefined,
      "openai",
      "search-model",
      async () => {
        providerCalls += 1;
        return {};
      },
      () => usage(),
      {
        expectedMeters: [{
          ...OPENAI_WEB_SEARCH_METER,
          injectedCost: 1,
        } as any],
      },
    ),
    /unrecognized key/i,
  );
  assert.equal(providerCalls, 0);
});

test("provider-reported cost prices the billed actual instead of quantity times rate", async () => {
  const result = await computeCostMicroUsd(
    "perplexity",
    "perplexity/sonar",
    {
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      },
      meters: [{
        ...PERPLEXITY_SEARCH_WEB_METER,
        quantity: 2,
        source: "provider_reported",
        providerCostMicroUsd: 5_000,
      }],
    },
    {
      expectedMeters: [PERPLEXITY_SEARCH_WEB_METER],
      getPricing: async () => ({ inputPerMTok: 0, outputPerMTok: 0 }),
      getMeterPricing: async () => ({ unit: "search_request", rateMicroUsd: 2_500 }),
    },
  );

  assert.equal(result.costMicroUsd, 5_000);
  assert.deepEqual(result.meters, [{
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    providerCostMicroUsd: 5_000,
    rateMicroUsd: 2_500,
    costMicroUsd: 5_000,
  }]);
});

test("priced meters without provider cost still price as quantity times rate", () => {
  assert.deepEqual(pricedMeterUsageSchema.parse({
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    rateMicroUsd: 2_500,
    costMicroUsd: 5_000,
  }), {
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    rateMicroUsd: 2_500,
    costMicroUsd: 5_000,
  });
  assert.throws(() => pricedMeterUsageSchema.parse({
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    rateMicroUsd: 2_500,
    costMicroUsd: 6_000,
  }), /quantity times rateMicroUsd/);
});

test("billed cost must equal the provider-reported cost when present", () => {
  assert.throws(() => pricedMeterUsageSchema.parse({
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    providerCostMicroUsd: 5_000,
    rateMicroUsd: 2_500,
    costMicroUsd: 6_000,
  }), /provider reports cost/);
});

test("admin meter pricing rejects unknown SKUs and mismatched units", () => {
  assert.deepEqual(aiMeterPricingSchema.parse(DEFAULT_AI_METER_PRICING), DEFAULT_AI_METER_PRICING);
  assert.throws(() => aiMeterPricingSchema.parse({
    ...DEFAULT_AI_METER_PRICING,
    "openai.web_search": { unit: "query", rateMicroUsd: 10_000 },
  }));
  assert.throws(() => aiMeterPricingSchema.parse({
    ...DEFAULT_AI_METER_PRICING,
    "unknown.tool": { unit: "call", rateMicroUsd: 1 },
  }), /unrecognized key/i);
});
