import OpenAI from "openai";
import { executeAiCall, type AiUsageContext } from "../../ai-usage";
import { usageFromOpenAI } from "./usage";
import { extractInfo, type LLMResult } from "../../../llm-runner";
import { fakeAiSleep, fakeVisibilityText, isFakeAiEnabled, maybeThrowFakeAiError } from "../../fake-ai";
import { OPENAI_WEB_SEARCH_METER } from "@shared/ai-billing";
import { openaiOutputText } from "./output";

export async function runOpenAI(prompt: string, brandName: string, competitors: string[], companyName?: string | null, systemPrompt?: string | null, usage?: AiUsageContext): Promise<LLMResult> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("openai visibility scan");
    const text = fakeVisibilityText(prompt, brandName, competitors, "openai");
    return { modelId: "openai", ...extractInfo(text, brandName, competitors, companyName) };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  const response = await executeAiCall(
    usage,
    "openai",
    "gpt-5-search-api",
    () => client.chat.completions.create({
      model: "gpt-5-search-api",
      messages,
      max_completion_tokens: 4096,
      web_search_options: {},
    }),
    usageFromOpenAI,
    { expectedMeters: [OPENAI_WEB_SEARCH_METER] },
  );
  const text = openaiOutputText(response);
  return { modelId: "openai", ...extractInfo(text, brandName, competitors, companyName) };
}
