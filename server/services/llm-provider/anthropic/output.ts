import { type CitationEntry, formatSourcesAppendix } from "../citations";

// Anthropic web_search responses carry citations twice over: text blocks
// reference the spans actually cited, and web_search_tool_result blocks hold
// the raw search batches. Prefer the cited spans; fall back to tool results.
export function extractAnthropicCitations(response: any): CitationEntry[] {
  const out: CitationEntry[] = [];
  for (const block of response?.content ?? []) {
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url) out.push({ url: c.url, title: c.title ?? null });
      }
    }
  }
  if (out.length > 0) return out;
  for (const block of response?.content ?? []) {
    if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r?.type === "web_search_result" && r?.url) out.push({ url: r.url, title: r.title ?? null });
      }
    }
  }
  return out;
}

export function anthropicOutputText(response: any): string {
  const baseText = (response?.content ?? [])
    .filter((block: any) => block?.type === "text")
    .map((block: any) => block.text)
    .join("\n");
  const appendix = formatSourcesAppendix(extractAnthropicCitations(response));
  return appendix ? `${baseText}\n\n${appendix}` : baseText;
}
