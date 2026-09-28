CREATE TABLE "ai_cost_estimation" (
	"feature" varchar NOT NULL,
	"models_hash" varchar(64) NOT NULL,
	"model_profile" jsonb NOT NULL,
	"estimated_tokens" jsonb NOT NULL,
	"sample_count" integer NOT NULL,
	"source_max_finished_at" timestamp,
	"algorithm_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cost_estimation_feature_models_hash_pk" PRIMARY KEY("feature","models_hash"),
	CONSTRAINT "ai_cost_estimations_sample_count_check" CHECK ("ai_cost_estimation"."sample_count" >= 0),
	CONSTRAINT "ai_cost_estimations_algorithm_version_check" CHECK ("ai_cost_estimation"."algorithm_version" > 0),
	CONSTRAINT "ai_cost_estimations_version_check" CHECK ("ai_cost_estimation"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "entry_provider" varchar;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "entry_model" varchar;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "models_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "model_profile" jsonb;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "job_id" varchar;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "call_index" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_feature_profile_finished" ON "ai_jobs" USING btree ("feature","models_hash","finished_at");--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_feature_status_finished" ON "ai_jobs" USING btree ("feature","status","finished_at");--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_feature_entry_finished" ON "ai_jobs" USING btree ("feature","entry_provider","entry_model","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ai_usage_job_call" ON "ai_usage_logs" USING btree ("job_id","call_index");--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_profile_pair_check" CHECK (("ai_jobs"."models_hash" IS NULL) = ("ai_jobs"."model_profile" IS NULL));--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_entry_pair_check" CHECK (("ai_jobs"."entry_provider" IS NULL) = ("ai_jobs"."entry_model" IS NULL));--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_job_call_pair_check" CHECK (("ai_usage_logs"."job_id" IS NULL) = ("ai_usage_logs"."call_index" IS NULL));--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_call_index_check" CHECK ("ai_usage_logs"."call_index" IS NULL OR "ai_usage_logs"."call_index" >= 0);
--> statement-breakpoint
UPDATE "system_config"
SET "value" = jsonb_build_object(
	'visibility_scan', 1.5,
	'perception', 1.5,
	'coverage', 1.5,
	'readability_audit', 1.5,
	'report', 1.5,
	'news', 1.5,
	'ticket_generation', 1.5,
	'suggest_fix', 1.5,
	'data_freshness', 1.5,
	'brand_research', 1.5,
	'competitor_research', 1.5,
	'question_generation', 1.5,
	'volume_estimation', 1.5,
	'provisioning_research', 1.5,
	'other', 1.5
), "updated_at" = now()
WHERE "key" = 'ai_job_reservation_usd'
  AND "value" = jsonb_build_object(
	'visibility_scan', 1,
	'perception', 1,
	'coverage', 1,
	'readability_audit', 1,
	'report', 1,
	'news', 1,
	'ticket_generation', 1,
	'suggest_fix', 1,
	'data_freshness', 1,
	'brand_research', 1,
	'competitor_research', 1,
	'question_generation', 1,
	'volume_estimation', 1,
	'provisioning_research', 1,
	'other', 1
  );
