/**
 * Verifies whether OpenAI, Anthropic, and Gemini actually return real prompt/
 * completion token counts in their responses (vs. us having to estimate via
 * chars/4, as server/routes.ts:761-762 currently does).
 *
 * Run with: tsx scripts/test-token-usage.ts
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const PROMPT = "Reply with exactly one word: pineapple.";

function charEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

async function testOpenAI() {
  console.log("\n🔵 OpenAI (gpt-4o-mini)");
  const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: PROMPT }],
    max_tokens: 20,
  });

  const message = response.choices[0]?.message?.content || "";
  console.log("  response.usage:", JSON.stringify(response.usage, null, 2));
  console.log(`  reply: "${message}"`);
  console.log(`  chars/4 estimate: ~${charEstimate(PROMPT) + charEstimate(message)} tokens`);
  console.log(`  actual total_tokens: ${response.usage?.total_tokens ?? "MISSING"}`);
}

async function testAnthropic() {
  console.log("\n🟣 Anthropic (claude-haiku-4-5)");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 20,
    messages: [{ role: "user", content: PROMPT }],
  });

  const message = response.content[0]?.type === "text" ? response.content[0].text : "";
  console.log("  response.usage:", JSON.stringify(response.usage, null, 2));
  console.log(`  reply: "${message}"`);
  console.log(`  chars/4 estimate: ~${charEstimate(PROMPT) + charEstimate(message)} tokens`);
  const total = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  console.log(`  actual input+output tokens: ${total || "MISSING"}`);
}

async function testGemini() {
  console.log("\n🟢 Gemini (gemini-3.1-pro-preview)");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: PROMPT,
  });

  const message = response.text || "";
  console.log("  response.usageMetadata:", JSON.stringify(response.usageMetadata, null, 2));
  console.log(`  reply: "${message}"`);
  console.log(`  chars/4 estimate: ~${charEstimate(PROMPT) + charEstimate(message)} tokens`);
  console.log(`  actual totalTokenCount: ${response.usageMetadata?.totalTokenCount ?? "MISSING"}`);
}

async function main() {
  console.log("════════════════════════════════════════════════════");
  console.log("🧪 Token usage field verification");
  console.log("════════════════════════════════════════════════════");

  for (const [name, fn] of Object.entries({ OpenAI: testOpenAI, Anthropic: testAnthropic, Gemini: testGemini })) {
    try {
      await fn();
    } catch (error) {
      console.error(`\n❌ ${name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("\n════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
