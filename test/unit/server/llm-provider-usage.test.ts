import assert from "node:assert/strict";
import test from "node:test";
import { computeTokenCostMicroUsd } from "../../../server/services/ai-usage/tokens";
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentResponse } from "@google/genai";
import type OpenAI from "openai";
import type { ResponsesResponseOutput } from "@perplexity-ai/perplexity_ai/generated/api";

import { usageFromAnthropic } from "../../../server/services/llm-provider/anthropic/usage";
import { usageFromGemini } from "../../../server/services/llm-provider/gemini/usage";
import { usageFromOpenAI } from "../../../server/services/llm-provider/openai/usage";
import { usageFromPerplexity } from "../../../server/services/llm-provider/perplexity/usage";

function tokenOnly(tokens: Record<string, number>) {
  return {
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      ...tokens,
    },
    meters: [],
  };
}

import {
  GEMINI_GROUNDED_PROMPT_METER,
  GEMINI_SEARCH_QUERY_METER,
  OPENAI_WEB_SEARCH_METER,
  PERPLEXITY_SEARCH_WEB_METER,
  anthropicWebSearchMeter,
  geminiGoogleSearchMeter,
} from "@shared/ai-billing";


// Minimal synthetic responses feed the extractors; cast to the SDK types the
// extractor signatures declare.
const asOpenAI = (response: unknown): OpenAI.Chat.ChatCompletion =>
  response as OpenAI.Chat.ChatCompletion;
const asAnthropic = (response: unknown): Anthropic.Message =>
  response as Anthropic.Message;
const asGemini = (response: unknown): GenerateContentResponse =>
  response as GenerateContentResponse;
const asPerplexity = (response: unknown): ResponsesResponseOutput =>
  response as ResponsesResponseOutput;

test("OpenAI extracts cache reads and writes from chat usage", () => {
  assert.deepEqual(usageFromOpenAI(asOpenAI({
    usage: {
      prompt_tokens: 2_600,
      completion_tokens: 300,
      prompt_tokens_details: {
        cached_tokens: 2_000,
        cache_write_tokens: 400,
      },
    },
  })), tokenOnly({
    inputTokens: 2_600,
    outputTokens: 300,
    cacheReadTokens: 2_000,
    cacheWriteTokens: 400,
  }));
});

test("Anthropic combines its disjoint input categories", () => {
  assert.deepEqual(usageFromAnthropic(asAnthropic({
    usage: {
      input_tokens: 50,
      output_tokens: 25,
      cache_creation_input_tokens: 1_500,
      cache_read_input_tokens: 10_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 1_000,
        ephemeral_1h_input_tokens: 500,
      },
    },
  })), tokenOnly({
    inputTokens: 11_550,
    outputTokens: 25,
    cacheReadTokens: 10_000,
    cacheWriteTokens: 1_500,
    cacheWrite1hTokens: 500,
  }));
});

test("Anthropic falls back to the TTL breakdown for inconsistent totals", () => {
  assert.deepEqual(usageFromAnthropic(asAnthropic({
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: {
        ephemeral_5m_input_tokens: 100,
        ephemeral_1h_input_tokens: 50,
      },
    },
  })), tokenOnly({
    inputTokens: 160,
    outputTokens: 5,
    cacheWriteTokens: 150,
    cacheWrite1hTokens: 50,
  }));
});

test("Gemini extracts cached input and separately reported tool input", () => {
  assert.deepEqual(usageFromGemini(asGemini({
    usageMetadata: {
      promptTokenCount: 8_411,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 12,
      toolUsePromptTokenCount: 100,
      cachedContentTokenCount: 8_402,
    },
  })), tokenOnly({
    inputTokens: 8_511,
    outputTokens: 20,
    thinkingTokens: 12,
    cacheReadTokens: 8_402,
  }));
});

test("OpenAI records one deterministic search call", () => {
  const usage = usageFromOpenAI(asOpenAI({
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  }), [OPENAI_WEB_SEARCH_METER]);

  assert.deepEqual(usage.meters, [{
    ...OPENAI_WEB_SEARCH_METER,
    quantity: 1,
    source: "deterministic",
  }]);
});

test("Anthropic records provider-reported searches including zero", () => {
  const meter = anthropicWebSearchMeter(3);
  const used = usageFromAnthropic(asAnthropic({
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      server_tool_use: { web_search_requests: 2 },
    },
  }), [meter]);
  const unused = usageFromAnthropic(asAnthropic({
    usage: { input_tokens: 10, output_tokens: 5 },
  }), [meter]);

  assert.deepEqual(used.meters, [{ ...meter, quantity: 2, source: "provider_reported" }]);
  assert.deepEqual(unused.meters, [{ ...meter, quantity: 0, source: "provider_reported" }]);
});

test("Malformed Anthropic meter counts throw instead of coercing", () => {
  const meter = anthropicWebSearchMeter(3);
  for (const malformed of ["3", 1.5, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      // Intentionally malformed payload — cast past the SDK types.
      () => usageFromAnthropic(asAnthropic({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          server_tool_use: { web_search_requests: malformed },
        },
      }), [meter]),
      /Malformed meter count from anthropic\.web_search/,
    );
  }
});

test("Gemini 2.5 excludes grounded search content from billable input", () => {
  const usage = usageFromGemini(asGemini({
    usageMetadata: {
      promptTokenCount: 100,
      toolUsePromptTokenCount: 8_000,
      candidatesTokenCount: 20,
    },
    candidates: [{
      groundingMetadata: {
        webSearchQueries: ["current query"],
        groundingChunks: [{ web: { uri: "https://example.com" } }],
      },
    }],
  }), [GEMINI_GROUNDED_PROMPT_METER]);

  assert.equal(usage.tokens.inputTokens, 100);
  assert.deepEqual(usage.meters, [{
    ...GEMINI_GROUNDED_PROMPT_METER,
    quantity: 1,
    source: "provider_reported",
  }]);
});

