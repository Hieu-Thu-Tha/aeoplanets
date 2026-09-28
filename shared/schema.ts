import { sql } from "drizzle-orm";
import type {
  BillableUsage,
  ExpectedMeter,
  PricedMeterUsage,
} from "./ai-billing";
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
  real,
  bigint,
  check,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { PERSISTED_TRIAL_PLAN_KEYS, type PersistedTrialPlan } from "./trial";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table with custom authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: text("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  linkedinId: varchar("linkedin_id").unique(),
  authProvider: varchar("auth_provider").notNull().default("email"),
  role: varchar("role").notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  resetToken: varchar("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  verificationToken: varchar("verification_token"),
  verificationTokenExpires: timestamp("verification_token_expires"),
  accountType: varchar("account_type").notNull().default("standard"),
  onboardingStep: varchar("onboarding_step"),
  onboardingData: jsonb("onboarding_data"),
  seenWelcomeVideo: boolean("seen_welcome_video").notNull().default(false),
  lastLogin: timestamp("last_login"),
  stripeCustomerId: varchar("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const upsertUserSchema = createInsertSchema(users);
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Brands/Organizations being monitored (redesigned)
export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: varchar("domain").notNull(),
  companyName: varchar("company_name"),
  competitors: text("competitors").array().notNull().default(sql`ARRAY[]::text[]`),
  category: varchar("category"),
  problemStatement: text("problem_statement"),
  targetAudience: text("target_audience"),
  brandPositioning: text("brand_positioning"),
  keyTopics: text("key_topics"),
  territory: varchar("territory"),
  location: text("location"),
  products: text("products"),
  differentiators: text("differentiators"),
  brandTone: varchar("brand_tone"),
  scanStatus: varchar("scan_status").notNull().default("idle"), // idle, running, completed
  discoveredCompetitors: jsonb("discovered_competitors").notNull().default(sql`'[]'::jsonb`),
  pagespeedData: jsonb("pagespeed_data"),
  pagespeedFetchedAt: timestamp("pagespeed_fetched_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_brands_user_id").on(table.userId),
]);

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;

// Visibility runs — one row per prompt × model execution
export const visibilityRuns = pgTable("visibility_runs", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  promptText: text("prompt_text").notNull(),
  promptType: varchar("prompt_type").notNull(), // brand_direct, category_comparison, commercial_intent, problem_based
  modelId: varchar("model_id").notNull(), // openai, anthropic, gemini
  appeared: boolean("appeared").notNull().default(false),
  position: integer("position"), // rank in response (null if not appeared)
  sentiment: varchar("sentiment"), // positive, neutral, negative
  competitorsMentioned: jsonb("competitors_mentioned").notNull().default(sql`'[]'::jsonb`),
  citationPresent: boolean("citation_present").notNull().default(false),
  rawResponse: text("raw_response"),
  trackedTermId: integer("tracked_term_id"),
  userQuestionId: integer("user_question_id"),
  runDate: timestamp("run_date").defaultNow(),
}, (table) => [
  index("idx_visibility_runs_brand_id").on(table.brandId),
  index("idx_visibility_runs_run_date").on(table.runDate),
  index("idx_visibility_runs_prompt_type").on(table.promptType),
]);

export const insertVisibilityRunSchema = createInsertSchema(visibilityRuns).omit({
  id: true,
  runDate: true,
});
export type InsertVisibilityRun = z.infer<typeof insertVisibilityRunSchema>;
export type VisibilityRun = typeof visibilityRuns.$inferSelect;

// Perception profiles — AI narrative analysis per brand
export const perceptionProfiles = pgTable("perception_profiles", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  summary: text("summary"),
  strengths: text("strengths").array().notNull().default(sql`ARRAY[]::text[]`),
  weaknesses: text("weaknesses").array().notNull().default(sql`ARRAY[]::text[]`),
  inferredAudience: text("inferred_audience"),
  marketTier: varchar("market_tier"),
  confusionMarkers: text("confusion_markers").array().notNull().default(sql`ARRAY[]::text[]`),
  positioningScore: integer("positioning_score"), // 0-100
  authorityScore: integer("authority_score"), // 0-100
  proofScore: integer("proof_score"), // 0-100
  differentiationScore: integer("differentiation_score"), // 0-100
  topImprovements: text("top_improvements").array().notNull().default(sql`ARRAY[]::text[]`),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_perception_profiles_brand_id").on(table.brandId),
]);

