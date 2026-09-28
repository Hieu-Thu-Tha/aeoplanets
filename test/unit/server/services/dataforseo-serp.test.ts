import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach } from "node:test";
import {
  fetchGoogleAiMode,
  fetchGoogleAiOverview,
  runDataForSeo,
} from "../../../../server/services/llm-provider/dataforseo/runner";
import {
  usageFromDataForSeo,
} from "../../../../server/services/llm-provider/dataforseo/usage";
import {
  DATAFORSEO_AI_MODE_METER,
  DATAFORSEO_AI_OVERVIEW_METER,
} from "@shared/ai-billing";
import {
  computeCostMicroUsd,
} from "../../../../server/services/ai-usage";
import {
  DataForSeoSerpError,
  type DataForSeoSerpEngine,
  type DataForSeoSerpRequest,
} from "../../../../server/services/llm-provider/dataforseo/types";
import type {
  SerpGoogleAiModeLiveAdvancedResponseInfo,
  SerpGoogleOrganicLiveAdvancedResponseInfo,
} from "dataforseo-client";
import {
  dataforseoResultFromResponse,
} from "../../../../server/services/llm-provider/dataforseo/output";

const fixtures = JSON.parse(
  readFileSync(new URL("../../../fixtures/dataforseo-serp.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const request: DataForSeoSerpRequest = {
  keyword: "best project management tools",
  locationCode: 1006886,
  languageCode: "en",
  device: "desktop",
  os: "windows",
  tag: "co-002-test",
};

// Synthetic documented-shape SERP responses for the signal stage. Built as
// plain literals and cast to the SDK envelope type the converter declares.
function syntheticDataForSeoResponse(overrides: {
  engine?: DataForSeoSerpEngine;
  present?: boolean;
  surface?: Record<string, unknown>;
}): SerpGoogleAiModeLiveAdvancedResponseInfo | SerpGoogleOrganicLiveAdvancedResponseInfo {
  const engine = overrides.engine ?? "google_ai_mode";
  const resultType = engine === "google_ai_mode" ? "ai_mode" : "organic";
  const surface = overrides.surface ?? null;
  return {
    status_code: 20000,
    status_message: "Ok.",
    tasks: [{
      id: `fixture-${engine}-task`,
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.004,
      result: [{
        keyword: "best tires",
        type: resultType,
        location_code: 2840,
        language_code: "en",
        check_url: "https://www.google.com/search?q=test",
        datetime: "2026-09-25 12:00:00 +00:00",
        item_types: surface ? ["ai_overview"] : ["organic"],
        items: surface ? [surface] : [{
          type: "organic",
          url: "https://organic.example/only-result",
        }],
      }],
    }],
  } as SerpGoogleAiModeLiveAdvancedResponseInfo;
}

function aiSurface(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "ai_overview",
    rank_group: 1,
    rank_absolute: 1,
    text: "Alpha is a leading tire brand. Beta suits smaller teams.",
    markdown: "**Alpha** is the leading brand. Beta suits smaller teams.",
    references: [{
      type: "ai_overview_reference",
      url: "https://alpha.example/review",
      title: "Alpha review",
      domain: "alpha.example",
      text: "Independent Alpha review.",
      source: "Alpha Review",
    }],
    ...overrides,
  };
}

const brand = "Alpha";
const competitors = ["rival-tires.com", "competitor-tires.com"];

const originalLogin = process.env.DATAFORSEO_API_USERNAME;
const originalPassword = process.env.DATAFORSEO_API_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_API_USERNAME = "fixture-login";
  process.env.DATAFORSEO_API_PASSWORD = "fixture-password";
});

afterEach(() => {
  if (originalLogin === undefined) delete process.env.DATAFORSEO_API_USERNAME;
  else process.env.DATAFORSEO_API_USERNAME = originalLogin;
  if (originalPassword === undefined) delete process.env.DATAFORSEO_API_PASSWORD;
  else process.env.DATAFORSEO_API_PASSWORD = originalPassword;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fixtureFetch(
  fixtureName: string,
  calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse(fixtures[fixtureName]);
  }) as typeof fetch;
}

function expectDataForSeoError(
  error: unknown,
  code: string,
): asserts error is DataForSeoSerpError {
  assert.ok(error instanceof DataForSeoSerpError);
  assert.equal(error.code, code);
  assert.match(error.message, new RegExp(`\\[${code}\\]`));
}

