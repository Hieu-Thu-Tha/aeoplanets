/**
 * Escape HTML special characters to prevent XSS
 * Used when interpolating user content into HTML/meta tags
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Escape text for use in JSON-LD or inline JSON
 * Prevents breaking out of JSON strings
 */
export function escapeJson(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
