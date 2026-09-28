/**
 * Test script to verify all LLM API keys are working correctly
 * Run with: tsx server/test-llm-apis.ts
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Perplexity from "@perplexity-ai/perplexity_ai";
import OpenAI from "openai";
import {
  usageFromAnthropic,
} from "./services/llm-provider/anthropic/usage";
import {
  usageFromGemini,
} from "./services/llm-provider/gemini/usage";
import {
  usageFromOpenAI,
} from "./services/llm-provider/openai/usage";
import {
  GEMINI_SEARCH_QUERY_METER,
  OPENAI_WEB_SEARCH_METER,
  anthropicWebSearchMeter,
} from "@shared/ai-billing";

interface TestResult {
  service: string;
  status: "success" | "error";
  message: string;
  details?: any;
}

const results: TestResult[] = [];

// Test OpenAI API
async function testOpenAI() {
  console.log("\n🔵 Testing OpenAI API...");
  try {
    const apiKey = process.env.OPENAI_DIRECT_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_DIRECT_KEY not found in environment");
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-5-search-api",
      messages: [{ role: "user", content: "What is the official OpenAI API documentation domain? Answer in one sentence." }],
      max_completion_tokens: 100,
      web_search_options: {},
    });

    const message = response.choices[0]?.message?.content || "";
    const citationCount = response.choices[0]?.message?.annotations?.length || 0;
    const usage = usageFromOpenAI(response, [OPENAI_WEB_SEARCH_METER]);
    if (!message || citationCount === 0) {
      throw new Error("OpenAI search response did not include text and citations");
    }
    results.push({
      service: "OpenAI Search",
      status: "success",
      message: `✅ Working - Response: ${message}`,
      details: {
        model: response.model,
        responseLength: message.length,
        citationCount,
        meters: usage.meters,
      },
    });
    console.log(`✅ OpenAI search is working - Response: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      service: "OpenAI Search",
      status: "error",
      message: `❌ Failed: ${errorMsg}`,
      details: error,
    });
    console.error(`❌ OpenAI API failed: ${errorMsg}`);
  }
}

// Test Anthropic API
async function testAnthropic() {
  console.log("\n🟣 Testing Anthropic Claude API...");
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not found in environment");
    }

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: "Use web search to identify the official Anthropic API documentation domain. Answer in one sentence.",
      }],
      tools: [{
        type: "web_search_20250305" as any,
        name: "web_search",
        max_uses: 1,
      }],
    });

    const message = response.content[0]?.type === "text" ? response.content[0].text : "";
    const usage = usageFromAnthropic(response, [anthropicWebSearchMeter(1)]);
    results.push({
      service: "Anthropic Claude",
      status: "success",
      message: `✅ Working - Response: ${message}`,
      details: {
        model: "claude-haiku-4-5",
        responseLength: message.length,
        meters: usage.meters,
      },
    });
    console.log(`✅ Anthropic API is working - Response: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      service: "Anthropic Claude",
      status: "error",
      message: `❌ Failed: ${errorMsg}`,
      details: error,
    });
    console.error(`❌ Anthropic API failed: ${errorMsg}`);
  }
}

// Test Google Gemini API (direct via Replit integration)
async function testGeminiDirect() {
  console.log("\n🟢 Testing Google Gemini API (Direct via Replit Integration)...");
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not found in environment");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Use Google Search to identify the official Gemini API documentation domain. Answer in one sentence.",
      config: { tools: [{ googleSearch: {} }] },
    });

    const message = response.text || "";
    const usage = usageFromGemini(response, [GEMINI_SEARCH_QUERY_METER]);
    results.push({
      service: "Google Gemini (Direct)",
      status: "success",
      message: `✅ Working - Response: ${message}`,
      details: {
        model: "gemini-3.1-pro-preview",
        responseLength: message.length,
        meters: usage.meters,
      },
    });
    console.log(`✅ Google Gemini Direct API is working - Response: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      service: "Google Gemini (Direct)",
      status: "error",
      message: `❌ Failed: ${errorMsg}`,
      details: error,
    });
    console.error(`❌ Google Gemini Direct API failed: ${errorMsg}`);
  }
}

// Test Gemini AI Integrations (used for recommendations)
async function testGeminiAIIntegrations() {
  console.log("\n🟢 Testing Gemini AI Integrations (Replit)...");
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

    if (!apiKey) {
      throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY not found in environment");
    }
    if (!baseUrl) {
      throw new Error("AI_INTEGRATIONS_GEMINI_BASE_URL not found in environment");
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl,
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Say 'Gemini AI Integrations is working' in 5 words or less.",
    });

    const message = response.text || "";
    results.push({
      service: "Gemini AI Integrations (Recommendations)",
      status: "success",
      message: `✅ Working - Response: ${message}`,
      details: { model: "gemini-3.1-pro-preview", responseLength: message.length },
    });
    console.log(`✅ Gemini AI Integrations is working - Response: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      service: "Gemini AI Integrations (Recommendations)",
      status: "error",
      message: `❌ Failed: ${errorMsg}`,
      details: error,
    });
    console.error(`❌ Gemini AI Integrations failed: ${errorMsg}`);
  }
}

// Aggregate the answer text from the Agent API output items (the SDK adds an
// output_text convenience property at runtime, but not in its static types).
function perplexityOutputText(output: any): string {
  return (output ?? [])
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content ?? [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text)
    .join("\n");
}

// Test Perplexity Agent API (web-grounded visibility scans)
async function testPerplexity() {
  console.log("\n🟠 Testing Perplexity Agent API...");
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY not found in environment");
    }

    const client = new Perplexity({ apiKey });
    const response = await client.responses.create({
      preset: "low",
      model: "perplexity/sonar",
      input: "Say 'Perplexity API is working' in 5 words or less.",
    });

    const message = perplexityOutputText(response.output);
    const searchResultBatches = (response.output ?? []).filter((item: any) => item.type === "search_results").length;

    if (response.status !== "completed") {
      throw new Error(`Perplexity run did not complete (status: ${response.status})`);
    }
    if (!message) {
      throw new Error("Perplexity returned an empty answer");
    }

    results.push({
      service: "Perplexity Agent API",
      status: "success",
      message: `✅ Working - Response: ${message}`,
      details: { model: response.model, responseLength: message.length, searchResultBatches },
    });
    console.log(`✅ Perplexity Agent API is working - Response: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      service: "Perplexity Agent API",
      status: "error",
      message: `❌ Failed: ${errorMsg}`,
      details: error,
    });
    console.error(`❌ Perplexity API failed: ${errorMsg}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log("════════════════════════════════════════════════════");
  console.log("🧪 LLM API Key Testing Suite");
  console.log("════════════════════════════════════════════════════");

  await testOpenAI();
  await testAnthropic();
  await testGeminiDirect();
  await testGeminiAIIntegrations();
  await testPerplexity();

  console.log("\n════════════════════════════════════════════════════");
  console.log("📊 Test Results Summary");
  console.log("════════════════════════════════════════════════════\n");

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  results.forEach((result) => {
    console.log(`${result.status === "success" ? "✅" : "❌"} ${result.service}: ${result.message}`);
  });

  console.log("\n════════════════════════════════════════════════════");
  console.log(`Total: ${results.length} tests | ✅ ${successCount} passed | ❌ ${errorCount} failed`);
  console.log("════════════════════════════════════════════════════\n");

  if (errorCount > 0) {
    console.log("⚠️  ACTION REQUIRED:");
    results
      .filter((r) => r.status === "error")
      .forEach((r) => {
        console.log(`   - ${r.service}: Update API key in Replit Secrets`);
      });
    console.log("");
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch((error) => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});
