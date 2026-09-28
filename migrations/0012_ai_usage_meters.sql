ALTER TABLE "ai_cost_estimation" ADD COLUMN "estimated_usage" jsonb;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "entry_meters" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "meters" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_meters_gin" ON "ai_usage_logs" USING gin ("meters");--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_entry_meters_array_check" CHECK (jsonb_typeof("ai_jobs"."entry_meters") = 'array');--> statement-breakpoint
ALTER TABLE "ai_cost_estimation" ADD CONSTRAINT "ai_cost_estimations_usage_array_check" CHECK ("ai_cost_estimation"."estimated_usage" IS NULL OR jsonb_typeof("ai_cost_estimation"."estimated_usage") = 'array');--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_meters_array_check" CHECK (jsonb_typeof("ai_usage_logs"."meters") = 'array');