export const insertPerceptionProfileSchema = createInsertSchema(perceptionProfiles).omit({
  id: true,
  lastUpdated: true,
});
export type InsertPerceptionProfile = z.infer<typeof insertPerceptionProfileSchema>;
export type PerceptionProfile = typeof perceptionProfiles.$inferSelect;

// Coverage gaps — semantic coverage analysis
export const coverageGaps = pgTable("coverage_gaps", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  topicClusters: jsonb("topic_clusters").notNull().default(sql`'[]'::jsonb`),
  missingTopics: jsonb("missing_topics").notNull().default(sql`'[]'::jsonb`),
  competitorCoverage: jsonb("competitor_coverage").notNull().default(sql`'{}'::jsonb`),
  recommendations: jsonb("recommendations").notNull().default(sql`'[]'::jsonb`),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_coverage_gaps_brand_id").on(table.brandId),
]);

export const insertCoverageGapSchema = createInsertSchema(coverageGaps).omit({
  id: true,
  lastUpdated: true,
});
export type InsertCoverageGap = z.infer<typeof insertCoverageGapSchema>;
export type CoverageGap = typeof coverageGaps.$inferSelect;

// Readability audits — machine readability checks per brand
export const readabilityAudits = pgTable("readability_audits", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0), // 0-100
  checks: jsonb("checks").notNull().default(sql`'[]'::jsonb`), // Array of {name, status, suggestion}
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_readability_audits_brand_id").on(table.brandId),
]);

export const insertReadabilityAuditSchema = createInsertSchema(readabilityAudits).omit({
  id: true,
  lastUpdated: true,
});
export type InsertReadabilityAudit = z.infer<typeof insertReadabilityAuditSchema>;
export type ReadabilityAudit = typeof readabilityAudits.$inferSelect;

// Change alerts — monitors significant AI visibility changes
export const changeAlerts = pgTable("change_alerts", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // new_competitor, brand_disappeared, sentiment_change, model_shift
  message: text("message").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_change_alerts_brand_id").on(table.brandId),
  index("idx_change_alerts_is_read").on(table.isRead),
]);

export const insertChangeAlertSchema = createInsertSchema(changeAlerts).omit({
  id: true,
  createdAt: true,
});
export type InsertChangeAlert = z.infer<typeof insertChangeAlertSchema>;
export type ChangeAlert = typeof changeAlerts.$inferSelect;

// Reports — generated report exports
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  reportType: varchar("report_type").notNull(), // executive, marketing, competitive
  content: jsonb("content").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reports_brand_id").on(table.brandId),
]);

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Subscriptions — user billing plan records
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan").notNull(), // starter, growth, enterprise
  billingInterval: varchar("billing_interval").notNull().default("annual"), // monthly, annual
  status: varchar("status").notNull().default("active"), // active, cancelled, suspended
  monthlyAmount: integer("monthly_amount").notNull().default(0), // pence (for monthly billing)
  annualAmount: integer("annual_amount").notNull().default(0), // pence (for annual billing)
  currency: varchar("currency").notNull().default("GBP"),
  billingPeriodStart: timestamp("billing_period_start").notNull(),
  billingPeriodEnd: timestamp("billing_period_end").notNull(),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialUpdatedAt: timestamp("trial_updated_at"),
  trialUpdatedBy: varchar("trial_updated_by").references(() => users.id, { onDelete: "set null" }),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripePriceId: varchar("stripe_price_id"),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // When true, this account is billed outside the app (manual invoicing) and is
  // never charged via Stripe. Treated as complimentary: full plan access, no
  // trial expiry, and the in-app billing/upgrade UI is hidden.
  manualBilling: boolean("manual_billing").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => [
  index("idx_subscriptions_user_id").on(table.userId),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Subscription Add-ons — extra brand or competitor packs
export const subscriptionAddons = pgTable("subscription_addons", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addonType: varchar("addon_type").notNull(), // "extra_brand" or "competitor_pack"
  quantity: integer("quantity").notNull().default(1),
  billingInterval: varchar("billing_interval").notNull().default("monthly"), // monthly or annual
  monthlyAmount: integer("monthly_amount").notNull().default(0), // pence
  annualAmount: integer("annual_amount").notNull().default(0), // pence
  status: varchar("status").notNull().default("active"), // active, cancelled
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id"),
  stripePriceId: varchar("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => [
  index("idx_subscription_addons_user_id").on(table.userId),
  index("idx_subscription_addons_subscription_id").on(table.subscriptionId),
]);

export const insertSubscriptionAddonSchema = createInsertSchema(subscriptionAddons).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscriptionAddon = z.infer<typeof insertSubscriptionAddonSchema>;
export type SubscriptionAddon = typeof subscriptionAddons.$inferSelect;

// Invoices — billing history per subscription
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  amount: integer("amount").notNull(), // pence
  currency: varchar("currency").notNull().default("GBP"),
  status: varchar("status").notNull().default("pending"), // paid, pending, overdue
  description: text("description"),
  dueDate: timestamp("due_date"),
  invoiceDate: timestamp("invoice_date").defaultNow(),
  paidAt: timestamp("paid_at"),
  stripeInvoiceId: varchar("stripe_invoice_id").unique(),
  stripeHostedInvoiceUrl: text("stripe_hosted_invoice_url"),
  stripeInvoicePdfUrl: text("stripe_invoice_pdf_url"),
  receiptEmailedAt: timestamp("receipt_emailed_at"),
  paymentFailedEmailedAt: timestamp("payment_failed_emailed_at"),
}, (table) => [
  index("idx_invoices_user_id").on(table.userId),
  index("idx_invoices_subscription_id").on(table.subscriptionId),
]);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  invoiceDate: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Tracked Terms — user-defined key search queries to monitor
export const trackedTerms = pgTable("tracked_terms", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  term: text("term").notNull(),
  category: varchar("category"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tracked_terms_user_id").on(table.userId),
  index("idx_tracked_terms_brand_id").on(table.brandId),
]);

