import { GoogleGenAI } from "@google/genai";
import { executeAiCall, type AiUsageContext } from "./ai-usage";
import { usageFromGemini } from "./llm-provider/gemini/usage";
import { geminiGoogleSearchMeter } from "@shared/ai-billing";

const TRANSIENT_PATTERNS = [
  "503",
  "UNAVAILABLE",
  "overloaded",
  "high demand",
  "rate limit",
  "RESOURCE_EXHAUSTED",
  "deadline",
  "ETIMEDOUT",
  "ECONNRESET",
];

function isTransientError(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || String(err)).toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";

function usesGoogleSearch(config: any): boolean {
  return Array.isArray(config?.tools)
    && config.tools.some((tool: any) => tool?.googleSearch != null);
}

export interface GeminiRetryOptions {
  model: string;
  contents: any;
  config?: any;
  maxAttempts?: number;
  fallbackModel?: string | null;
  label?: string;
  // When set, token usage is recorded per successful call — inside this
  // helper so the logged model is the one that actually served the request
  // (primary or fallback). Callers must not log again themselves.
  usage?: AiUsageContext;
}

/**
 * Calls Gemini's generateContent with exponential backoff on transient errors
 * (503/UNAVAILABLE/overloaded/etc). After the configured number of attempts,
 * optionally falls back to a stable model (default gemini-2.5-flash).
 */
export async function callGeminiWithRetry(
  client: GoogleGenAI,
  opts: GeminiRetryOptions,
): Promise<any> {
  const {
    model,
    contents,
    config,
    maxAttempts = 3,
    fallbackModel = DEFAULT_FALLBACK_MODEL,
    label = "gemini",
    usage,
  } = opts;

  let lastError: any;
  const hasGoogleSearch = usesGoogleSearch(config);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await executeAiCall(
        usage,
        "gemini",
        model,
        () => client.models.generateContent({ model, contents, config }),
        usageFromGemini,
        {
          expectedMeters: hasGoogleSearch ? [geminiGoogleSearchMeter(model)] : [],
        },
      );
      return response;
    } catch (err: any) {
      lastError = err;
      if (!isTransientError(err) || attempt === maxAttempts) break;
      const delay = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`[${label}] transient error on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms: ${err?.message || err}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  if (fallbackModel && fallbackModel !== model && isTransientError(lastError)) {
    console.warn(`[${label}] primary model "${model}" exhausted retries, falling back to "${fallbackModel}"`);
    try {
      const response = await executeAiCall(
        usage,
        "gemini",
        fallbackModel,
        () => client.models.generateContent({ model: fallbackModel, contents, config }),
        usageFromGemini,
        {
          expectedMeters: hasGoogleSearch ? [geminiGoogleSearchMeter(fallbackModel)] : [],
        },
      );
      return response;
    } catch (fallbackErr: any) {
      lastError = fallbackErr;
    }
  }

  throw lastError;
}

/**
 * Translates a Gemini API error into a short, user-friendly message suitable
 * for surfacing in the UI without exposing raw JSON envelopes.
 */
export function friendlyGeminiError(err: any, fallback = "AI service temporarily unavailable. Please try again in a moment."): string {
  const raw = err?.message || String(err) || "";
  if (isTransientError(err)) {
    return "Our AI provider is currently overloaded. Please try again in a moment.";
  }
  if (/api key|permission|unauthorized/i.test(raw)) {
    return "AI service authentication failed. Please contact support.";
  }
  if (/timeout|timed out|deadline/i.test(raw)) {
    return "The AI request timed out. Please try again.";
  }
  return fallback;
}
