ALTER TABLE "provisioned_accounts" ADD COLUMN "trial_plan" varchar;--> statement-breakpoint
UPDATE "provisioned_accounts" SET "trial_plan" = 'starter';--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ALTER COLUMN "trial_plan" SET DEFAULT 'starter_v2';--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ALTER COLUMN "trial_plan" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_trial_plan_check" CHECK ("provisioned_accounts"."trial_plan" IN ('starter', 'starter_v2', 'growth_v2', 'accelerate'));