export const insertTrackedTermSchema = createInsertSchema(trackedTerms).omit({
  id: true,
  createdAt: true,
});
export type InsertTrackedTerm = z.infer<typeof insertTrackedTermSchema>;
export type TrackedTerm = typeof trackedTerms.$inferSelect;

// User Questions — AI-generated questions aligned to tracked terms, sent to LLMs daily
export const userQuestions = pgTable("user_questions", {
  id: serial("id").primaryKey(),
  trackedTermId: integer("tracked_term_id").notNull().references(() => trackedTerms.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  questionType: varchar("question_type").notNull().default("consideration"),
  questionCategory: varchar("question_category").notNull().default("user_question"),
  isActive: boolean("is_active").notNull().default(true),
  searchVolume: varchar("search_volume"),
  searchVolumeMin: integer("search_volume_min"),
  searchVolumeMax: integer("search_volume_max"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_questions_tracked_term_id").on(table.trackedTermId),
  index("idx_user_questions_user_id").on(table.userId),
]);

export const insertUserQuestionSchema = createInsertSchema(userQuestions).omit({
  id: true,
  createdAt: true,
});
export type InsertUserQuestion = z.infer<typeof insertUserQuestionSchema>;
export type UserQuestion = typeof userQuestions.$inferSelect;

// News Articles for SEO-optimized content marketing
export const newsArticles = pgTable("news_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug").notNull().unique(),
  content: text("content").notNull(),
  metaDescription: varchar("meta_description", { length: 160 }).notNull(),
  keywords: text("keywords").array().notNull().default(sql`ARRAY[]::text[]`),
  questionsAnswered: jsonb("questions_answered").notNull().default(sql`'[]'::jsonb`),
  keyTakeaways: text("key_takeaways").array().notNull().default(sql`ARRAY[]::text[]`),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("news_articles_slug_idx").on(table.slug),
  index("news_articles_published_at_idx").on(table.publishedAt),
]);

export const insertNewsArticleSchema = createInsertSchema(newsArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type NewsArticle = typeof newsArticles.$inferSelect;

// Customer Reviews for social proof
export const customerReviews = pgTable("customer_reviews", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  company: varchar("company").notNull(),
  position: varchar("position"),
  rating: integer("rating").notNull(),
  testimonial: text("testimonial").notNull(),
  avatarUrl: varchar("avatar_url"),
  isApproved: boolean("is_approved").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("customer_reviews_approved_idx").on(table.isApproved),
  index("customer_reviews_featured_idx").on(table.isFeatured),
]);