test("AI Mode uses its Live Advanced endpoint and normalizes answer references", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const result = await fetchGoogleAiMode(request, {
    fetchImpl: fixtureFetch("aiModeSuccess", calls),
  });

  assert.deepEqual(result, {
    vendor: "dataforseo",
    engine: "google_ai_mode",
    isAnswerPresent: true,
    answerText: "Alpha is a strong option.\n\nBeta suits smaller teams.",
    answerMarkdown: "**Alpha** is a strong option.[[1]](https://alpha.example/review)\n\nBeta suits smaller teams.",
    references: [
      {
        url: "https://alpha.example/review",
        title: "Alpha review",
        domain: "alpha.example",
        snippet: "Independent Alpha review.",
        source: "Alpha Review",
      },
      {
        url: "https://beta.example/guide",
        title: null,
        domain: "beta.example",
        snippet: null,
        source: "Beta Guide",
      },
    ],
    taskId: "fixture-ai-mode-task",
    costUsd: 0.004,
    resultTimestamp: "2026-09-24 12:00:00 +00:00",
    checkUrl: "https://www.google.com/search?q=best+project+management+tools&udm=50",
    metadata: {
      keyword: "best project management tools",
      resultType: "ai_mode",
      surfaceType: "ai_overview",
      locationCode: 1006886,
      languageCode: "en",
      itemTypes: ["ai_overview"],
      rankGroup: 1,
      rankAbsolute: 1,
      asynchronousAiOverview: null,
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), "https://api.dataforseo.com/v3/serp/google/ai_mode/live/advanced");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), [{
    keyword: "best project management tools",
    location_code: 1006886,
    language_code: "en",
    device: "desktop",
    os: "windows",
    tag: "co-002-test",
  }]);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), `Basic ${Buffer.from("fixture-login:fixture-password").toString("base64")}`);
  assert.equal(headers.get("content-type"), "application/json");
});

test("AI Overview uses Organic Live Advanced with asynchronous overview loading", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const result = await fetchGoogleAiOverview(
    { ...request, keyword: "how to change a tire", locationCode: 2840 },
    { fetchImpl: fixtureFetch("aiOverviewSuccess", calls) },
  );

  assert.equal(result.engine, "google_ai_overview");
  assert.equal(result.isAnswerPresent, true);
  assert.equal(result.answerText, "Park safely, then loosen the lug nuts.");
  assert.equal(result.metadata.surfaceType, "ai_overview");
  assert.equal(result.metadata.asynchronousAiOverview, true);
  assert.deepEqual(result.references, [{
    url: "https://tires.example/change",
    title: "How to change a tire",
    domain: "tires.example",
    snippet: "A safe step-by-step tire guide.",
    source: "Tire Guide",
  }]);
  assert.equal(String(calls[0].input), "https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), [{
    keyword: "how to change a tire",
    location_code: 2840,
    language_code: "en",
    device: "desktop",
    os: "windows",
    tag: "co-002-test",
    depth: 10,
    load_async_ai_overview: true,
    // The SDK's request model serializes its declared-optional crawl-control
    // fields explicitly; unset values arrive as null.
    stop_crawl_on_match: null,
  }]);
});

test("AI Overview recognizes the documented knowledge graph surface", async () => {
  const result = await fetchGoogleAiOverview(
    { ...request, keyword: "history of apple pie", locationCode: 2840 },
    { fetchImpl: fixtureFetch("aiOverviewKnowledgeGraphSuccess") },
  );

  assert.equal(result.isAnswerPresent, true);
  assert.equal(result.answerText, "Apple pie became associated with American identity.");
  assert.equal(result.answerMarkdown, null);
  assert.equal(result.metadata.surfaceType, "knowledge_graph_ai_overview_item");
  assert.equal(result.metadata.asynchronousAiOverview, false);
  assert.deepEqual(result.references, [{
    url: "https://food.example/apple-pie",
    title: "The history of apple pie",
    domain: "food.example",
    snippet: "How apple pie became an American symbol.",
    source: "Food History",
  }]);
});

