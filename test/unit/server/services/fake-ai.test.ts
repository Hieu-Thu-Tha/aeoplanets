import assert from "node:assert/strict";
import test from "node:test";
import {
  fakeAiDelayMs,
  fakeAiErrorRate,
  fakeAiSleep,
  fakeAuditCheck,
  fakeBenchmarkSummary,
  fakeBrandResearch,
  fakeCompetitorAnalysis,
  fakeCompetitorList,
  fakeCompetitorLookup,
  fakeConfusionExplanation,
  fakeCompetitiveNarrative,
  fakeCoverageResult,
  fakeDiscoveredCompetitors,
  fakeExecutiveNarrative,
  fakeFixSuggestion,
  fakeGeneratedArticle,
  fakeGeneratedQuestions,
  fakeMarketingNarrative,
  fakePerceptionResult,
  fakeVisibilityText,
  fakeVolumeEstimates,
  fakeWeaknessReport,
  hashSeedKey,
  isFakeAiEnabled,
} from "../../../../server/services/fake-ai";
import { extractInfo } from "../../../../server/llm-runner";

test("isFakeAiEnabled recognises truthy values only", () => {
  assert.equal(isFakeAiEnabled({ FAKE_AI: "1" } as any), true);
  assert.equal(isFakeAiEnabled({ FAKE_AI: "true" } as any), true);
  assert.equal(isFakeAiEnabled({ FAKE_AI: "YES" } as any), true);
  assert.equal(isFakeAiEnabled({ FAKE_AI: "on" } as any), true);
  assert.equal(isFakeAiEnabled({} as any), false);
  assert.equal(isFakeAiEnabled({ FAKE_AI: "0" } as any), false);
  assert.equal(isFakeAiEnabled({ FAKE_AI: "false" } as any), false);
});

test("fakeAiDelayMs honours fixed value, range, and default", () => {
  assert.equal(fakeAiDelayMs({ FAKE_AI_DELAY_MS: "5" } as any), 5);
  assert.equal(fakeAiDelayMs({} as any), 120);
  assert.equal(fakeAiDelayMs({ FAKE_AI_DELAY_MS: "nope" } as any), 120);
  for (let i = 0; i < 50; i++) {
    const d = fakeAiDelayMs({ FAKE_AI_DELAY_MIN_MS: "10", FAKE_AI_DELAY_MAX_MS: "20" } as any);
    assert.ok(d >= 10 && d <= 20, `delay ${d} out of range`);
  }
});

test("fakeAiSleep waits roughly the configured delay", async () => {
  const start = Date.now();
  await fakeAiSleep({ FAKE_AI_DELAY_MS: "15" } as any);
  assert.ok(Date.now() - start >= 10, "sleep returned too early");
});

test("fakeAiErrorRate clamps to [0, 1]", () => {
  assert.equal(fakeAiErrorRate({} as any), 0);
  assert.equal(fakeAiErrorRate({ FAKE_AI_ERROR_RATE: "0.5" } as any), 0.5);
  assert.equal(fakeAiErrorRate({ FAKE_AI_ERROR_RATE: "9" } as any), 1);
  assert.equal(fakeAiErrorRate({ FAKE_AI_ERROR_RATE: "junk" } as any), 0);
});

test("hashSeedKey is deterministic", () => {
  assert.equal(hashSeedKey("abc"), hashSeedKey("abc"));
  assert.notEqual(hashSeedKey("abc"), hashSeedKey("abd"));
});

test("fakeVisibilityText parses through the real extractInfo across variants", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const text = fakeVisibilityText(`stress prompt ${i}`, "Acme", ["rival.com"], "openai");
    const parsed = extractInfo(text, "Acme", ["rival.com"]);
    assert.equal(typeof parsed.appeared, "boolean");
    assert.ok(parsed.position === null || typeof parsed.position === "number");
    assert.ok(parsed.sentiment === null || typeof parsed.sentiment === "string");
    assert.ok(Array.isArray(parsed.competitorsMentioned));
    assert.equal(typeof parsed.citationPresent, "boolean");
    assert.ok(parsed.rawResponse.length > 0);
    seen.add(`${parsed.appeared}:${parsed.sentiment}:${parsed.citationPresent}`);
  }
  // Deterministic rotation must yield a mix, not identical rows.
  assert.ok(seen.size > 1, `expected varied fake results, got ${Array.from(seen)}`);
});

