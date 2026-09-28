import React, { Fragment, type ReactNode } from "react";

type MarkdownResponseProps = {
  content: string;
  testId?: string;
  className?: string;
};

/** Only allow safe link schemes — LLM output is untrusted. */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const pushText = (chunk: string) => {
    if (chunk) nodes.push(<Fragment key={`${keyPrefix}-t-${key++}`}>{chunk}</Fragment>);
  };

  // Use a fresh regex per call to avoid lastIndex leakage.
  const re = new RegExp(pattern.source, pattern.flags);
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    if (match.index > lastIndex) {
      pushText(text.slice(lastIndex, match.index));
    }
    lastIndex = match.index + token.length;
    const k = `${keyPrefix}-i-${key++}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={k}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      const inner = token.slice(2, -2);
      nodes.push(
        <strong key={k} className="font-semibold text-foreground">
          {renderInline(inner, `${k}`)}
        </strong>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      nodes.push(<s key={k}>{renderInline(token.slice(2, -2), `${k}`)}</s>);
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      const inner = token.slice(1, -1);
      if (!inner.trim()) {
        pushText(token);
      } else {
        nodes.push(<em key={k}>{renderInline(inner, `${k}`)}</em>);
      }
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safe = safeHref(href);
        if (safe) {
          nodes.push(
            <a
              key={k}
              href={safe}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {renderInline(label, `${k}`)}
            </a>
          );
        } else {
          nodes.push(<Fragment key={k}>{renderInline(label, `${k}`)}</Fragment>);
        }
      } else {
        pushText(token);
      }
    } else {
      pushText(token);
    }
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return nodes;
}

function splitTableRow(row: string): string[] {
  let trimmed = row.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

function parseAlignment(separatorLine: string): ("left" | "center" | "right" | null)[] {
  return splitTableRow(separatorLine).map((cell) => {
    if (/^:.*:$/.test(cell)) return "center";
    if (/^.*:$/.test(cell)) return "right";
    return null;
  });
}

function TableBlock({
  header,
  aligns,
  rows,
  keyPrefix,
}: {
  header: string[];
  aligns: ("left" | "center" | "right" | null)[];
  rows: string[][];
  keyPrefix: string;
}) {
  const alignClass = (a: "left" | "center" | "right" | null) =>
    a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-[13px] leading-relaxed">
        <thead>
          <tr className="bg-muted/60">
            {header.map((cell, i) => (
              <th
                key={`${keyPrefix}-h-${i}`}
                className={`border-b border-border px-2.5 py-2 font-semibold text-foreground ${alignClass(aligns[i] ?? null)}`}
              >
                {renderInline(cell, `${keyPrefix}-h-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={`${keyPrefix}-r-${r}`} className={r % 2 === 1 ? "bg-muted/30" : undefined}>
              {row.map((cell, c) => (
                <td
                  key={`${keyPrefix}-r-${r}-c-${c}`}
                  className={`border-b border-border/60 px-2.5 py-1.5 align-top text-muted-foreground last:border-b-0 ${alignClass(aligns[c] ?? null)}`}
                >
                  {cell ? renderInline(cell, `${keyPrefix}-r-${r}-c-${c}`) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Lightweight, dependency-free markdown renderer for LLM responses.
 * Handles headers, bold/italic/strikethrough, inline + fenced code,
 * links (http/https/mailto only), tables (GFM), unordered/ordered
 * lists, blockquotes, and horizontal rules.
 *
 * LLM output is untrusted — content is rendered via React text nodes
 * (never dangerouslySetInnerHTML), so embedded HTML displays as text.
 */
export function MarkdownResponse({ content, testId, className }: MarkdownResponseProps) {
  const blocks: ReactNode[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  const nextKey = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const fenceKey = nextKey();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push(
        <pre
          key={fenceKey}
          className="overflow-x-auto whitespace-pre rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // GFM table: header row followed by separator row
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const tableKey = nextKey();
      const header = splitTableRow(line);
      const aligns = parseAlignment(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <TableBlock key={tableKey} header={header} aligns={aligns} rows={rows} keyPrefix={tableKey} />
      );
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\s+#+\s*$/, "");
      const k = nextKey();
      const headingClasses =
        level === 1
          ? "text-base font-semibold text-foreground"
          : level === 2
            ? "text-[15px] font-semibold text-foreground"
            : "text-sm font-semibold text-foreground";
      const content_nodes = renderInline(text, k);
      if (level === 1) blocks.push(<h1 key={k} className={headingClasses}>{content_nodes}</h1>);
      else if (level === 2) blocks.push(<h2 key={k} className={headingClasses}>{content_nodes}</h2>);
      else if (level === 3) blocks.push(<h3 key={k} className={headingClasses}>{content_nodes}</h3>);
      else if (level === 4) blocks.push(<h4 key={k} className={headingClasses}>{content_nodes}</h4>);
      else if (level === 5) blocks.push(<h5 key={k} className={headingClasses}>{content_nodes}</h5>);
      else blocks.push(<h6 key={k} className={headingClasses}>{content_nodes}</h6>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push(<hr key={nextKey()} className="border-border" />);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteKey = nextKey();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={quoteKey}
          className="border-l-2 border-border pl-3 text-sm italic leading-relaxed text-muted-foreground"
        >
          {renderInline(quoteLines.join(" "), quoteKey)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const listKey = nextKey();
      const items: string[] = [];
      while (i < lines.length && (/^[-*+]\s+/.test(lines[i].trim()) || lines[i].trim() === "")) {
        if (lines[i].trim() === "") break;
        // Stop if the next non-list block starts (table separator handled above)
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={listKey} className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground">
          {items.map((item, idx) => (
            <li key={`${listKey}-${idx}`}>{renderInline(item, `${listKey}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const listKey = nextKey();
      const items: string[] = [];
      while (i < lines.length && (/^\d+[.)]\s+/.test(lines[i].trim()) || lines[i].trim() === "")) {
        if (lines[i].trim() === "") break;
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={listKey} className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground">
          {items.map((item, idx) => (
            <li key={`${listKey}-${idx}`}>{renderInline(item, `${listKey}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines
    const paraKey = nextKey();
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```") &&
      !/^>\s?/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !/^(---|\*\*\*|___)\s*$/.test(lines[i].trim()) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    // Single newlines inside a paragraph become soft breaks (space-joined,
    // with explicit two-space line breaks preserved as <br/>).
    const paraText = paraLines.join(" ").replace(/ {2,}/g, " ");
    blocks.push(
      <p key={paraKey} className="text-sm leading-relaxed text-muted-foreground">
        {renderInline(paraText, paraKey)}
      </p>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`min-w-0 space-y-3 [&_h1]:mt-1 [&_h1]:mb-1 [&_h2]:mt-1 [&_h2]:mb-1 [&_h3]:mt-1 [&_h3]:mb-1 [&_p]:mb-0 [&_ul]:my-1 [&_ol]:my-1 [&_table]:my-1 ${className ?? ""}`}
    >
      {blocks}
    </div>
  );
}
