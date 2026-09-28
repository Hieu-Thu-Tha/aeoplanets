/**
 * Raw page data returned by WebCrawler
 */
export interface CrawledPage {
  url: string;
  title: string | null;
  description: string | null;
  headings: string[];
  bodyText: string | null;
  links: string[];
  images: Array<{ url: string; alt: string | null }>;
  metadata: Record<string, any>;
  existingJsonLd: any[]; // Existing Schema.org JSON-LD found on page
  content: ExtractedContent; // Rich extracted content (article, faq, product, review, table)
  depth: number;
  statusCode: number;
  contentHash: string;
}

/**
 * Rich content metadata extracted by WebCrawler
 * Used to populate Schema.org feeds and llms.txt descriptions
 */
export interface ExtractedContent {
  article?: {
    summary?: string; // First 1,000 words (optional - may be empty for short articles)
    sections?: Array<{ heading: string; content: string }>; // H2 sections
    tableOfContents?: string[]; // H2 headings for navigation
  };
  
  faq?: Array<{
    question: string;
    answer: string; // Up to 1,000 chars
  }>; // Max 50 pairs
  
  product?: {
    description?: string; // Full 1,000-word description from content areas
    features?: string[]; // Up to 20 features
    price?: { amount: string; currencyCode: string };
    availability?: string;
    rating?: { value: string; count?: string };
    reviews?: Array<{
      text: string;
      rating: string | null;
      author: string | null;
      date: string | null;
    }>;
  };
  
  review?: Array<{
    text: string; // Full review text (up to 1,000 chars)
    rating: number | null;
    author: string | null;
    date: string | null;
  }>; // Max 10 reviews
  
  table?: Array<{
    caption?: string;
    context?: string; // Preceding heading/paragraph for context
    columns: Array<{
      id: string;
      label: string;
      scope?: string;
    }>;
    rows: Array<{
      cells: Record<string, string>; // columnId -> cell value
    }>;
    stats: {
      rowCount: number;
      columnCount: number;
      truncated: boolean; // True if exceeded 50 rows or 20 columns
    };
  }>; // Max 10 tables per page
}

/**
 * Enriched page data with extracted content
 * Used by feed generators (LlmsTxtGenerator, SchemaGenerator)
 */
export interface EnrichedPage {
  url: string;
  title: string | null;
  description: string | null; // Meta description
  bodyText: string | null;
  headings: string[];
  images: Array<{ url: string; alt: string | null }>;
  metadata: Record<string, any>;
  detectedSchemaTypes: string[];
  entities: Record<string, any>;
  depth: number;
  content: ExtractedContent; // NEW: Rich extracted content
}