test("provider runners return schema-valid fakes with no API keys", async () => {
  const saved = {
    FAKE_AI: process.env.FAKE_AI,
    FAKE_AI_DELAY_MS: process.env.FAKE_AI_DELAY_MS,
    OPENAI_DIRECT_KEY: process.env.OPENAI_DIRECT_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  };
  process.env.FAKE_AI = "1";
  process.env.FAKE_AI_DELAY_MS = "0";
  delete process.env.OPENAI_DIRECT_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  try {
    const { runOpenAI } = await import("../../../../server/services/llm-provider/openai/runner");
    const { runAnthropic } = await import("../../../../server/services/llm-provider/anthropic/runner");
    const { runGemini } = await import("../../../../server/services/llm-provider/gemini/runner");
    const { runPerplexity } = await import("../../../../server/services/llm-provider/perplexity/runner");
    const results = await Promise.all([
      runOpenAI("q", "Acme", ["rival.com"]),
      runAnthropic("q", "Acme", ["rival.com"]),
      runGemini("q", "Acme", ["rival.com"]),
      runPerplexity("q", "Acme", ["rival.com"]),
    ]);
    const ids = results.map((r) => r.modelId).sort();
    assert.deepEqual(ids, ["anthropic", "gemini", "openai", "perplexity"]);
    for (const r of results) {
      assert.equal(typeof r.appeared, "boolean");
      assert.ok(r.rawResponse.length > 0);
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("fakePerceptionResult satisfies the PerceptionData shape", () => {
  const p = fakePerceptionResult("Acme") as any;
  assert.ok(p.summary.includes("Acme"));
  assert.ok(Array.isArray(p.strengths) && p.strengths.length > 0);
  assert.ok(Array.isArray(p.weaknesses) && p.weaknesses.length > 0);
  assert.ok(typeof p.inferredAudience === "string");
  assert.ok(typeof p.marketTier === "string");
  assert.ok(Array.isArray(p.topImprovements) && p.topImprovements.length === 5);
  for (const k of ["positioningScore", "authorityScore", "proofScore", "differentiationScore"]) {
    assert.ok(typeof p[k] === "number" && p[k] >= 0 && p[k] <= 100, k);
  }
});

test("fakeCoverageResult satisfies the coverage schema", () => {
  const c = fakeCoverageResult("Acme", ["rival.com"]);
  assert.ok(c.topicClusters.length >= 5);
  assert.ok(c.missingTopics.length >= 3);
  assert.ok(c.recommendations.length >= 3);
  for (const r of c.recommendations) {
    assert.ok(["high", "medium", "low"].includes(r.gapSeverity));
    assert.ok(typeof r.recommendedAction === "string" && r.recommendedAction.length > 0);
  }
});

test("fakeAuditCheck returns a valid check detail", () => {
  const check = fakeAuditCheck("Organisation Schema", "organisation_schema", "acme.com");
  assert.equal(check.name, "Organisation Schema");
  assert.ok(["pass", "fail", "warning"].includes(check.status));
  assert.ok(check.whatIsThis.length > 0 && check.whatToFix.length > 0);
});

test("fakeGeneratedArticle meets news-generator validation", () => {
  const a = fakeGeneratedArticle("AEO trends", ["AEO indexing"]);
  assert.ok(a.title && a.content && a.metaDescription);
  assert.ok(a.slug.length > 0);
  assert.equal(a.questionsAnswered.length, 3);
  assert.equal(a.keyTakeaways.length, 5);
});

test("fakeVolumeEstimates returns tight ordered ranges", () => {
  const ests = fakeVolumeEstimates("seed", 3);
  assert.equal(ests.length, 3);
  ests.forEach((e, i) => {
    assert.equal(e.index, i + 1);
    assert.ok(e.volume_min > 0 && e.volume_max >= e.volume_min);
    assert.equal(e.volume_label, `${e.volume_min}-${e.volume_max}`);
  });
});

test("fake competitor and weakness shapes", () => {
  assert.equal(fakeDiscoveredCompetitors("Acme").length, 2);
  assert.equal(fakeCompetitorList("Acme").length, 3);
  const w = fakeWeaknessReport("Rival");
  assert.ok(["positive", "mixed", "negative"].includes(w.overallSentiment));
  assert.ok(w.complaints.length > 0 && w.vulnerabilities.length > 0);
  const analysis = fakeCompetitorAnalysis("Rival", "Acme");
  assert.ok(analysis.overview.includes("Rival") && analysis.howToCompete.includes("Acme"));
});

test("fake routes shapes", () => {
  const research = fakeBrandResearch("https://acme.com");
  assert.ok(research.brandName.length > 0);
  assert.ok(research.suggestedTerms.length >= 5);
  assert.equal(research.brandTone, "professional");
  const lookup = fakeCompetitorLookup("https://rival.com/page");
  assert.equal(lookup.domain, "rival.com");
  assert.ok(fakeConfusionExplanation("marker", "Acme").includes("Acme"));
  assert.ok(fakeBenchmarkSummary("acme.com", 2).includes("acme.com"));
  assert.ok(fakeFixSuggestion("Ticket", "acme.com").includes("<h3>"));
});

test("fake question generation covers every funnel stage", () => {
  const { userQuestions, brandSentiment } = fakeGeneratedQuestions("lead scoring", "Acme", [
    "awareness",
    "consideration",
    "commercial",
  ]);
  assert.equal(userQuestions.length, 3);
  assert.equal(brandSentiment.length, 3);
  for (const q of brandSentiment) assert.ok(q.question.includes("Acme"));
  for (const q of userQuestions) assert.ok(!q.question.includes("Acme"));
});

test("fake report narratives carry the brand domain", () => {
  const exec = fakeExecutiveNarrative("acme.com");
  assert.ok(exec.executiveSummary.includes("acme.com"));
  assert.ok(exec.strategicActions.length >= 5);
  const marketing = fakeMarketingNarrative("acme.com", ["rival.com"]);
  assert.equal(marketing.actionItems.length, 5);
  assert.equal(marketing.comparisonPages.length, 3);
  const comp = fakeCompetitiveNarrative("acme.com", ["rival.com"]);
  assert.ok(comp.threatAssessment.includes("acme.com"));
  assert.ok(comp.competitorStrategies.length > 0);
});
