/**
 * Simple markdown to HTML converter
 * Handles basic markdown syntax for SSR rendering
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Headers (h1-h6)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Lists (unordered)
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  // Wrap consecutive list items in ul tags
  const lines = html.split('\n');
  let inList = false;
  const processed: string[] = [];
  
  for (const line of lines) {
    if (line.trim().startsWith('<li>')) {
      if (!inList) {
        processed.push('<ul>');
        inList = true;
      }
      processed.push(line);
    } else {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      processed.push(line);
    }
  }
  
  if (inList) {
    processed.push('</ul>');
  }
  
  html = processed.join('\n');
  
  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<h/g, '<h');
  html = html.replace(/<\/h[1-6]>\s*<\/p>/g, (match) => match.replace('</p>', ''));
  
  return html;
}