test("a successful organic response without an AI Overview is a valid absent result", async () => {
  const result = await fetchGoogleAiOverview(request, {
    fetchImpl: fixtureFetch("aiOverviewAbsent"),
  });

  assert.equal(result.isAnswerPresent, false);
  assert.equal(result.answerText, null);
  assert.equal(result.answerMarkdown, null);
  assert.deepEqual(result.references, []);
  assert.equal(result.taskId, "fixture-no-overview-task");
  assert.equal(result.costUsd, 0.003);
  assert.equal(result.metadata.surfaceType, null);
  assert.equal(result.metadata.rankGroup, null);
  assert.equal(result.metadata.asynchronousAiOverview, null);
});

test("invalid JSON is reported as a parse error without response contents", async () => {
  const fetchImpl = (async () => new Response("{private-invalid-json", { status: 200 })) as typeof fetch;

  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_INVALID_JSON");
      assert.doesNotMatch(error.message, /private-invalid-json/);
      return true;
    },
  );
});

test("a malformed success body is distinct from a legitimate absent surface", async () => {
  await assert.rejects(
    fetchGoogleAiOverview(request, { fetchImpl: fixtureFetch("malformedBody") }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_MALFORMED_RESPONSE");
      assert.doesNotMatch(error.message, /DO_NOT_LEAK/);
      assert.doesNotMatch(JSON.stringify(error), /DO_NOT_LEAK/);
      return true;
    },
  );
});

test("non-success provider status exposes only safe top-level metadata", async () => {
  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl: fixtureFetch("topLevelError") }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_PROVIDER_ERROR");
      assert.deepEqual(error.metadata, {
        engine: "google_ai_mode",
        providerStatusCode: 40100,
        providerStatusMessage: "Authentication failed.",
      });
      return true;
    },
  );
});

test("non-success task status exposes task ID and safe task metadata", async () => {
  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl: fixtureFetch("taskError") }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_TASK_ERROR");
      assert.deepEqual(error.metadata, {
        engine: "google_ai_mode",
        providerStatusCode: 20000,
        providerStatusMessage: "Ok.",
        taskId: "fixture-failed-task",
        taskStatusCode: 40501,
        taskStatusMessage: "Task failed safely.",
      });
      return true;
    },
  );
});

test("HTTP errors do not include provider response bodies", async () => {
  const fetchImpl = (async () => new Response("private upstream details", { status: 503 })) as typeof fetch;

  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_HTTP_ERROR");
      assert.deepEqual(error.metadata, { engine: "google_ai_mode", httpStatus: 503 });
      assert.doesNotMatch(error.message, /private upstream details/);
      return true;
    },
  );
});

test("network failures are reported as typed transport errors", async () => {
  const fetchImpl = (async () => {
    throw new Error("socket failed with private details");
  }) as typeof fetch;

  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_TRANSPORT_ERROR");
      assert.deepEqual(error.metadata, { engine: "google_ai_mode" });
      assert.doesNotMatch(error.message, /private details/);
      return true;
    },
  );
});

test("bounded timeout aborts the request and reports a typed timeout", async () => {
  let aborted = false;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  })) as typeof fetch;

  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl, timeoutMs: 5 }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_TIMEOUT");
      return true;
    },
  );
  assert.equal(aborted, true);
});

test("missing credentials fails before any network call", async () => {
  delete process.env.DATAFORSEO_API_USERNAME;
  delete process.env.DATAFORSEO_API_PASSWORD;
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return jsonResponse(fixtures.aiModeSuccess);
  }) as typeof fetch;

  await assert.rejects(
    fetchGoogleAiMode(request, { fetchImpl }),
    (error: unknown) => {
      expectDataForSeoError(error, "DATAFORSEO_MISSING_CREDENTIALS");
      return true;
    },
  );
  assert.equal(called, false);
});

test("AI Mode surface maps to the visibility-result contract with structured citations", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    surface: aiSurface({}),
  }), "google_ai_mode", brand, ["rival-tires.com", "competitor-tires.com"], "Alpha Company");

  assert.deepEqual(result, {
    modelId: "google_ai_mode",
    appeared: true,
    position: 1,
    sentiment: "positive",
    competitorsMentioned: [],
    citationPresent: true,
    rawResponse: "**Alpha** is the leading brand. Beta suits smaller teams.",
  });
});

test("AI Overview engine keeps its own model identity", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    engine: "google_ai_overview",
    surface: aiSurface({ markdown: null }),
  }), "google_ai_overview", brand, []);

  assert.equal(result.modelId, "google_ai_overview");
  assert.equal(result.appeared, true);
  assert.equal(result.citationPresent, true);
});

