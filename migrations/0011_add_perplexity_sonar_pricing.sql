UPDATE "system_config"
SET "value" = "value"
  || jsonb_build_object(
    'perplexity',
    COALESCE("value" #> '{perplexity}', '{}'::jsonb)
      || jsonb_build_object(
        'perplexity/sonar',
        COALESCE(
          "value" #> '{"perplexity","perplexity/sonar"}',
          '{"inputPerMTok":0.25,"outputPerMTok":2.5,"cacheReadPerMTok":0.0625,"cacheWritePerMTok":0.25}'::jsonb
        )
      )
  ),
"updated_at" = now()
WHERE "key" = 'ai_model_pricing';

UPDATE "system_config"
SET "cache_max_duration_secs" = 900
WHERE "key" = 'ai_model_pricing'
  AND "cache_max_duration_secs" IS NULL;
