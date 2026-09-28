import { isAiUsageCapExceededError } from "./services/ai-usage/cap";
import type { AiUsageContext } from "./services/ai-usage";
import { runOpenAI } from "./services/llm-provider/openai/runner";
import { runAnthropic } from "./services/llm-provider/anthropic/runner";
import { runGemini } from "./services/llm-provider/gemini/runner";
import { runPerplexity } from "./services/llm-provider/perplexity/runner";

export interface LLMResult {
  modelId: string;
  appeared: boolean;
  position: number | null;
  sentiment: string | null;
  competitorsMentioned: string[];
  citationPresent: boolean;
  rawResponse: string;
}

type LLMRunner = () => Promise<LLMResult>;

export interface BrandContext {
  territory?: string | null;
  location?: string | null;
  category?: string | null;
  targetAudience?: string | null;
  products?: string | null;
  differentiators?: string | null;
  brandTone?: string | null;
}

type LLMRunners = {
  openai: LLMRunner;
  anthropic: LLMRunner;
  gemini: LLMRunner;
  perplexity?: LLMRunner;
};

// Escape RegExp metacharacters so the brand variant matches literally.
// Catches: . * + ? ^ $ { } ( ) | [ ] \
// "\\$&" prefixes each hit with a backslash, e.g. "a.c" -> "a\\.c",
// so `new RegExp()` never reads brand text as regex syntax.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Short names ("LG", "X", "BE") match standalone only.
// Long names keep substring recall.
export function textIncludeVariant(text: string, variant: string): boolean {
  if (!variant) return false;
  // Short variants (< 4 chars) match standalone only. \b is a zero-width
  // word boundary — the edge between [A-Za-z0-9_] and anything else
  // (space, punctuation, start/end of string). Wrapping both sides means
  // "LG" hits "I love LG." but not "dialogue" or "flagship".
  // "i" keeps it case-insensitive. Longer names skip this and use
  // substring matching below, where collisions are rare.
  if (variant.length < 4) {
    return new RegExp(`\\b${escapeRegExp(variant)}\\b`, "i").test(text);
  }
  return text.toLowerCase().includes(variant.toLowerCase());
}

export function extractInfo(response: string, brandName: string, competitors: string[], companyName?: string | null): Omit<LLMResult, "modelId"> {
  const brandLower = brandName.trim().toLowerCase();
  const brandClean = brandLower.replace(/\.(com|org|net|co|io|ai|co\.uk|com\.au|edu|gov|app|dev|us|ca|de|fr)$/i, "");
  const brandVariants = [...new Set(
    [brandLower, brandClean, brandClean.replace(/[-_]/g, " "), brandClean.replace(/[-_]/g, "")]
      .map(v => v.trim())
      .filter(v => v.length >= 1)
  )];
  if (companyName?.trim()) {
    const cn = companyName.trim().toLowerCase();
    if (!brandVariants.includes(cn) && cn.length >= 1) {
      brandVariants.push(cn);
    }
  }

  const appeared = brandVariants.some(v => textIncludeVariant(response, v));

  let position: number | null = null;
  const sentences = response.split(/[.!?\n]+/);
  if (appeared) {
    for (let i = 0; i < sentences.length; i++) {
      if (brandVariants.some(v => textIncludeVariant(sentences[i], v))) {
        position = i + 1;
        break;
      }
    }
  }

  let sentiment: string | null = null;
  if (appeared) {
    const positiveWords = ["leading", "best", "top", "excellent", "great", "recommended", "popular", "trusted", "powerful", "effective"];
    const negativeWords = ["poor", "bad", "worst", "issues", "problems", "lacking", "weak", "limited", "concerns"];
    let posScore = 0;
    let negScore = 0;

    const brandSentences = sentences.filter(s =>
      brandVariants.some(v => textIncludeVariant(s, v))
    );

    const textToAnalyze = (brandSentences.length > 0 ? brandSentences.join(" ") : response).toLowerCase();
    for (const w of positiveWords) if (textToAnalyze.includes(w)) posScore++;
    for (const w of negativeWords) if (textToAnalyze.includes(w)) negScore++;
    if (posScore > negScore) sentiment = "positive";
    else if (negScore > posScore) sentiment = "negative";
    else sentiment = "neutral";
  }

  // competitors + citation blocks unchanged from your current version
  const competitorsMentioned: string[] = [];
  const lower = response.toLowerCase();
  for (const comp of competitors) {
    const fullDomain = comp.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    const brandPart = fullDomain.replace(/\.(com|org|net|co|io|ai|co\.uk|com\.au|edu|gov|app|dev|us|ca|de|fr)$/i, "").toLowerCase();
    const matched = lower.includes(fullDomain) || (brandPart.length >= 3 && lower.includes(brandPart));
    if (matched) {
      competitorsMentioned.push(comp);
    }
  }

  const citationPatterns = [
    /https?:\/\//i,
    /according to/i,
    /source:/i,
    /as stated/i,
    /referenced/i,
  ];
  const citationPresent = citationPatterns.some(p => p.test(response));

  return {
    appeared,
    position,
    sentiment,
    competitorsMentioned,
    citationPresent,
    rawResponse: response,
  };
}

