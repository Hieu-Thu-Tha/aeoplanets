/**
 * Hand-written billing input types. Everything else in this folder is inferred
 * from the zod schemas in ./schema-validation, so this file stays dependency-
 * free on purpose — schema-validation imports TokenUsage from here (type-only).
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
}
