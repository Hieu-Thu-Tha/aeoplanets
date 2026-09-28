CREATE TABLE "action_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"user_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "action_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source" varchar NOT NULL,
	"source_ref" text,
	"stage" varchar DEFAULT 'approval' NOT NULL,
	"priority" varchar DEFAULT 'medium' NOT NULL,
	"assigned_to_user_id" varchar,
	"informed_user_ids" text[] DEFAULT ARRAY[]::text[],
	"rejected_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"cache_type" varchar NOT NULL,
	"cache_key" varchar NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"refreshed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"domain" varchar NOT NULL,
	"company_name" varchar,
	"competitors" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"category" varchar,
	"problem_statement" text,
	"target_audience" text,
	"brand_positioning" text,
	"key_topics" text,
	"territory" varchar,
	"location" text,
	"products" text,
	"differentiators" text,
	"brand_tone" varchar,
	"scan_status" varchar DEFAULT 'idle' NOT NULL,
	"discovered_competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pagespeed_data" jsonb,
	"pagespeed_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "change_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"type" varchar NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coverage_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"topic_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitor_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"company" varchar NOT NULL,
	"position" varchar,
	"rating" integer NOT NULL,
	"testimonial" text NOT NULL,
	"avatar_url" varchar,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"invoice_number" varchar NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar DEFAULT 'GBP' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"description" text,
	"due_date" timestamp,
	"invoice_date" timestamp DEFAULT now(),
	"paid_at" timestamp,
	"stripe_invoice_id" varchar,
	"stripe_hosted_invoice_url" text,
	"stripe_invoice_pdf_url" text,
	"receipt_emailed_at" timestamp,
	"payment_failed_emailed_at" timestamp,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" varchar NOT NULL,
	"content" text NOT NULL,
	"meta_description" varchar(160) NOT NULL,
	"keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"questions_answered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_takeaways" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"author_id" varchar NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "news_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "perception_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"summary" text,
	"strengths" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"weaknesses" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"inferred_audience" text,
	"market_tier" varchar,
	"confusion_markers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"positioning_score" integer,
	"authority_score" integer,
	"proof_score" integer,
	"differentiation_score" integer,
	"top_improvements" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provisioned_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"website_url" varchar NOT NULL,
	"brand_id" integer,
	"invite_token" varchar NOT NULL,
	"scan_status" varchar DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"brand_name" varchar,
	"registered_user_id" varchar,
	"provisioned_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "provisioned_accounts_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "readability_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"report_type" varchar NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"addon_type" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"billing_interval" varchar DEFAULT 'monthly' NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"annual_amount" integer DEFAULT 0 NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"stripe_subscription_item_id" varchar,
	"stripe_price_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"plan" varchar NOT NULL,
	"billing_interval" varchar DEFAULT 'annual' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"monthly_amount" integer DEFAULT 0 NOT NULL,
	"annual_amount" integer DEFAULT 0 NOT NULL,
	"currency" varchar DEFAULT 'GBP' NOT NULL,
	"billing_period_start" timestamp NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"trial_started_at" timestamp,
	"stripe_subscription_id" varchar,
	"stripe_price_id" varchar,
	"stripe_subscription_item_id" varchar,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"manual_billing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"cancelled_at" timestamp,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_owner_id" varchar NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"invite_token" text NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "team_invitations_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_owner_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tracked_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer,
	"user_id" varchar NOT NULL,
	"term" text NOT NULL,
	"category" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trial_account_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"website_url" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" varchar,
	"reviewed_at" timestamp,
	"provisioned_account_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracked_term_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"question" text NOT NULL,
	"question_type" varchar DEFAULT 'consideration' NOT NULL,
	"question_category" varchar DEFAULT 'user_question' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"search_volume" varchar,
	"search_volume_min" integer,
	"search_volume_max" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password_hash" text,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"linkedin_id" varchar,
	"auth_provider" varchar DEFAULT 'email' NOT NULL,
	"role" varchar DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"reset_token" varchar,
	"reset_token_expires" timestamp,
	"verification_token" varchar,
	"verification_token_expires" timestamp,
	"account_type" varchar DEFAULT 'standard' NOT NULL,
	"onboarding_step" varchar,
	"onboarding_data" jsonb,
	"last_login" timestamp,
	"stripe_customer_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_linkedin_id_unique" UNIQUE("linkedin_id")
);
--> statement-breakpoint
CREATE TABLE "visibility_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_type" varchar NOT NULL,
	"model_id" varchar NOT NULL,
	"appeared" boolean DEFAULT false NOT NULL,
	"position" integer,
	"sentiment" varchar,
	"competitors_mentioned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citation_present" boolean DEFAULT false NOT NULL,
	"raw_response" text,
	"tracked_term_id" integer,
	"user_question_id" integer,
	"run_date" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "action_comments" ADD CONSTRAINT "action_comments_ticket_id_action_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."action_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_comments" ADD CONSTRAINT "action_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_tickets" ADD CONSTRAINT "action_tickets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_tickets" ADD CONSTRAINT "action_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_tickets" ADD CONSTRAINT "action_tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cache" ADD CONSTRAINT "ai_cache_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_alerts" ADD CONSTRAINT "change_alerts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_gaps" ADD CONSTRAINT "coverage_gaps_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_profiles" ADD CONSTRAINT "perception_profiles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_registered_user_id_users_id_fk" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_provisioned_by_users_id_fk" FOREIGN KEY ("provisioned_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readability_audits" ADD CONSTRAINT "readability_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_account_owner_id_users_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_account_owner_id_users_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_terms" ADD CONSTRAINT "tracked_terms_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_terms" ADD CONSTRAINT "tracked_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_account_requests" ADD CONSTRAINT "trial_account_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_account_requests" ADD CONSTRAINT "trial_account_requests_provisioned_account_id_provisioned_accounts_id_fk" FOREIGN KEY ("provisioned_account_id") REFERENCES "public"."provisioned_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_questions" ADD CONSTRAINT "user_questions_tracked_term_id_tracked_terms_id_fk" FOREIGN KEY ("tracked_term_id") REFERENCES "public"."tracked_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_questions" ADD CONSTRAINT "user_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_runs" ADD CONSTRAINT "visibility_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_action_comments_ticket_id" ON "action_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_action_tickets_brand_id" ON "action_tickets" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_action_tickets_stage" ON "action_tickets" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_ai_cache_brand_type_key" ON "ai_cache" USING btree ("brand_id","cache_type","cache_key");--> statement-breakpoint
CREATE INDEX "idx_brands_user_id" ON "brands" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_change_alerts_brand_id" ON "change_alerts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_change_alerts_is_read" ON "change_alerts" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_coverage_gaps_brand_id" ON "coverage_gaps" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "customer_reviews_approved_idx" ON "customer_reviews" USING btree ("is_approved");--> statement-breakpoint
CREATE INDEX "customer_reviews_featured_idx" ON "customer_reviews" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "idx_invoices_user_id" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_subscription_id" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "news_articles_slug_idx" ON "news_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_articles_published_at_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_perception_profiles_brand_id" ON "perception_profiles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_provisioned_accounts_token" ON "provisioned_accounts" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "idx_provisioned_accounts_email" ON "provisioned_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_readability_audits_brand_id" ON "readability_audits" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_reports_brand_id" ON "reports" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_subscription_addons_user_id" ON "subscription_addons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_addons_subscription_id" ON "subscription_addons" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_team_invitations_owner" ON "team_invitations" USING btree ("account_owner_id");--> statement-breakpoint
CREATE INDEX "idx_team_invitations_token" ON "team_invitations" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "idx_team_members_owner" ON "team_members" USING btree ("account_owner_id");--> statement-breakpoint
CREATE INDEX "idx_team_members_user" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tracked_terms_user_id" ON "tracked_terms" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tracked_terms_brand_id" ON "tracked_terms" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_trial_account_requests_email" ON "trial_account_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_trial_account_requests_status" ON "trial_account_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_user_questions_tracked_term_id" ON "user_questions" USING btree ("tracked_term_id");--> statement-breakpoint
CREATE INDEX "idx_user_questions_user_id" ON "user_questions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_visibility_runs_brand_id" ON "visibility_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_visibility_runs_run_date" ON "visibility_runs" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "idx_visibility_runs_prompt_type" ON "visibility_runs" USING btree ("prompt_type");