ALTER TABLE "provisioned_accounts" ADD COLUMN "trial_duration_days" integer;--> statement-breakpoint
UPDATE "provisioned_accounts" SET "trial_duration_days" = 30;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ALTER COLUMN "trial_duration_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_updated_by" varchar;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trial_updated_by_users_id_fk" FOREIGN KEY ("trial_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_trial_duration_days_check" CHECK ("provisioned_accounts"."trial_duration_days" >= 1);--> statement-breakpoint
UPDATE "subscriptions"
SET
	"trial_ends_at" = "trial_started_at" + INTERVAL '30 days',
	"trial_updated_at" = now(),
	"billing_period_end" = "trial_started_at" + INTERVAL '30 days'
WHERE "trial_started_at" IS NOT NULL
	AND "stripe_subscription_id" IS NULL
	AND "manual_billing" = false;--> statement-breakpoint
UPDATE "subscriptions" AS "s"
SET "trial_updated_by" = "pa"."provisioned_by"
FROM "provisioned_accounts" AS "pa"
WHERE "pa"."registered_user_id" = "s"."user_id"
	AND "s"."trial_ends_at" IS NOT NULL;
