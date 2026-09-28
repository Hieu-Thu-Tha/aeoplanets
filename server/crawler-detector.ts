/**
 * Detect if the request is from a crawler/bot that needs SSR
 * Uses explicit allowlist to avoid false positives
 */
export function isCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  
  const ua = userAgent.toLowerCase();
  
  // Explicit allowlist of known crawlers that need SSR
  const allowedCrawlers = [
    // Your LLM crawler (case-insensitive match)
    'aeostars-llm-crawler',
    
    // Major search engines (exact bot names)
    'googlebot',
    'bingbot',
    'slurp',          // Yahoo
    'duckduckbot',
    'baiduspider',
    'yandexbot',
    
    // Social media crawlers (exact names)
    'facebookexternalhit',
    'linkedinbot',
    'twitterbot',
    'whatsapp',
    
    // SEO/monitoring tools
    'lighthouse',
    'pagespeed',
    'gtmetrix',
  ];
  
  // Check if any allowed crawler is in the user-agent
  return allowedCrawlers.some(crawler => ua.includes(crawler));
}

/**
 * Check if crawler detection is needed for this path
 * Skip API routes and static assets
 */
export function shouldCheckForCrawler(path: string): boolean {
  // Skip API routes
  if (path.startsWith('/api')) return false;
  
  // Skip static assets
  const staticExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
    '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json', '.xml'
  ];
  
  return !staticExtensions.some(ext => path.endsWith(ext));
}
