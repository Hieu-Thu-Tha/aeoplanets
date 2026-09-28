CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"delivery_method" varchar NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" IN ('quota_reached_schedule_stopped')),
	CONSTRAINT "notifications_delivery_method_check" CHECK ("notifications"."delivery_method" IN ('email', 'push_noti'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_user_type_method_attempted" ON "notifications" USING btree ("user_id","type","delivery_method","attempted_at" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "type", "delivery_method", "attempted_at", "created_at")
SELECT
	legacy."account_owner_id",
	'quota_reached_schedule_stopped',
	'email',
	legacy."last_attempted_at",
	legacy."created_at"
FROM "ai_scheduled_quota_notifications" AS legacy
CROSS JOIN LATERAL generate_series(1, legacy."attempt_count");--> statement-breakpoint
DROP TABLE "ai_scheduled_quota_notifications";
