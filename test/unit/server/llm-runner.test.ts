import assert from "node:assert/strict";
import test from "node:test";
import { runPromptAcrossModels, textIncludeVariant, extractInfo, type LLMResult } from "../../../server/llm-runner";
import { perplexityResultFromResponse, perplexityCitationAppendix, stripPerplexityMarkers } from "../../../server/services/llm-provider/perplexity/output";
import { AiUsageCapExceededError } from "../../../server/services/ai-usage/cap";

function result(modelId: string): LLMResult {
  return {
    modelId,
    appeared: false,
    position: null,
    sentiment: null,
    competitorsMentioned: [],
    citationPresent: false,
    rawResponse: `${modelId} response`,
  };
}

test("multi-provider scan keeps successful results when Anthropic is unavailable", async () => {
  const results = await runPromptAcrossModels(
    "prompt",
    "brand",
    [],
    undefined,
    undefined,
    undefined,
    {
      openai: async () => result("openai"),
      anthropic: async () => { throw new Error("Anthropic usage limit reached"); },
      gemini: async () => result("gemini"),
    },
  );

  assert.deepEqual(results.map(({ modelId }) => modelId), ["openai", "gemini"]);
});

test("multi-provider scan keeps other providers when OpenAI is unavailable", async () => {
  const results = await runPromptAcrossModels(
    "prompt",
    "brand",
    [],
    undefined,
    undefined,
    undefined,
    {
      openai: async () => { throw new Error("OpenAI unavailable"); },
      anthropic: async () => result("anthropic"),
      gemini: async () => result("gemini"),
    },
  );

  assert.deepEqual(results.map(({ modelId }) => modelId), ["anthropic", "gemini"]);
});

test("multi-provider scan runs all four providers including Perplexity", async () => {
  const results = await runPromptAcrossModels(
    "prompt",
    "brand",
    [],
    undefined,
    undefined,
    undefined,
    {
      openai: async () => result("openai"),
      anthropic: async () => result("anthropic"),
      gemini: async () => result("gemini"),
      perplexity: async () => result("perplexity"),
    },
  );

  assert.deepEqual(results.map(({ modelId }) => modelId), ["openai", "anthropic", "gemini", "perplexity"]);
});

test("multi-provider scan keeps other providers when Perplexity is unavailable", async () => {
  const results = await runPromptAcrossModels(
    "prompt",
    "brand",
    [],
    undefined,
    undefined,
    undefined,
    {
      openai: async () => result("openai"),
      anthropic: async () => result("anthropic"),
      gemini: async () => result("gemini"),
      perplexity: async () => { throw new Error("Perplexity unavailable"); },
    },
  );

  assert.deepEqual(results.map(({ modelId }) => modelId), ["openai", "anthropic", "gemini"]);
});

test("multi-provider scan propagates Perplexity usage-cap failures", async () => {
  const capError = new AiUsageCapExceededError({
    enabled: true,
    plan: "standard",
    status: "blocked",
    warningThreshold: 0.9,
    blockedBy: ["monthly"],
  });

  await assert.rejects(
    runPromptAcrossModels(
      "prompt",
      "brand",
      [],
      undefined,
      undefined,
      undefined,
      {
        openai: async () => result("openai"),
        anthropic: async () => result("anthropic"),
        gemini: async () => result("gemini"),
        perplexity: async () => { throw capError; },
      },
    ),
    (error: unknown) => error instanceof AiUsageCapExceededError,
  );
});

test("Perplexity structured search results set citationPresent", () => {
  const response = {
    status: "completed",
    output: [
      {
        type: "search_results",
        queries: ["best brand"],
        results: [{ id: 1, url: "https://example.com", title: "Example", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" }],
      },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Best brand answers here", annotations: [], logprobs: [] }],
      },
    ],
  };

  const info = perplexityResultFromResponse(response, "brand", []);
  assert.equal(info.modelId, "perplexity");
  assert.equal(info.citationPresent, true);
});

test("Perplexity response without search results sets citationPresent false", () => {
  const response = {
    status: "completed",
    output: [
      { type: "message", content: [{ type: "output_text", text: "Plain answer", annotations: [] }] },
    ],
  };

  assert.equal(perplexityResultFromResponse(response, "brand", []).citationPresent, false);
});

test("Perplexity non-completed status becomes a provider failure", () => {
  assert.throws(
    () => perplexityResultFromResponse({ status: "failed", output: [] }, "brand", []),
    /did not complete/,
  );
});

test("Perplexity empty answer becomes a provider failure", () => {
  assert.throws(
    () => perplexityResultFromResponse({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "   ", annotations: [] }] }],
    }, "brand", []),
    /empty answer/,
  );
});

