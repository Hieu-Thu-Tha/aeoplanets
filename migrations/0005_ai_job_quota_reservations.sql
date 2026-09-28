CREATE TABLE "ai_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_owner_id" varchar NOT NULL,
	"brand_id" integer,
	"feature" varchar NOT NULL,
	"status" varchar DEFAULT 'reserved' NOT NULL,
	"reserved_cost_micro_usd" bigint NOT NULL,
	"expires_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_jobs_status_check" CHECK ("ai_jobs"."status" IN ('reserved', 'completed', 'failed', 'expired')),
	CONSTRAINT "ai_jobs_reserved_cost_check" CHECK ("ai_jobs"."reserved_cost_micro_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_account_owner_id_users_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_owner_status_expiry" ON "ai_jobs" USING btree ("account_owner_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_status_expiry" ON "ai_jobs" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_jobs_owner_created" ON "ai_jobs" USING btree ("account_owner_id","created_at");