test("a surface without the brand yields zeroed signals", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    surface: aiSurface({ text: "Nothing relevant here.", markdown: "Nothing relevant here." }),
  }), "google_ai_mode", brand, []);

  assert.equal(result.appeared, false);
  assert.equal(result.position, null);
  assert.equal(result.sentiment, null);
  assert.deepEqual(result.competitorsMentioned, []);
  // Structured references still mean citations are present on the surface.
  assert.equal(result.citationPresent, true);
  assert.match(result.rawResponse, /Nothing relevant/);
});

test("competitors are matched by domain and brand part", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    surface: aiSurface({
      text: "Alpha leads; rival-tires.com follows and competitor-tires.com trails.",
      markdown: null,
    }),
  }), "google_ai_mode", brand, ["rival-tires.com", "competitor-tires.com"]);

  assert.deepEqual(result.competitorsMentioned, ["rival-tires.com", "competitor-tires.com"]);
});

test("a legitimate absent surface produces zeroed signals with an empty raw response", () => {
  const result = dataforseoResultFromResponse(
    syntheticDataForSeoResponse({ present: false }),
    "google_ai_mode",
    brand,
    ["rival-tires.com"],
  );

  assert.deepEqual(result, {
    modelId: "google_ai_mode",
    appeared: false,
    position: null,
    sentiment: null,
    competitorsMentioned: [],
    citationPresent: false,
    rawResponse: "",
  });
});

test("raw response falls back to the plain text when markdown is absent", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    surface: aiSurface({ text: "Alpha is trusted.", markdown: null }),
  }), "google_ai_mode", brand, []);

  assert.equal(result.rawResponse, "Alpha is trusted.");
  assert.equal(result.citationPresent, true);
});

test("text-only answer with no references has no citations", () => {
  const result = dataforseoResultFromResponse(syntheticDataForSeoResponse({
    surface: aiSurface({
      text: "Alpha is trusted by drivers.",
      markdown: null,
      references: null,
    }),
  }), "google_ai_mode", brand, []);

  assert.equal(result.rawResponse, "Alpha is trusted by drivers.");
  assert.equal(result.citationPresent, false);
});

test("the knowledge graph fixture composes through the provider normalizer", () => {
  const result = dataforseoResultFromResponse(
    fixtures.aiOverviewKnowledgeGraphSuccess as SerpGoogleAiModeLiveAdvancedResponseInfo,
    "google_ai_overview",
    "apple",
    ["beta.example"],
    null,
  );

  assert.equal(result.modelId, "google_ai_overview");
  assert.equal(result.appeared, true);
  assert.equal(result.position, 1);
  assert.equal(result.sentiment, "neutral");
  assert.equal(result.citationPresent, true);
  assert.deepEqual(result.competitorsMentioned, []);
  assert.equal(result.rawResponse, "Apple pie became associated with American identity.");
});

test("usage extraction reports a deterministic call meter with the vendor cost", () => {
  const usage = usageFromDataForSeo({
    vendor: "dataforseo",
    engine: "google_ai_mode",
    isAnswerPresent: true,
    answerText: "Alpha is a strong option.",
    answerMarkdown: null,
    references: [],
    taskId: "task-1",
    costUsd: 0.004,
    resultTimestamp: null,
    checkUrl: null,
    metadata: {
      keyword: "best tires",
      resultType: "ai_mode",
      surfaceType: "ai_overview",
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["ai_overview"],
      rankGroup: 1,
      rankAbsolute: 1,
      asynchronousAiOverview: null,
    },
  }, [DATAFORSEO_AI_MODE_METER]);

  assert.deepEqual(usage.tokens, {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
  });
  assert.deepEqual(usage.meters, [{
    ...DATAFORSEO_AI_MODE_METER,
    quantity: 1,
    source: "deterministic",
    // Vendor USD -> system micro-USD convention.
    providerCostMicroUsd: 4_000,
  }]);
});