test("Gemini 3 records every provider-reported search query", () => {
  const usage = usageFromGemini(asGemini({
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    candidates: [{
      groundingMetadata: { webSearchQueries: ["first", "second"] },
    }],
  }), [GEMINI_SEARCH_QUERY_METER]);

  assert.deepEqual(usage.meters, [{
    ...GEMINI_SEARCH_QUERY_METER,
    quantity: 2,
    source: "provider_reported",
  }]);
});

test("Gemini fallback models switch to their own billing unit", () => {
  assert.deepEqual(
    geminiGoogleSearchMeter("gemini-3.1-pro-preview"),
    GEMINI_SEARCH_QUERY_METER,
  );
  assert.deepEqual(
    geminiGoogleSearchMeter("gemini-2.5-flash"),
    GEMINI_GROUNDED_PROMPT_METER,
  );
  assert.throws(() => geminiGoogleSearchMeter("gemini-unknown"), /No Google Search billing meter/);
});

test("meter extraction rejects quantities above a configured maximum", () => {
  assert.throws(() => usageFromAnthropic(asAnthropic({
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      server_tool_use: { web_search_requests: 4 },
    },
  }), [anthropicWebSearchMeter(3)]), /quantity cannot exceed maxQuantity/);
});

test("Perplexity extracts cache reads and writes from agent usage", () => {
  assert.deepEqual(usageFromPerplexity(asPerplexity({
    usage: {
      input_tokens: 11_575,
      output_tokens: 227,
      input_tokens_details: {
        cache_creation_input_tokens: 6_296,
        cache_read_input_tokens: 5_270,
        cached_tokens: 5_270,
      },
      output_tokens_details: { reasoning_tokens: 28 },
      total_tokens: 11_802,
    },
  })), {
    tokens: {
      inputTokens: 11_575,
      outputTokens: 227,
      thinkingTokens: 0,
      cacheReadTokens: 5_270,
      cacheWriteTokens: 6_296,
      cacheWrite1hTokens: 0,
    },
    meters: [],
  });
});

test("Perplexity meters provider-reported search calls with the billed cost", () => {
  const usage = usageFromPerplexity(asPerplexity({
    usage: {
      input_tokens: 11_575,
      output_tokens: 227,
      input_tokens_details: {
        cached_tokens: 5_270,
        cache_creation_input_tokens: 6_296,
      },
      tool_calls_details: { search_web: { cost_usd: 0.005, invocation: 2 } },
    },
  }), [PERPLEXITY_SEARCH_WEB_METER]);

  assert.deepEqual(usage.meters, [{
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 2,
    source: "provider_reported",
    providerCostMicroUsd: 5_000,
  }]);
});

test("Perplexity records zero search quantity when no tool calls are reported", () => {
  const usage = usageFromPerplexity(asPerplexity({
    usage: { input_tokens: 10, output_tokens: 5 },
  }), [PERPLEXITY_SEARCH_WEB_METER]);

  assert.deepEqual(usage.meters, [{
    ...PERPLEXITY_SEARCH_WEB_METER,
    quantity: 0,
    source: "provider_reported",
  }]);
});

test("Malformed Perplexity invocation counts throw instead of corrupting history", () => {
  const meter = PERPLEXITY_SEARCH_WEB_METER;
  for (const malformed of ["2", 1.5, -1, Number.NaN]) {
    assert.throws(
      // Intentionally malformed payload — cast past the SDK types.
      () => usageFromPerplexity(asPerplexity({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          tool_calls_details: { search_web: { invocation: malformed } },
        },
      }), [meter]),
      /Malformed meter count from perplexity\.search_web invocation/,
    );
  }
});

test("Perplexity cost without invocations is rejected as inconsistent", () => {
  assert.throws(
    // Intentionally inconsistent payload — cast past the SDK types.
    () => usageFromPerplexity(asPerplexity({
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        tool_calls_details: { search_web: { cost_usd: 0.005 } },
      },
    }), [PERPLEXITY_SEARCH_WEB_METER]),
    /cost without matching invocations/,
  );
});

test("Perplexity extraction rejects non-Perplexity expected meters", () => {
  assert.throws(
    () => usageFromPerplexity(asPerplexity({ usage: {} }), [OPENAI_WEB_SEARCH_METER]),
    /Unsupported Perplexity meter/,
  );
});

test("Perplexity leaves thinkingTokens unset so reasoning bills once", () => {
  const usage = usageFromPerplexity(asPerplexity({
    usage: {
      input_tokens: 1_435,
      output_tokens: 46,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 33 },
    },
  }));

  assert.equal(usage.tokens.thinkingTokens, 0);
  // 1,435 uncached x $0.25/M + 46 output (reasoning included) x $2.50/M
  // = 358.75 + 115 = 473.75 -> 474 micro-USD.
  assert.equal(computeTokenCostMicroUsd(usage.tokens, {
    inputPerMTok: 0.25,
    outputPerMTok: 2.5,
    cacheReadPerMTok: 0.0625,
    cacheWritePerMTok: 0.25,
  }), 474);
});

test("Perplexity tolerates missing usage details", () => {
  assert.deepEqual(usageFromPerplexity(asPerplexity({
    usage: { input_tokens: 10, output_tokens: 5 },
  })), {
    tokens: {
      inputTokens: 10,
      outputTokens: 5,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
    },
    meters: [],
  });
});