export const insertCustomerReviewSchema = createInsertSchema(customerReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  rating: z.number().min(1).max(5),
});
export type InsertCustomerReview = z.infer<typeof insertCustomerReviewSchema>;
export type CustomerReview = typeof customerReviews.$inferSelect;

// Action Tickets — Kanban board items generated from AI insights or created manually
export const actionTickets = pgTable("action_tickets", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  source: varchar("source").notNull(), // readability, perception, coverage, web_vitals, competitor_weakness, manual
  sourceRef: text("source_ref"),
  stage: varchar("stage").notNull().default("approval"), // approval, in_progress, testing, finished, completed, archived
  priority: varchar("priority").notNull().default("medium"), // low, medium, high, critical
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  informedUserIds: text("informed_user_ids").array().default(sql`ARRAY[]::text[]`),
  rejectedAt: timestamp("rejected_at"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_action_tickets_brand_id").on(table.brandId),
  index("idx_action_tickets_stage").on(table.stage),
]);

export const insertActionTicketSchema = createInsertSchema(actionTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionTicket = z.infer<typeof insertActionTicketSchema>;
export type ActionTicket = typeof actionTickets.$inferSelect;

// Action Comments — notes and comments on tickets
export const actionComments = pgTable("action_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => actionTickets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_action_comments_ticket_id").on(table.ticketId),
]);

export const insertActionCommentSchema = createInsertSchema(actionComments).omit({
  id: true,
  createdAt: true,
});
export type InsertActionComment = z.infer<typeof insertActionCommentSchema>;
export type ActionComment = typeof actionComments.$inferSelect;

// Team Invitations — pending invites to join an account
export const teamInvitations = pgTable("team_invitations", {
  id: serial("id").primaryKey(),
  accountOwnerId: varchar("account_owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  status: varchar("status").notNull().default("pending"), // pending, accepted, expired, revoked
  permissions: jsonb("permissions").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("idx_team_invitations_owner").on(table.accountOwnerId),
  index("idx_team_invitations_token").on(table.inviteToken),
]);

export const insertTeamInvitationSchema = createInsertSchema(teamInvitations).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type TeamInvitation = typeof teamInvitations.$inferSelect;

// Team Members — users linked to an account owner
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  accountOwnerId: varchar("account_owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissions: jsonb("permissions").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_team_members_owner").on(table.accountOwnerId),
  index("idx_team_members_user").on(table.userId),
]);

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

export type TeamPermissions = {
  addBrands: boolean;
  billing: boolean;
  addCompetitors: boolean;
  manageUsers: boolean;
  createTickets: boolean;
  deleteTickets: boolean;
  editTickets: boolean;
};

// Relations
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  invoices: many(invoices),
  addons: many(subscriptionAddons),
}));

export const subscriptionAddonsRelations = relations(subscriptionAddons, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionAddons.subscriptionId], references: [subscriptions.id] }),
  user: one(users, { fields: [subscriptionAddons.userId], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  subscription: one(subscriptions, { fields: [invoices.subscriptionId], references: [subscriptions.id] }),
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
}));

export const trackedTermsRelations = relations(trackedTerms, ({ one, many }) => ({
  brand: one(brands, { fields: [trackedTerms.brandId], references: [brands.id] }),
  user: one(users, { fields: [trackedTerms.userId], references: [users.id] }),
  userQuestions: many(userQuestions),
}));

