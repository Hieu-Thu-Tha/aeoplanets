UPDATE "system_config"
SET "value" = jsonb_set(
  "value" #- '{openai,gpt-4o-mini-search-preview}',
  '{openai,gpt-5-search-api}',
  COALESCE(
    "value" #> '{openai,gpt-5-search-api}',
    '{"inputPerMTok":1.25,"outputPerMTok":10.0,"cacheReadPerMTok":0.125}'::jsonb
  ),
  true
),
"updated_at" = now()
WHERE "key" = 'ai_model_pricing';