const citationResponse = {
  status: "completed",
  output: [
    { type: "search_results", queries: ["q"], results: [
      { id: 1, url: "https://a.example/one", title: "First source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
      { id: 2, url: "https://b.example/two", title: "Second source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
    ] },
    { type: "search_results", queries: ["q2"], results: [
      { id: 3, url: "https://c.example/three", title: "Third source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
    ] },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "", annotations: [], logprobs: [] }] },
  ],
};

test("citation appendix renumbers [web:N] markers sequentially, dedupes by url, and appends linked sources", () => {
  const out = perplexityCitationAppendix("Claim one [web:1]. Claim three [web:3]. Claim out of range [web:9].", citationResponse);
  assert.ok(!out.includes("[web:"), "markers are stripped");
  assert.ok(out.includes("Claim one [1]. Claim three [2]. Claim out of range."));
  assert.ok(out.endsWith(
    "\n\nSources:\n\n[1] [First source](https://a.example/one)\n\n[2] [Third source](https://c.example/three)",
  ), `unexpected appendix:\n${out}`);
});

test("citation appendix reuses one number for repeated urls", () => {
  const response = {
    status: "completed",
    output: [
      { type: "search_results", queries: ["q"], results: [
        { id: 1, url: "https://dup.example/page", title: "Dup source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
        { id: 2, url: "https://solo.example/page", title: "Solo source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
      ] },
      { type: "search_results", queries: ["q2"], results: [
        { id: 3, url: "https://dup.example/page", title: "Dup again", snippet: "s", date: "2026-01-02", last_updated: "2026-01-02", source: "web" },
      ] },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "", annotations: [], logprobs: [] }] },
    ],
  };
  const out = perplexityCitationAppendix("Same [web:1], solo [web:2], dup again [web:3].", response);
  assert.ok(out.includes("Same [1], solo [2], dup again [1]."));
  assert.ok(out.endsWith("\n\nSources:\n\n[1] [Dup source](https://dup.example/page)\n\n[2] [Solo source](https://solo.example/page)"));
});

test("citation appendix omits the Sources block when no markers or no resolvable sources", () => {
  assert.equal(perplexityCitationAppendix("Plain answer.", citationResponse), "Plain answer.");
  assert.equal(perplexityCitationAppendix("Only out-of-range [web:99].", { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "", annotations: [], logprobs: [] }] }] }), "Only out-of-range.");
});

test("stripPerplexityMarkers removes markers without touching other brackets", () => {
  assert.equal(stripPerplexityMarkers("Cited [web:1] and [web:12]. Keep [1] literal."), "Cited and. Keep [1] literal.");
});