export const userQuestionsRelations = relations(userQuestions, ({ one }) => ({
  trackedTerm: one(trackedTerms, { fields: [userQuestions.trackedTermId], references: [trackedTerms.id] }),
  user: one(users, { fields: [userQuestions.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  brands: many(brands),
  newsArticles: many(newsArticles),
  subscriptions: many(subscriptions),
  trackedTerms: many(trackedTerms),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  user: one(users, {
    fields: [brands.userId],
    references: [users.id],
  }),
  visibilityRuns: many(visibilityRuns),
  perceptionProfiles: many(perceptionProfiles),
  coverageGaps: many(coverageGaps),
  readabilityAudits: many(readabilityAudits),
  changeAlerts: many(changeAlerts),
  reports: many(reports),
}));

export const visibilityRunsRelations = relations(visibilityRuns, ({ one }) => ({
  brand: one(brands, {
    fields: [visibilityRuns.brandId],
    references: [brands.id],
  }),
  trackedTerm: one(trackedTerms, {
    fields: [visibilityRuns.trackedTermId],
    references: [trackedTerms.id],
  }),
  userQuestion: one(userQuestions, {
    fields: [visibilityRuns.userQuestionId],
    references: [userQuestions.id],
  }),
}));

export const perceptionProfilesRelations = relations(perceptionProfiles, ({ one }) => ({
  brand: one(brands, {
    fields: [perceptionProfiles.brandId],
    references: [brands.id],
  }),
}));

export const coverageGapsRelations = relations(coverageGaps, ({ one }) => ({
  brand: one(brands, {
    fields: [coverageGaps.brandId],
    references: [brands.id],
  }),
}));

export const readabilityAuditsRelations = relations(readabilityAudits, ({ one }) => ({
  brand: one(brands, {
    fields: [readabilityAudits.brandId],
    references: [brands.id],
  }),
}));

export const changeAlertsRelations = relations(changeAlerts, ({ one }) => ({
  brand: one(brands, {
    fields: [changeAlerts.brandId],
    references: [brands.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  brand: one(brands, {
    fields: [reports.brandId],
    references: [brands.id],
  }),
}));

export const newsArticlesRelations = relations(newsArticles, ({ one }) => ({
  author: one(users, {
    fields: [newsArticles.authorId],
    references: [users.id],
  }),
}));

export const actionTicketsRelations = relations(actionTickets, ({ one, many }) => ({
  brand: one(brands, { fields: [actionTickets.brandId], references: [brands.id] }),
  user: one(users, { fields: [actionTickets.userId], references: [users.id] }),
  comments: many(actionComments),
}));

export const actionCommentsRelations = relations(actionComments, ({ one }) => ({
  ticket: one(actionTickets, { fields: [actionComments.ticketId], references: [actionTickets.id] }),
  user: one(users, { fields: [actionComments.userId], references: [users.id] }),
}));

export const teamInvitationsRelations = relations(teamInvitations, ({ one }) => ({
  accountOwner: one(users, { fields: [teamInvitations.accountOwnerId], references: [users.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  accountOwner: one(users, { fields: [teamMembers.accountOwnerId], references: [users.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const provisionedAccounts = pgTable("provisioned_accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  websiteUrl: varchar("website_url").notNull(),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  inviteToken: varchar("invite_token").notNull().unique(),
  scanStatus: varchar("scan_status").notNull().default("pending"),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at"),
  brandName: varchar("brand_name"),
  trialDurationDays: integer("trial_duration_days").notNull(),
  trialPlan: varchar("trial_plan").$type<PersistedTrialPlan>().notNull().default("starter_v2"),
  registeredUserId: varchar("registered_user_id").references(() => users.id, { onDelete: "set null" }),
  provisionedBy: varchar("provisioned_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_provisioned_accounts_token").on(table.inviteToken),
  index("idx_provisioned_accounts_email").on(table.email),
  check("provisioned_accounts_trial_duration_days_check", sql`${table.trialDurationDays} >= 1`),
  check("provisioned_accounts_trial_plan_check", sql`${table.trialPlan} IN ('starter', 'starter_v2', 'growth_v2', 'accelerate')`),
]);

export const insertProvisionedAccountSchema = createInsertSchema(provisionedAccounts).omit({
  id: true,
  createdAt: true,
}).extend({
  trialPlan: z.enum(PERSISTED_TRIAL_PLAN_KEYS).default("starter_v2"),
});
export type InsertProvisionedAccount = z.infer<typeof insertProvisionedAccountSchema>;
export type ProvisionedAccount = typeof provisionedAccounts.$inferSelect;

export const provisionedAccountsRelations = relations(provisionedAccounts, ({ one }) => ({
  brand: one(brands, { fields: [provisionedAccounts.brandId], references: [brands.id] }),
  registeredUser: one(users, { fields: [provisionedAccounts.registeredUserId], references: [users.id] }),
}));

export const trialAccountRequests = pgTable("trial_account_requests", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  websiteUrl: varchar("website_url").notNull(),
  status: varchar("status").notNull().default("pending"),
  reviewedByUserId: varchar("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  provisionedAccountId: integer("provisioned_account_id").references(() => provisionedAccounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_trial_account_requests_email").on(table.email),
  index("idx_trial_account_requests_status").on(table.status),
]);

export const insertTrialAccountRequestSchema = createInsertSchema(trialAccountRequests).omit({
  id: true,
  createdAt: true,
  reviewedByUserId: true,
  reviewedAt: true,
  provisionedAccountId: true,
  status: true,
});
export type InsertTrialAccountRequest = z.infer<typeof insertTrialAccountRequestSchema>;
export type TrialAccountRequest = typeof trialAccountRequests.$inferSelect;

export const aiCache = pgTable("ai_cache", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  cacheType: varchar("cache_type").notNull(),
  cacheKey: varchar("cache_key").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  refreshedAt: timestamp("refreshed_at").defaultNow(),
}, (table) => [
  index("idx_ai_cache_brand_type_key").on(table.brandId, table.cacheType, table.cacheKey),
]);

export const insertAiCacheSchema = createInsertSchema(aiCache).omit({
  id: true,
  createdAt: true,
  refreshedAt: true,
});
export type InsertAiCache = z.infer<typeof insertAiCacheSchema>;
export type AiCache = typeof aiCache.$inferSelect;

export type AiJobModelCall = {
  provider: string;
  model: string;
  meters: ExpectedMeter[];
};

// Retained during the additive estimator rollout for older application tasks.
export type AiEstimatedCallTokens = Pick<AiJobModelCall, "provider" | "model"> & {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
};

export type AiEstimatedCallUsage = {
  provider: string;
  model: string;
  usage: BillableUsage;
};

// Durable admission record for one customer-attributable AI job. While reserved,
// reservedCostMicroUsd counts against both cap windows until the job finishes
// or the reservation expires.
export const aiJobs = pgTable("ai_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountOwnerId: varchar("account_owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  feature: varchar("feature").notNull(),
  entryProvider: varchar("entry_provider"),
  entryModel: varchar("entry_model"),
  entryMeters: jsonb("entry_meters").$type<ExpectedMeter[]>().notNull().default(sql`'[]'::jsonb`),
  status: varchar("status").notNull().default("reserved"),
  reservedCostMicroUsd: bigint("reserved_cost_micro_usd", { mode: "number" }).notNull(),
  modelsHash: varchar("models_hash", { length: 64 }),
  modelProfile: jsonb("model_profile").$type<AiJobModelCall[]>(),
  expiresAt: timestamp("expires_at").notNull(),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_jobs_owner_status_expiry").on(table.accountOwnerId, table.status, table.expiresAt),
  index("idx_ai_jobs_status_expiry").on(table.status, table.expiresAt),
  index("idx_ai_jobs_owner_created").on(table.accountOwnerId, table.createdAt),
  index("idx_ai_jobs_feature_profile_finished").on(table.feature, table.modelsHash, table.finishedAt),
  index("idx_ai_jobs_feature_status_finished").on(table.feature, table.status, table.finishedAt),
  index("idx_ai_jobs_feature_entry_finished").on(
    table.feature,
    table.entryProvider,
    table.entryModel,
    table.finishedAt,
  ),
  check("ai_jobs_status_check", sql`${table.status} IN ('reserved', 'completed', 'failed', 'expired')`),
  check("ai_jobs_reserved_cost_check", sql`${table.reservedCostMicroUsd} > 0`),
  check("ai_jobs_profile_pair_check", sql`(${table.modelsHash} IS NULL) = (${table.modelProfile} IS NULL)`),
  check("ai_jobs_entry_pair_check", sql`(${table.entryProvider} IS NULL) = (${table.entryModel} IS NULL)`),
  check("ai_jobs_entry_meters_array_check", sql`jsonb_typeof(${table.entryMeters}) = 'array'`),
]);

export const insertAiJobSchema = createInsertSchema(aiJobs).omit({
  id: true,
  status: true,
  modelsHash: true,
  modelProfile: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiJob = z.infer<typeof insertAiJobSchema>;
export type AiJob = typeof aiJobs.$inferSelect;

export const NOTIFICATION_TYPES = ["quota_reached_schedule_stopped"] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export const NOTIFICATION_DELIVERY_METHODS = ["email", "push_noti"] as const;
export type NotificationDeliveryMethod = typeof NOTIFICATION_DELIVERY_METHODS[number];

// Append-only delivery-attempt ledger used for cross-channel notification throttling.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").$type<NotificationType>().notNull(),
  deliveryMethod: varchar("delivery_method").$type<NotificationDeliveryMethod>().notNull(),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_user_type_method_attempted").on(
    table.userId,
    table.type,
    table.deliveryMethod,
    table.attemptedAt.desc(),
  ),
  check("notifications_type_check", sql`${table.type} IN ('quota_reached_schedule_stopped')`),
  check("notifications_delivery_method_check", sql`${table.deliveryMethod} IN ('email', 'push_noti')`),
]);

export type Notification = typeof notifications.$inferSelect;

// AI usage logs — append-only, one row per LLM completion call. Powers
// per-account/brand/feature cost analytics and the per-cycle usage cap.
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Nullable: some calls predate a brand (onboarding research) or have none (admin news gen)
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  // Customer calls are linked to their durable job in invocation order. System
  // and historical rows remain nullable.
  jobId: varchar("job_id").references(() => aiJobs.id),
  callIndex: integer("call_index"),
  feature: varchar("feature").notNull(),
  provider: varchar("provider").notNull(), // openai | anthropic | gemini
  model: varchar("model").notNull(), // actual model used, incl. retry fallback
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  // Gemini thoughtsTokenCount — billed at the output rate but invisible in response text
  thinkingTokens: integer("thinking_tokens").notNull().default(0),
  // Cache counters are subsets of inputTokens, not additional context tokens.
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  // Anthropic prices 1-hour writes separately; 5-minute writes are total minus this value.
  cacheWrite1hTokens: integer("cache_write_1h_tokens").notNull().default(0),
  // Cost snapshot at call time, in millionths of a USD (avoids float drift)
  costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
  meters: jsonb("meters").$type<PricedMeterUsage[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_usage_user_created").on(table.userId, table.createdAt),
  index("idx_ai_usage_brand").on(table.brandId),
  index("idx_ai_usage_created").on(table.createdAt),
  uniqueIndex("idx_ai_usage_job_call").on(table.jobId, table.callIndex),
  index("idx_ai_usage_meters_gin").using("gin", table.meters),
  check("ai_usage_job_call_pair_check", sql`(${table.jobId} IS NULL) = (${table.callIndex} IS NULL)`),
  check("ai_usage_call_index_check", sql`${table.callIndex} IS NULL OR ${table.callIndex} >= 0`),
  check("ai_usage_meters_array_check", sql`jsonb_typeof(${table.meters}) = 'array'`),
]);

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

export const aiCostEstimations = pgTable("ai_cost_estimation", {
  feature: varchar("feature").notNull(),
  modelsHash: varchar("models_hash", { length: 64 }).notNull(),
  modelProfile: jsonb("model_profile").$type<AiJobModelCall[]>().notNull(),
  estimatedTokens: jsonb("estimated_tokens").$type<AiEstimatedCallTokens[]>().notNull(),
  estimatedUsage: jsonb("estimated_usage").$type<AiEstimatedCallUsage[]>(),
  sampleCount: integer("sample_count").notNull(),
  sourceMaxFinishedAt: timestamp("source_max_finished_at"),
  algorithmVersion: integer("algorithm_version").notNull(),
  version: integer("version").notNull().default(1),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.feature, table.modelsHash] }),
  check("ai_cost_estimations_sample_count_check", sql`${table.sampleCount} >= 0`),
  check("ai_cost_estimations_algorithm_version_check", sql`${table.algorithmVersion} > 0`),
  check("ai_cost_estimations_version_check", sql`${table.version} > 0`),
  check("ai_cost_estimations_usage_array_check", sql`${table.estimatedUsage} IS NULL OR jsonb_typeof(${table.estimatedUsage}) = 'array'`),
]);

export type AiCostEstimation = typeof aiCostEstimations.$inferSelect;

// System config — dynamic runtime configuration (model pricing, FX rate, …)
// editable at runtime via the super-admin API, unlike fixed .env config.
// cacheMaxDurationSecs is the per-entry freshness threshold: null means the
// value is human-set and never auto-refreshes; a number means a stale read
// passively re-fetches from the entry's registered source.
export const systemConfig = pgTable("system_config", {
  key: varchar("key").primaryKey(),
  value: jsonb("value").notNull(),
  cacheMaxDurationSecs: integer("cache_max_duration_secs"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemConfigEntry = typeof systemConfig.$inferSelect;
