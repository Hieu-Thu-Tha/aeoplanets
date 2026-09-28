import Perplexity from "@perplexity-ai/perplexity_ai";
import { executeAiCall, type AiUsageContext } from "../../ai-usage";
import { usageFromPerplexity } from "./usage";
import type { LLMResult } from "../../../llm-runner";
import { PERPLEXITY_SEARCH_WEB_METER } from "@shared/ai-billing";
import { perplexityResultFromResponse } from "./output";

const PERPLEXITY_MODEL = "perplexity/sonar";
const PERPLEXITY_PRESET = "low";
const PERPLEXITY_TIMEOUT_MS = 120_000;

export async function runPerplexity(prompt: string, brandName: string, competitors: string[], companyName?: string | null, systemPrompt?: string | null, usage?: AiUsageContext): Promise<LLMResult> {
  const client = new Perplexity({
    apiKey: process.env.PERPLEXITY_API_KEY,
    timeout: PERPLEXITY_TIMEOUT_MS,
  });
  const response = await executeAiCall(
    usage,
    "perplexity",
    PERPLEXITY_MODEL,
    () => client.responses.create({
      preset: PERPLEXITY_PRESET,
      model: PERPLEXITY_MODEL,
      ...(systemPrompt ? { instructions: systemPrompt } : {}),
      input: prompt,
    }),
    usageFromPerplexity,
    { expectedMeters: [PERPLEXITY_SEARCH_WEB_METER] },
  );
  return perplexityResultFromResponse(response, brandName, competitors, companyName);
}
