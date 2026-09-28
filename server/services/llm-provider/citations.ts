export type CitationEntry = {
  url: string;
  title: string | null;
};

// Link text must not contain brackets or the markdown link breaks.
function sanitizeLinkText(title: string): string {
  return title.replace(/[\[\]]/g, "");
}

// One numbered, clickable citation line: "[n] [Title](url)", or "[n] url"
// when no title is available — raw URLs get long and ugly, so the URL hides
// inside the href when a title exists.
export function formatEntryLine(n: number, entry: CitationEntry): string {
  if (entry.title) {
    return `[${n}] [${sanitizeLinkText(entry.title)}](${entry.url})`;
  }
  return `[${n}] ${entry.url}`;
}

// Numbered plain-text Sources block, shared by providers whose prose carries
// no inline markers (unlike sonar's [web:N]). Entries are deduplicated by URL
// keeping first-appearance order; items without a URL are dropped — nothing
// is fabricated.
export function formatSourcesAppendix(entries: CitationEntry[]): string | null {
  const seen = new Set<string>();
  const lines: string[] = [];
  let n = 0;
  for (const entry of entries) {
    if (!entry?.url || seen.has(entry.url)) continue;
    seen.add(entry.url);
    n += 1;
    lines.push(formatEntryLine(n, entry));
  }
  if (lines.length === 0) return null;
  // Blank lines between entries: markdown renderers collapse single newlines
  // inside a paragraph into spaces, which would glue the whole list into one
  // flowing blob. One paragraph per source keeps each entry on its own line.
  return `Sources:\n\n${lines.join("\n\n")}`;
}
