import { extractInfo, type LLMResult } from "../../../llm-runner";
import { formatEntryLine, formatSourcesAppendix } from "../citations";

// Aggregate the answer text from the Agent API output items (the SDK adds an
// output_text convenience property at runtime, but not in its static types).
export function perplexityOutputText(response: { output?: any }): string {
  return (response?.output ?? [])
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content ?? [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text)
    .join("\n");
}

// Flatten search/fetch result batches in output order. [web:N] markers index
// into this exact sequence (1-based, measured in docs/08) — order is the
// marker contract, so results are never deduplicated.
function flattenPerplexitySources(response: any): Array<{ url: string; title: string | null }> {
  const flat: Array<{ url: string; title: string }> = [];
  for (const item of response?.output ?? []) {
    if (item?.type === "search_results") {
      for (const r of item.results ?? []) {
        if (r?.url) flat.push({ url: r.url, title: r.title ?? r.url });
      }
    } else if (item?.type === "fetch_url_results") {
      for (const c of item.contents ?? []) {
        if (c?.url) flat.push({ url: c.url, title: c.title ?? c.url });
      }
    }
  }
  return flat;
}

export function stripPerplexityMarkers(text: string): string {
  return text.replace(/\s*\[web:\d+\]/g, "");
}

// Turn sonar's inline [web:N] markers into sequential [1]-style numbers
// (deduplicated by URL, so repeated sources share one number), and append a
// numbered Sources list with clickable links. Out-of-range markers are
// dropped, never fabricated.
export function perplexityCitationAppendix(text: string, response: any): string {
  const flat = flattenPerplexitySources(response);
  const displayByMarker = new Map<number, number>();
  const entries: Array<{ url: string; title: string | null }> = [];
  const seenUrls = new Set<string>();
  const markerPattern = /\[web:(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = markerPattern.exec(text)) !== null) {
    const marker = Number(m[1]);
    if (displayByMarker.has(marker)) continue;
    const source = flat[marker - 1];
    if (!source) continue;
    let display: number;
    if (seenUrls.has(source.url)) {
      display = entries.findIndex(e => e.url === source.url) + 1;
    } else {
      seenUrls.add(source.url);
      entries.push(source);
      display = entries.length;
    }
    displayByMarker.set(marker, display);
  }
  const inline = text.replace(/( ?)\[web:(\d+)\]/g, (match, space, n) => {
    const d = displayByMarker.get(Number(n));
    if (!d) return "";
    return `${space}[${d}]`;
  });
  if (entries.length === 0) return inline;
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    lines.push(formatEntryLine(i + 1, entries[i]));
  }
  return `${inline}\n\nSources:\n\n${lines.join("\n\n")}`;
}

// Scan-style sonar answers search the web but rarely emit [web:N] markers in
// prose. Their flattened search/fetch results are still the answer's
// evidence — append them (URL-deduplicated) so every grounded run surfaces
// its sources even without inline references.
export function perplexityScanSourcesAppendix(response: any): string | null {
  const flat = flattenPerplexitySources(response);
  if (flat.length === 0) return null;
  const seen = new Set<string>();
  const entries: Array<{ url: string; title: string | null }> = [];
  for (const s of flat) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    entries.push(s);
  }
  return formatSourcesAppendix(entries);
}

export function perplexityResultFromResponse(
  response: any,
  brandName: string,
  competitors: string[],
  companyName?: string | null,
): LLMResult {
  if (response?.status !== "completed") {
    throw new Error(`Perplexity run did not complete (status: ${response?.status ?? "unknown"})`);
  }
  if (response.error) {
    throw new Error(`Perplexity run failed: ${response.error.message ?? response.error.code ?? "unknown error"}`);
  }
  const text = perplexityCitationAppendix(perplexityOutputText(response), response);
  if (!text.trim()) {
    throw new Error("Perplexity returned an empty answer");
  }
  // Citations live in structured search/fetch output items, not in the always
  // empty text annotations (measured, docs/08). Override the text heuristic.
  const hasSearchResults = (response.output ?? []).some((item: any) =>
    item.type === "search_results" || item.type === "fetch_url_results"
  );
  const annotated = text.match(/\[\d+\]/) !== null;
  const scanAppendix = annotated ? null : perplexityScanSourcesAppendix(response);
  const finalText = scanAppendix ? `${text}\n\n${scanAppendix}` : text;
  return {
    modelId: "perplexity",
    ...extractInfo(finalText, brandName, competitors, companyName),
    citationPresent: hasSearchResults,
    rawResponse: finalText,
  };
}
