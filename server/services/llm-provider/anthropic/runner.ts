import Anthropic from "@anthropic-ai/sdk";
import { executeAiCall, type AiUsageContext } from "../../ai-usage";
import { usageFromAnthropic } from "./usage";
import { extractInfo, type LLMResult } from "../../../llm-runner";
import { anthropicWebSearchMeter } from "@shared/ai-billing";
import { anthropicOutputText } from "./output";
import { fakeAiSleep, fakeVisibilityText, isFakeAiEnabled, maybeThrowFakeAiError } from "../../fake-ai";

export async function runAnthropic(prompt: string, brandName: string, competitors: string[], companyName?: string | null, systemPrompt?: string | null, usage?: AiUsageContext): Promise<LLMResult> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("anthropic visibility scan");
    const text = fakeVisibilityText(prompt, brandName, competitors, "anthropic");
    return { modelId: "anthropic", ...extractInfo(text, brandName, competitors, companyName) };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await executeAiCall(
    usage,
    "anthropic",
    "claude-haiku-4-5",
    () => client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305" as any, name: "web_search", max_uses: 3 }],
    }),
    usageFromAnthropic,
    { expectedMeters: [anthropicWebSearchMeter(3)] },
  );
  const text = anthropicOutputText(response);
  return { modelId: "anthropic", ...extractInfo(text, brandName, competitors, companyName) };
}
