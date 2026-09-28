ALTER TABLE "ai_usage_logs" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "cache_write_1h_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "system_config"
SET "value" = jsonb_set(
	jsonb_set(
		jsonb_set(
			jsonb_set(
				jsonb_set(
					jsonb_set("value", '{openai,gpt-4o-mini,cacheReadPerMTok}', COALESCE("value" #> '{openai,gpt-4o-mini,cacheReadPerMTok}', '0.075'::jsonb), true),
					'{anthropic,claude-haiku-4-5,cacheReadPerMTok}', COALESCE("value" #> '{anthropic,claude-haiku-4-5,cacheReadPerMTok}', '0.1'::jsonb), true
				),
				'{anthropic,claude-haiku-4-5,cacheWritePerMTok}', COALESCE("value" #> '{anthropic,claude-haiku-4-5,cacheWritePerMTok}', '1.25'::jsonb), true
			),
			'{anthropic,claude-haiku-4-5,cacheWrite1hPerMTok}', COALESCE("value" #> '{anthropic,claude-haiku-4-5,cacheWrite1hPerMTok}', '2.0'::jsonb), true
		),
		'{gemini,gemini-2.5-flash,cacheReadPerMTok}', COALESCE("value" #> '{gemini,gemini-2.5-flash,cacheReadPerMTok}', '0.03'::jsonb), true
	),
	'{gemini,gemini-3.1-pro-preview,cacheReadPerMTok}', COALESCE("value" #> '{gemini,gemini-3.1-pro-preview,cacheReadPerMTok}', '0.1'::jsonb), true
)
WHERE "key" = 'ai_model_pricing';
