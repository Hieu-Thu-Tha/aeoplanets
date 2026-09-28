CREATE TABLE "ai_scheduled_quota_notifications" (
	"account_owner_id" varchar NOT NULL,
	"resets_at" timestamp NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_attempted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_scheduled_quota_notifications_account_owner_id_resets_at_pk" PRIMARY KEY("account_owner_id","resets_at"),
	CONSTRAINT "ai_scheduled_quota_notifications_attempt_count_check" CHECK ("ai_scheduled_quota_notifications"."attempt_count" BETWEEN 1 AND 2)
);
--> statement-breakpoint
ALTER TABLE "ai_scheduled_quota_notifications" ADD CONSTRAINT "ai_scheduled_quota_notifications_account_owner_id_users_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
