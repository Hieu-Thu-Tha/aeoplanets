import { type CitationEntry, formatSourcesAppendix } from "../citations";

// Gemini responses with the googleSearch tool enabled carry groundingChunks
// (web.uri is a grounding redirect URL, web.title is usually the domain).
export function extractGeminiCitations(response: any): CitationEntry[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const out: CitationEntry[] = [];
  for (const c of chunks) {
    if (c?.web?.uri) out.push({ url: c.web.uri, title: c.web.title ?? null });
  }
  return out;
}

export function geminiOutputText(response: any): string {
  const baseText = response?.text ?? "";
  const appendix = formatSourcesAppendix(extractGeminiCitations(response));
  return appendix ? `${baseText}\n\n${appendix}` : baseText;
}