function buildSystemPrompt(context?: BrandContext): string | null {
  if (!context) return null;

  const { territory, location, category, targetAudience, products, differentiators, brandTone } = context;

  const hasAnyContext = category || targetAudience || products || differentiators || brandTone || location;
  if (!hasAnyContext) return null;

  const parts: string[] = [];

  const persona = targetAudience && category
    ? `${targetAudience} looking for ${category} solutions`
    : targetAudience
      ? targetAudience
      : category
        ? `someone looking for ${category} solutions`
        : `a potential customer`;

  const isRegional = territory === "regional";
  const isNational = territory === "national";

  if (location) {
    parts.push(`You are answering a question from a ${persona}, based in ${location}.`);
  } else {
    parts.push(`You are answering a question from a ${persona}.`);
  }

  if (products) {
    parts.push(`They are particularly interested in capabilities such as: ${products}.`);
  }

  if (differentiators) {
    parts.push(`Key factors they care about include: ${differentiators}.`);
  }

  if (brandTone) {
    parts.push(`Respond in a ${brandTone} tone that matches how professionals in this space communicate.`);
  }

  if (location && isRegional) {
    parts.push(
      `IMPORTANT: This user is specifically based in ${location} and strongly prefers local options. Prioritise providers based in or near ${location} first. Then list providers that actively serve the ${location} area. Only mention global or international brands after local and regional options. Do not default to US-centric recommendations. A user in ${location} expects to see businesses that operate in their area prominently — the way a local would search for services near them.`
    );
  } else if (location && isNational) {
    parts.push(
      `This user is based in ${location}. Prioritise providers that actively operate in and serve the ${location} market. Include ${location}-based companies and international companies with a strong ${location} presence. Do not default to US-centric recommendations unless the user is US-based.`
    );
  } else if (location) {
    parts.push(
      `This user is based in ${location}. Include providers relevant to the ${location} market alongside global options. Do not assume a US-centric perspective.`
    );
  } else {
    parts.push(
      `They are evaluating options that serve their market. Include relevant providers across the market.`
    );
  }

  parts.push(`Answer naturally and comprehensively. Keep your response concise — aim for no more than 2000 tokens.`);

  return parts.join(" ");
}

const MODEL_ROTATION: Record<number, string> = {
  1: "openai",
  2: "anthropic",
  3: "gemini",
  4: "openai",
  5: "anthropic",
  6: "gemini",
};

export async function runPromptForDailyModel(
  prompt: string,
  brandName: string,
  competitors: string[],
  companyName?: string | null,
  context?: BrandContext,
  usage?: AiUsageContext
): Promise<LLMResult[]> {
  const dayOfWeek = new Date().getDay();
  const modelId = MODEL_ROTATION[dayOfWeek] || "openai";
  const systemPrompt = buildSystemPrompt(context);

  const runners: Record<string, () => Promise<LLMResult>> = {
    openai: () => runOpenAI(prompt, brandName, competitors, companyName, systemPrompt, usage),
    anthropic: () => runAnthropic(prompt, brandName, competitors, companyName, systemPrompt, usage),
    gemini: () => runGemini(prompt, brandName, competitors, companyName, systemPrompt, usage),
  };

  try {
    const result = await runners[modelId]();
    return [result];
  } catch (err: any) {
    if (isAiUsageCapExceededError(err)) throw err;
    console.error(`Daily rotation: ${modelId} failed:`, err?.message);
    return [];
  }
}

export async function runPromptAcrossModels(
  prompt: string,
  brandName: string,
  competitors: string[],
  companyName?: string | null,
  context?: BrandContext,
  usage?: AiUsageContext,
  runnerOverrides?: LLMRunners,
): Promise<LLMResult[]> {
  const systemPrompt = buildSystemPrompt(context);
  const runners = runnerOverrides ?? {
    openai: () => runOpenAI(prompt, brandName, competitors, companyName, systemPrompt, usage),
    anthropic: () => runAnthropic(prompt, brandName, competitors, companyName, systemPrompt, usage),
    gemini: () => runGemini(prompt, brandName, competitors, companyName, systemPrompt, usage),
    perplexity: () => runPerplexity(prompt, brandName, competitors, companyName, systemPrompt, usage),
  };

  const runnerEntries: Array<[string, string, LLMRunner]> = [
    ["openai", "OpenAI", runners.openai],
    ["anthropic", "Anthropic", runners.anthropic],
    ["gemini", "Gemini", runners.gemini],
  ];
  if (runners.perplexity) runnerEntries.push(["perplexity", "Perplexity", runners.perplexity]);

  const settled = await Promise.allSettled(runnerEntries.map(([, , run]) => run()));

  for (const result of settled) {
    if (result.status === "rejected" && isAiUsageCapExceededError(result.reason)) {
      throw result.reason;
    }
  }

  const results: LLMResult[] = [];
  for (let index = 0; index < runnerEntries.length; index += 1) {
    const outcome = settled[index];
    const label = runnerEntries[index][1];
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      console.error(`${label} prompt failed:`, outcome.reason?.message);
    }
  }

  return results;
}
