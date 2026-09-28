import { type CitationEntry, formatSourcesAppendix } from "../citations";

// gpt-5-search-api returns per-span annotations; OpenAI chat completions
// without a search model return none.
export function extractOpenaiCitations(response: any): CitationEntry[] {
  const annotations = response?.choices?.[0]?.message?.annotations ?? [];
  const out: CitationEntry[] = [];
  for (const a of annotations) {
    if (a?.type === "url_citation" && a?.url_citation?.url) {
      out.push({ url: a.url_citation.url, title: a.url_citation.title ?? null });
    }
  }
  return out;
}

export function openaiOutputText(response: any): string {
  const baseText = response?.choices?.[0]?.message?.content ?? "";
  const appendix = formatSourcesAppendix(extractOpenaiCitations(response));
  return appendix ? `${baseText}\n\n${appendix}` : baseText;
}
