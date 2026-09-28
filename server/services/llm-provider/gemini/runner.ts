import { GoogleGenAI } from "@google/genai";
import { executeAiCall, type AiUsageContext } from "../../ai-usage";
import { usageFromGemini } from "./usage";
import { extractInfo, type LLMResult } from "../../../llm-runner";
import { GEMINI_GROUNDED_PROMPT_METER } from "@shared/ai-billing";
import { geminiOutputText } from "./output";
import { fakeAiSleep, fakeVisibilityText, isFakeAiEnabled, maybeThrowFakeAiError } from "../../fake-ai";

export async function runGemini(prompt: string, brandName: string, competitors: string[], companyName?: string | null, systemPrompt?: string | null, usage?: AiUsageContext): Promise<LLMResult> {
  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("gemini visibility scan");
    const text = fakeVisibilityText(prompt, brandName, competitors, "gemini");
    return { modelId: "gemini", ...extractInfo(text, brandName, competitors, companyName) };
  }
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await executeAiCall(
    usage,
    "gemini",
    "gemini-2.5-flash",
    () => client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 2048,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        tools: [{ googleSearch: {} }],
      },
    }),
    usageFromGemini,
    { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
  );
  const text = geminiOutputText(response);
  return { modelId: "gemini", ...extractInfo(text, brandName, competitors, companyName) };
}