test("scan answer without inline markers still lists its search sources", () => {
  const info = perplexityResultFromResponse({
    status: "completed",
    output: [
      { type: "search_results", queries: ["q"], results: [
        { id: 1, url: "https://a.example/found", title: "Found source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
        { id: 2, url: "https://b.example/found", title: "Second found", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
      ] },
      { type: "search_results", queries: ["q2"], results: [
        { id: 3, url: "https://a.example/found", title: "Found again", snippet: "s", date: "2026-01-02", last_updated: "2026-01-02", source: "web" },
      ] },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Alpon offers custom blockchain and AI engineering.", annotations: [], logprobs: [] }] },
    ],
  }, "brand", []);
  assert.ok(info.rawResponse.startsWith("Alpon offers custom blockchain and AI engineering."), `unexpected prose:\n${info.rawResponse}`);
  assert.ok(info.rawResponse.endsWith("\n\nSources:\n\n[1] [Found source](https://a.example/found)\n\n[2] [Second found](https://b.example/found)"), `unexpected appendix:\n${info.rawResponse}`);
  assert.equal(info.citationPresent, true);
});

test("scan answer with inline markers does not double-append the source list", () => {
  const info = perplexityResultFromResponse({
    status: "completed",
    output: [
      { type: "search_results", queries: ["q"], results: [
        { id: 1, url: "https://a.example/found", title: "Found source", snippet: "s", date: "2026-01-01", last_updated: "2026-01-01", source: "web" },
      ] },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Grounded claim [web:1].", annotations: [], logprobs: [] }] },
    ],
  }, "brand", []);
  assert.equal((info.rawResponse.match(/Sources:\n/g) || []).length, 1, `appendix must appear exactly once:\n${info.rawResponse}`);
  assert.equal(info.rawResponse, "Grounded claim [1].\n\nSources:\n\n[1] [Found source](https://a.example/found)");
});

test("2-letter brand matches standalone but not inside words", () => {
  const hit = extractInfo("I love LG. Great TVs.", "LG", []);
  assert.equal(hit.appeared, true);
  assert.equal(hit.position, 1);

  const miss = extractInfo("The dialogue about the flagship algorithm continues.", "LG", []);
  assert.equal(miss.appeared, false);
  assert.equal(miss.position, null);
});

test("1-letter brand matches standalone X only", () => {
  const hit = extractInfo("I bought X yesterday.", "X", []);
  assert.equal(hit.appeared, true);

  for (const text of ["SpaceX launched.", "Texas instrument.", "Extra features."]) {
    assert.equal(extractInfo(text, "X", []).appeared, false, text);
  }
});

test("short brand matches across punctuation and case", () => {
  assert.equal(extractInfo("(BE) is great.", "be", []).appeared, true);
  assert.equal(extractInfo("Have you tried LG?", "lg", []).appeared, true);
  assert.equal(extractInfo("BE.", "BE", []).appeared, true);
});

test("regex-special brand is matched literally", () => {
  const hit = extractInfo("I use A.C daily.", "A.C", []);
  assert.equal(hit.appeared, true);

  const miss = extractInfo("I use ABC daily.", "A.C", []);
  assert.equal(miss.appeared, false);
});

test("short companyName alias is honored", () => {
  const hit = extractInfo("BE announced earnings.", "Some Long Brand Name", [], "BE");
  assert.equal(hit.appeared, true);
});

test("position and sentiment still work with short brands", () => {
  const r = extractInfo("Nothing here. LG is the best choice.", "LG", []);
  assert.equal(r.appeared, true);
  assert.equal(r.position, 2);
  assert.equal(r.sentiment, "positive");
});

test("textIncludeVariant: short names match standalone only", () => {
  assert.equal(textIncludeVariant("I love LG.", "LG"), true);
  assert.equal(textIncludeVariant("dialogue flagship algorithm", "LG"), false);
  assert.equal(textIncludeVariant("(BE) is great", "BE"), true);
  assert.equal(textIncludeVariant("obey", "BE"), false);
});
test("textIncludeVariant: single char and case", () => {
  assert.equal(textIncludeVariant("I bought X.", "X"), true);
  assert.equal(textIncludeVariant("SpaceX launched", "X"), false);
  assert.equal(textIncludeVariant("have you tried lg?", "LG"), true);
  assert.equal(textIncludeVariant("BE.", "be"), true);
});
test("textIncludeVariant: regex chars are literal", () => {
  assert.equal(textIncludeVariant("I use A.C daily.", "A.C"), true);
  assert.equal(textIncludeVariant("I use ABC daily.", "A.C"), false);
  assert.equal(textIncludeVariant("price (low)", "(low)"), true);
});
test("textIncludeVariant: long names keep substring recall, empty is false", () => {
  assert.equal(textIncludeVariant("I love Acme Shoes.", "acme"), true);
  assert.equal(textIncludeVariant("anything", ""), false);
});