test("overview extraction bills two units for a fresh asynchronous overview", () => {
  const usage = usageFromDataForSeo({
    vendor: "dataforseo",
    engine: "google_ai_overview",
    isAnswerPresent: true,
    answerText: "Fresh answer.",
    answerMarkdown: null,
    references: [],
    taskId: "task-async",
    costUsd: 0.004,
    resultTimestamp: null,
    checkUrl: null,
    metadata: {
      keyword: "best tires",
      resultType: "organic",
      surfaceType: "ai_overview",
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["ai_overview"],
      rankGroup: 1,
      rankAbsolute: 1,
      asynchronousAiOverview: true,
    },
  }, [DATAFORSEO_AI_OVERVIEW_METER]);

  assert.deepEqual(usage.meters, [{
    ...DATAFORSEO_AI_OVERVIEW_METER,
    quantity: 2,
    source: "deterministic",
    providerCostMicroUsd: 4_000,
  }]);
});

test("overview extraction bills one unit for a cached overview", () => {
  const usage = usageFromDataForSeo({
    vendor: "dataforseo",
    engine: "google_ai_overview",
    isAnswerPresent: true,
    answerText: "Cached answer.",
    answerMarkdown: null,
    references: [],
    taskId: "task-cached",
    costUsd: 0.002,
    resultTimestamp: null,
    checkUrl: null,
    metadata: {
      keyword: "best tires",
      resultType: "organic",
      surfaceType: "ai_overview",
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["ai_overview"],
      rankGroup: 1,
      rankAbsolute: 1,
      asynchronousAiOverview: false,
    },
  }, [DATAFORSEO_AI_OVERVIEW_METER]);

  assert.deepEqual(usage.meters, [{
    ...DATAFORSEO_AI_OVERVIEW_METER,
    quantity: 1,
    source: "deterministic",
    providerCostMicroUsd: 2_000,
  }]);
});

test("usage extraction rejects meters from the other engine", () => {
  assert.throws(
    () => usageFromDataForSeo({
      vendor: "dataforseo",
      engine: "google_ai_overview",
      isAnswerPresent: false,
      answerText: null,
      answerMarkdown: null,
      references: [],
      taskId: "task-2",
      costUsd: 0.005,
      resultTimestamp: null,
      checkUrl: null,
      metadata: {
        keyword: "best tires",
        resultType: "organic",
        surfaceType: null,
        locationCode: 2840,
        languageCode: "en",
        itemTypes: ["organic"],
        rankGroup: null,
        rankAbsolute: null,
        asynchronousAiOverview: null,
      },
    }, [DATAFORSEO_AI_MODE_METER]),
    /Unsupported DataForSEO meter/,
  );
});

test("metered execution prices the call at the provider-reported cost", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const result = await runDataForSeo(
    "google_ai_mode",
    request,
    undefined,
    { fetchImpl: fixtureFetch("aiModeSuccess", calls) },
  );

  assert.equal(result.taskId, "fixture-ai-mode-task");
  // One transport call — the funnel adds no provider requests.
  assert.equal(calls.length, 1);
});

test("a token-less dataforseo profile projects purely on meter rates", async () => {
  // Historical rows for a DataForSEO job carry zero tokens and a provider-
  // cost meter; the projection is quantity × NOW-config rate with zero
  // token contribution — proven via computeCostMicroUsd with injected deps.
  const usage = usageFromDataForSeo({
    vendor: "dataforseo",
    engine: "google_ai_mode",
    isAnswerPresent: false,
    answerText: null,
    answerMarkdown: null,
    references: [],
    taskId: "task-3",
    costUsd: 0.003,
    resultTimestamp: null,
    checkUrl: null,
    metadata: {
      keyword: "best tires",
      resultType: "ai_mode",
      surfaceType: null,
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["organic"],
      rankGroup: null,
      rankAbsolute: null,
      asynchronousAiOverview: null,
    },
  }, [DATAFORSEO_AI_MODE_METER]);

  const priced = await computeCostMicroUsd("dataforseo", "google_ai_mode", usage, {
    expectedMeters: [DATAFORSEO_AI_MODE_METER],
    getPricing: async () => ({ inputPerMTok: 1, outputPerMTok: 1 }),
    getMeterPricing: async () => ({ unit: "task", rateMicroUsd: 4_000 }),
  });

  // Provider-reported cost wins over the configured rate; tokens bill zero.
  assert.equal(priced.costMicroUsd, 3_000);
  assert.deepEqual(priced.meters, [{
    ...DATAFORSEO_AI_MODE_METER,
    quantity: 1,
    source: "deterministic",
    providerCostMicroUsd: 3_000,
    rateMicroUsd: 4_000,
    costMicroUsd: 3_000,
  }]);
});
