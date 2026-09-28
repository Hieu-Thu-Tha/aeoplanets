import {
  users,
  brands,
  visibilityRuns,
  perceptionProfiles,
  coverageGaps,
  readabilityAudits,
  changeAlerts,
  reports,
  subscriptions,
  invoices,
  trackedTerms,
  userQuestions,
  newsArticles,
  customerReviews,
  actionTickets,
  actionComments,
  teamInvitations,
  teamMembers,
  aiCache,
  type User,
  type UpsertUser,
  type Brand,
  type InsertBrand,
  type VisibilityRun,
  type InsertVisibilityRun,
  type PerceptionProfile,
  type InsertPerceptionProfile,
  type CoverageGap,
  type InsertCoverageGap,
  type ReadabilityAudit,
  type InsertReadabilityAudit,
  type ChangeAlert,
  type InsertChangeAlert,
  type Report,
  type InsertReport,
  type Subscription,
  type InsertSubscription,
  subscriptionAddons,
  type SubscriptionAddon,
  type InsertSubscriptionAddon,
  type Invoice,
  type InsertInvoice,
  type TrackedTerm,
  type InsertTrackedTerm,
  type UserQuestion,
  type InsertUserQuestion,
  type NewsArticle,
  type InsertNewsArticle,
  type CustomerReview,
  type InsertCustomerReview,
  type ActionTicket,
  type InsertActionTicket,
  type ActionComment,
  type InsertActionComment,
  type TeamInvitation,
  type InsertTeamInvitation,
  type TeamMember,
  type InsertTeamMember,
  type AiCache,
  provisionedAccounts,
  type ProvisionedAccount,
  type InsertProvisionedAccount,
  trialAccountRequests,
  type TrialAccountRequest,
  type InsertTrialAccountRequest,
  aiUsageLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lt, max, min, inArray, isNull } from "drizzle-orm";
import { invalidateAiUsageCycleSpend } from "./services/ai-usage/cycle";

export interface AiUsageSummaryRow {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  costMicroUsd: number;
}

export interface AiUsageBreakdownRow {
  group: string; // feature name, brandId (as string), or model depending on groupBy
  calls: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  costMicroUsd: number;
}

export interface TrialEntitlementUpdate {
  userId: string;
  trialEndsAt: Date;
  trialDurationDays: number;
  updatedBy: string;
}

export interface AiUsageBreakdownFilters {
  userId?: string;
  brandId?: number;
  feature?: string;
  since?: Date;
  until?: Date;
  groupBy: "feature" | "brand" | "model";
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByLinkedInId(linkedinId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: Omit<UpsertUser, 'id'>): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
  countUsers(): Promise<number>;

  // Password reset operations
  createPasswordResetToken(userId: string, hashedToken: string, expiresAt: Date): Promise<void>;
  verifyAndGetUserByResetToken(plainToken: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: string): Promise<void>;

  // Brand operations
  getBrand(id: number): Promise<Brand | undefined>;
  getBrandsByUser(userId: string): Promise<Brand[]>;
  getAllBrands(): Promise<Brand[]>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: number, updates: Partial<Brand>): Promise<Brand>;
  deleteBrand(id: number): Promise<void>;

  // Visibility Run operations
  getVisibilityRunsByBrand(brandId: number, filters?: { promptType?: string; modelId?: string; startDate?: Date; endDate?: Date }): Promise<VisibilityRun[]>;
  getVisibilityRun(id: number): Promise<VisibilityRun | undefined>;
  getVisibilityRunsByTrackedTerm(trackedTermId: number): Promise<VisibilityRun[]>;
  createVisibilityRun(run: InsertVisibilityRun): Promise<VisibilityRun>;
  bulkCreateVisibilityRuns(runs: InsertVisibilityRun[]): Promise<void>;
  getVisibilityRunsSince(brandId: number, since: Date): Promise<VisibilityRun[]>;

  // Perception Profile operations
  getPerceptionProfile(brandId: number): Promise<PerceptionProfile | undefined>;
  upsertPerceptionProfile(profile: InsertPerceptionProfile): Promise<PerceptionProfile>;

  // Coverage Gap operations
  getCoverageGap(brandId: number): Promise<CoverageGap | undefined>;
  upsertCoverageGap(gap: InsertCoverageGap): Promise<CoverageGap>;

  // Readability Audit operations
  getReadabilityAudit(brandId: number): Promise<ReadabilityAudit | undefined>;
  upsertReadabilityAudit(audit: InsertReadabilityAudit): Promise<ReadabilityAudit>;

  // Change Alert operations
  getChangeAlertsByBrand(brandId: number, unreadOnly?: boolean): Promise<ChangeAlert[]>;
  createChangeAlert(alert: InsertChangeAlert): Promise<ChangeAlert>;
  markChangeAlertAsRead(id: number): Promise<void>;
  markAllChangeAlertsAsRead(brandId: number): Promise<void>;
  countUnreadChangeAlerts(brandId: number): Promise<number>;

  // Report operations
  getReportsByBrand(brandId: number): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  deleteReport(id: number): Promise<void>;

  // News Article operations
  getNewsArticle(id: number): Promise<NewsArticle | undefined>;
  getNewsArticleBySlug(slug: string): Promise<NewsArticle | undefined>;
  getAllNewsArticles(publishedOnly?: boolean): Promise<NewsArticle[]>;
  createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle>;
  updateNewsArticle(id: number, updates: Partial<InsertNewsArticle>): Promise<NewsArticle>;
  deleteNewsArticle(id: number): Promise<void>;

  // Customer Review operations
  getCustomerReview(id: number): Promise<CustomerReview | undefined>;
  getAllCustomerReviews(): Promise<CustomerReview[]>;
  getApprovedCustomerReviews(): Promise<CustomerReview[]>;
  createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview>;
  updateCustomerReview(id: number, updates: Partial<InsertCustomerReview>): Promise<CustomerReview>;
  deleteCustomerReview(id: number): Promise<void>;

  // Subscription operations
  getSubscriptionByUserId(userId: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, updates: Partial<Subscription>): Promise<Subscription>;
  updateTrialEntitlement(update: TrialEntitlementUpdate): Promise<Subscription>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  countDriftedSubscriptions(): Promise<number>;
  getDriftedSubscriptions(): Promise<Subscription[]>;

  // Invoice operations
  getInvoicesByUserId(userId: string): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceByStripeId(stripeInvoiceId: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, updates: Partial<Invoice>): Promise<Invoice>;
  getNextInvoiceNumber(): Promise<string>;

  // Subscription Addon operations
  getAddonsByUserId(userId: string): Promise<SubscriptionAddon[]>;
  getAddonsBySubscriptionId(subscriptionId: number): Promise<SubscriptionAddon[]>;
  getAddonByStripeItemId(stripeSubscriptionItemId: string): Promise<SubscriptionAddon | undefined>;
  createAddon(data: InsertSubscriptionAddon): Promise<SubscriptionAddon>;
  updateAddon(id: number, updates: Partial<SubscriptionAddon>): Promise<SubscriptionAddon>;

  // Tracked Term operations
  getTrackedTermsByUser(userId: string): Promise<TrackedTerm[]>;
  getTrackedTermsByBrand(brandId: number): Promise<TrackedTerm[]>;
  createTrackedTerm(data: InsertTrackedTerm): Promise<TrackedTerm>;
  updateTrackedTerm(id: number, updates: Partial<TrackedTerm>): Promise<TrackedTerm>;
  deleteTrackedTerm(id: number): Promise<void>;
  countActiveTrackedTerms(userId: string): Promise<number>;

  // User Question operations
  getUserQuestionsByTerm(trackedTermId: number): Promise<UserQuestion[]>;
  getUserQuestionsByUser(userId: string): Promise<UserQuestion[]>;
  getActiveUserQuestionsByBrand(brandId: number): Promise<UserQuestion[]>;
  createUserQuestion(data: InsertUserQuestion): Promise<UserQuestion>;
  updateUserQuestion(id: number, updates: Partial<UserQuestion>): Promise<UserQuestion>;
  deleteUserQuestion(id: number): Promise<void>;
  deleteUserQuestionsByTerm(trackedTermId: number): Promise<void>;
  countActiveUserQuestions(userId: string): Promise<number>;
  getVisibilityRunsByUserQuestion(userQuestionId: number): Promise<VisibilityRun[]>;

  // Action Ticket operations
  getActionTicketsByBrand(brandId: number): Promise<ActionTicket[]>;
  getActionTicket(id: number): Promise<ActionTicket | undefined>;
  createActionTicket(ticket: InsertActionTicket): Promise<ActionTicket>;
  updateActionTicket(id: number, updates: Partial<ActionTicket>): Promise<ActionTicket>;
  deleteActionTicket(id: number): Promise<void>;
  getActiveTicketsBySourceRef(brandId: number, source: string, sourceRef: string): Promise<ActionTicket[]>;

  // Action Comment operations
  getActionCommentsByTicket(ticketId: number): Promise<ActionComment[]>;
  getActionComment(id: number): Promise<ActionComment | undefined>;
  createActionComment(comment: InsertActionComment): Promise<ActionComment>;
  deleteActionComment(id: number): Promise<void>;

  // Team Invitation operations
  createTeamInvitation(invite: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitationsByOwner(ownerId: string): Promise<TeamInvitation[]>;
  updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation>;

  // Team Member operations
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  getTeamMembersByOwner(ownerId: string): Promise<TeamMember[]>;
  getTeamMemberByUserId(userId: string): Promise<TeamMember | undefined>;
  updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: number): Promise<void>;
  countTeamMembers(ownerId: string): Promise<number>;

  // AI Cache operations
  getAiCache(brandId: number, cacheType: string, cacheKey: string): Promise<AiCache | undefined>;
  upsertAiCache(brandId: number, cacheType: string, cacheKey: string, data: any): Promise<AiCache>;
  getAiCacheByBrandAndType(brandId: number, cacheType: string): Promise<AiCache[]>;

  // Provisioned Account operations
  createProvisionedAccount(data: InsertProvisionedAccount): Promise<ProvisionedAccount>;
  getProvisionedAccountByToken(token: string): Promise<ProvisionedAccount | undefined>;
  getProvisionedAccountByEmail(email: string): Promise<ProvisionedAccount | undefined>;
  getAllProvisionedAccounts(): Promise<ProvisionedAccount[]>;
  updateProvisionedAccount(id: number, updates: Partial<ProvisionedAccount>): Promise<ProvisionedAccount>;

  // Trial Account Request operations
  createTrialAccountRequest(data: InsertTrialAccountRequest): Promise<TrialAccountRequest>;
  getTrialAccountRequest(id: number): Promise<TrialAccountRequest | undefined>;
  getAllTrialAccountRequests(): Promise<TrialAccountRequest[]>;
  getPendingTrialRequestByEmail(email: string): Promise<TrialAccountRequest | undefined>;
  updateTrialAccountRequest(id: number, updates: Partial<TrialAccountRequest>): Promise<TrialAccountRequest>;
  deleteTrialAccountRequest(id: number): Promise<void>;

  // Admin account management operations
  deleteUser(userId: string): Promise<void>;
  deleteSubscriptionByUserId(userId: string): Promise<void>;
  deleteVisibilityRunsByBrand(brandId: number): Promise<void>;
  deleteTeamMembersByOwner(ownerId: string): Promise<void>;
  deleteTeamInvitationsByOwner(ownerId: string): Promise<void>;
  getVisibilityRunCountsByModel(brandId: number, before?: Date): Promise<{ modelId: string; count: number; totalPromptChars: number; totalResponseChars: number }[]>;

  // AI usage log operations
  getAiUsageSummaryByUser(userId: string, since?: Date, until?: Date): Promise<AiUsageSummaryRow[]>;
  getOldestAiUsageAtOrAfter(userId: string, since: Date): Promise<Date | undefined>;
  getAiUsageBreakdown(filters: AiUsageBreakdownFilters): Promise<AiUsageBreakdownRow[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByLinkedInId(linkedinId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.linkedinId, linkedinId));
    return user;
  }

  async createUser(userData: Omit<UpsertUser, 'id'>): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db.update(users).set({ lastLogin: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async countUsers(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result.count;
  }

  async createPasswordResetToken(userId: string, hashedToken: string, expiresAt: Date): Promise<void> {
    await db.update(users).set({
      resetToken: hashedToken,
      resetTokenExpires: expiresAt,
      updatedAt: new Date()
    }).where(eq(users.id, userId));
  }

  async verifyAndGetUserByResetToken(plainToken: string): Promise<User | undefined> {
    const usersWithTokens = await db
      .select()
      .from(users)
      .where(and(
        sql`${users.resetToken} IS NOT NULL`,
        gte(users.resetTokenExpires, new Date())
      ));

    const { verifyResetToken } = await import("./auth");
    for (const user of usersWithTokens) {
      if (user.resetToken && await verifyResetToken(user.resetToken, plainToken)) {
        return user;
      }
    }
    return undefined;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db.update(users).set({
      resetToken: null,
      resetTokenExpires: null,
      updatedAt: new Date()
    }).where(eq(users.id, userId));
  }

  // Brand operations
  async getBrand(id: number): Promise<Brand | undefined> {
    const [brand] = await db.select().from(brands).where(eq(brands.id, id));
    return brand;
  }

  async getBrandsByUser(userId: string): Promise<Brand[]> {
    return await db.select().from(brands).where(eq(brands.userId, userId)).orderBy(desc(brands.createdAt));
  }

  async getAllBrands(): Promise<Brand[]> {
    return await db.select().from(brands).orderBy(desc(brands.createdAt));
  }

  async createBrand(brand: InsertBrand): Promise<Brand> {
    const [newBrand] = await db.insert(brands).values(brand).returning();
    return newBrand;
  }

  async updateBrand(id: number, updates: Partial<Brand>): Promise<Brand> {
    const [updated] = await db
      .update(brands)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();
    return updated;
  }

  async deleteBrand(id: number): Promise<void> {
    await db.delete(brands).where(eq(brands.id, id));
  }

  // Visibility Run operations
  async getVisibilityRunsByBrand(brandId: number, filters?: { promptType?: string; modelId?: string; startDate?: Date; endDate?: Date }): Promise<VisibilityRun[]> {
    const conditions = [eq(visibilityRuns.brandId, brandId)];

    if (filters?.promptType) {
      conditions.push(eq(visibilityRuns.promptType, filters.promptType));
    }
    if (filters?.modelId) {
      conditions.push(eq(visibilityRuns.modelId, filters.modelId));
    }
    if (filters?.startDate) {
      conditions.push(gte(visibilityRuns.runDate, filters.startDate));
    }

    return await db.select().from(visibilityRuns)
      .where(and(...conditions))
      .orderBy(desc(visibilityRuns.runDate));
  }

  async getVisibilityRun(id: number): Promise<VisibilityRun | undefined> {
    const [run] = await db.select().from(visibilityRuns).where(eq(visibilityRuns.id, id));
    return run;
  }

  async getVisibilityRunsByTrackedTerm(trackedTermId: number): Promise<VisibilityRun[]> {
    return await db.select().from(visibilityRuns)
      .where(eq(visibilityRuns.trackedTermId, trackedTermId))
      .orderBy(desc(visibilityRuns.runDate));
  }

  async createVisibilityRun(run: InsertVisibilityRun): Promise<VisibilityRun> {
    const [newRun] = await db.insert(visibilityRuns).values(run).returning();
    return newRun;
  }

  async bulkCreateVisibilityRuns(runs: InsertVisibilityRun[]): Promise<void> {
    if (runs.length === 0) return;
    await db.insert(visibilityRuns).values(runs);
  }

  async updateVisibilityRun(id: number, updates: Partial<VisibilityRun>): Promise<void> {
    await db.update(visibilityRuns).set(updates).where(eq(visibilityRuns.id, id));
  }

  async getVisibilityRunsSince(brandId: number, since: Date): Promise<VisibilityRun[]> {
    return await db.select().from(visibilityRuns)
      .where(and(eq(visibilityRuns.brandId, brandId), gte(visibilityRuns.runDate, since)))
      .orderBy(desc(visibilityRuns.runDate));
  }

  // Perception Profile operations
  async getPerceptionProfile(brandId: number): Promise<PerceptionProfile | undefined> {
    const [profile] = await db.select().from(perceptionProfiles)
      .where(eq(perceptionProfiles.brandId, brandId))
      .orderBy(desc(perceptionProfiles.lastUpdated))
      .limit(1);
    return profile;
  }

  async upsertPerceptionProfile(profile: InsertPerceptionProfile): Promise<PerceptionProfile> {
    const existing = await this.getPerceptionProfile(profile.brandId);
    if (existing) {
      const [updated] = await db.update(perceptionProfiles)
        .set({ ...profile, lastUpdated: new Date() })
        .where(eq(perceptionProfiles.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(perceptionProfiles).values(profile).returning();
    return created;
  }

  // Coverage Gap operations
  async getCoverageGap(brandId: number): Promise<CoverageGap | undefined> {
    const [gap] = await db.select().from(coverageGaps)
      .where(eq(coverageGaps.brandId, brandId))
      .orderBy(desc(coverageGaps.lastUpdated))
      .limit(1);
    return gap;
  }

  async upsertCoverageGap(gap: InsertCoverageGap): Promise<CoverageGap> {
    const existing = await this.getCoverageGap(gap.brandId);
    if (existing) {
      const [updated] = await db.update(coverageGaps)
        .set({ ...gap, lastUpdated: new Date() })
        .where(eq(coverageGaps.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(coverageGaps).values(gap).returning();
    return created;
  }

  // Readability Audit operations
  async getReadabilityAudit(brandId: number): Promise<ReadabilityAudit | undefined> {
    const [audit] = await db.select().from(readabilityAudits)
      .where(eq(readabilityAudits.brandId, brandId))
      .orderBy(desc(readabilityAudits.lastUpdated))
      .limit(1);
    return audit;
  }

  async upsertReadabilityAudit(audit: InsertReadabilityAudit): Promise<ReadabilityAudit> {
    const existing = await this.getReadabilityAudit(audit.brandId);
    if (existing) {
      const [updated] = await db.update(readabilityAudits)
        .set({ ...audit, lastUpdated: new Date() })
        .where(eq(readabilityAudits.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(readabilityAudits).values(audit).returning();
    return created;
  }

  // Change Alert operations
  async getChangeAlertsByBrand(brandId: number, unreadOnly = false): Promise<ChangeAlert[]> {
    const conditions = unreadOnly
      ? and(eq(changeAlerts.brandId, brandId), eq(changeAlerts.isRead, false))
      : eq(changeAlerts.brandId, brandId);

    return await db.select().from(changeAlerts)
      .where(conditions)
      .orderBy(desc(changeAlerts.createdAt));
  }

  async createChangeAlert(alert: InsertChangeAlert): Promise<ChangeAlert> {
    const [newAlert] = await db.insert(changeAlerts).values(alert).returning();
    return newAlert;
  }

  async markChangeAlertAsRead(id: number): Promise<void> {
    await db.update(changeAlerts).set({ isRead: true }).where(eq(changeAlerts.id, id));
  }

  async markAllChangeAlertsAsRead(brandId: number): Promise<void> {
    await db.update(changeAlerts)
      .set({ isRead: true })
      .where(and(eq(changeAlerts.brandId, brandId), eq(changeAlerts.isRead, false)));
  }

  async countUnreadChangeAlerts(brandId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(changeAlerts)
      .where(and(eq(changeAlerts.brandId, brandId), eq(changeAlerts.isRead, false)));
    return result.count;
  }

  // Report operations
  async getReportsByBrand(brandId: number): Promise<Report[]> {
    return await db.select().from(reports)
      .where(eq(reports.brandId, brandId))
      .orderBy(desc(reports.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async createReport(report: InsertReport): Promise<Report> {
    const [newReport] = await db.insert(reports).values(report).returning();
    return newReport;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  // News Article operations
  async getNewsArticle(id: number): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.id, id));
    return article;
  }

  async getNewsArticleBySlug(slug: string): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.slug, slug));
    return article;
  }

  async getAllNewsArticles(publishedOnly = false): Promise<NewsArticle[]> {
    if (publishedOnly) {
      return await db.select().from(newsArticles)
        .where(eq(newsArticles.isPublished, true))
        .orderBy(desc(newsArticles.publishedAt));
    }
    return await db.select().from(newsArticles).orderBy(desc(newsArticles.createdAt));
  }

  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    const [newArticle] = await db.insert(newsArticles).values(article).returning();
    return newArticle;
  }

  async updateNewsArticle(id: number, updates: Partial<InsertNewsArticle>): Promise<NewsArticle> {
    const [updated] = await db.update(newsArticles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(newsArticles.id, id))
      .returning();
    return updated;
  }

  async deleteNewsArticle(id: number): Promise<void> {
    await db.delete(newsArticles).where(eq(newsArticles.id, id));
  }

  // Customer Review operations
  async getCustomerReview(id: number): Promise<CustomerReview | undefined> {
    const [review] = await db.select().from(customerReviews).where(eq(customerReviews.id, id));
    return review;
  }

  async getAllCustomerReviews(): Promise<CustomerReview[]> {
    return await db.select().from(customerReviews).orderBy(desc(customerReviews.createdAt));
  }

  async getApprovedCustomerReviews(): Promise<CustomerReview[]> {
    return await db.select().from(customerReviews)
      .where(eq(customerReviews.isApproved, true))
      .orderBy(desc(customerReviews.createdAt));
  }

  async createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview> {
    const [newReview] = await db.insert(customerReviews).values(review).returning();
    return newReview;
  }

  async updateCustomerReview(id: number, updates: Partial<InsertCustomerReview>): Promise<CustomerReview> {
    const [updated] = await db.update(customerReviews)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerReviews.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerReview(id: number): Promise<void> {
    await db.delete(customerReviews).where(eq(customerReviews.id, id));
  }

  // Subscription operations
  async getSubscriptionByUserId(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return sub;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return sub;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
    return user;
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [sub] = await db.insert(subscriptions).values(data).returning();
    invalidateAiUsageCycleSpend(sub.userId);
    return sub;
  }

  async updateSubscription(id: number, updates: Partial<Subscription>): Promise<Subscription> {
    const [sub] = await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id)).returning();
    invalidateAiUsageCycleSpend(sub.userId);
    return sub;
  }

  async updateTrialEntitlement(update: TrialEntitlementUpdate): Promise<Subscription> {
    const updatedAt = new Date();
    const sub = await db.transaction(async (tx) => {
      const [updated] = await tx.update(subscriptions)
        .set({
          trialEndsAt: update.trialEndsAt,
          billingPeriodEnd: update.trialEndsAt,
          trialUpdatedAt: updatedAt,
          trialUpdatedBy: update.updatedBy,
        })
        .where(eq(subscriptions.userId, update.userId))
        .returning();
      if (!updated) throw new Error("Subscription not found");

      await tx.update(provisionedAccounts)
        .set({ trialDurationDays: update.trialDurationDays })
        .where(eq(provisionedAccounts.registeredUserId, update.userId));
      return updated;
    });
    invalidateAiUsageCycleSpend(update.userId);
    return sub;
  }

  async countDriftedSubscriptions(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, ["active", "past_due"]),
          isNull(subscriptions.stripeSubscriptionId),
          sql`(${subscriptions.monthlyAmount} > 0 OR ${subscriptions.annualAmount} > 0)`,
        ),
      );
    return result?.count ?? 0;
  }

  async getDriftedSubscriptions(): Promise<Subscription[]> {
    return await db
      .select()
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, ["active", "past_due"]),
          isNull(subscriptions.stripeSubscriptionId),
          sql`(${subscriptions.monthlyAmount} > 0 OR ${subscriptions.annualAmount} > 0)`,
        ),
      );
  }

  // Invoice operations
  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    return await db.select().from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.invoiceDate));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceByStripeId(stripeInvoiceId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.stripeInvoiceId, stripeInvoiceId));
    return invoice;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(data).returning();
    return invoice;
  }

  async updateInvoice(id: number, updates: Partial<Invoice>): Promise<Invoice> {
    const [invoice] = await db.update(invoices).set(updates).where(eq(invoices.id, id)).returning();
    return invoice;
  }

  async getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db.select({ maxId: max(invoices.id) }).from(invoices);
    const nextNum = (result?.maxId ?? 0) + 1;
    return `INV-${year}-${String(nextNum).padStart(4, "0")}`;
  }

  // Subscription Addon operations
  async getAddonsByUserId(userId: string): Promise<SubscriptionAddon[]> {
    return await db.select().from(subscriptionAddons)
      .where(and(eq(subscriptionAddons.userId, userId), eq(subscriptionAddons.status, "active")))
      .orderBy(desc(subscriptionAddons.createdAt));
  }

  async getAddonsBySubscriptionId(subscriptionId: number): Promise<SubscriptionAddon[]> {
    return await db.select().from(subscriptionAddons)
      .where(and(eq(subscriptionAddons.subscriptionId, subscriptionId), eq(subscriptionAddons.status, "active")))
      .orderBy(desc(subscriptionAddons.createdAt));
  }

  async getAddonByStripeItemId(stripeSubscriptionItemId: string): Promise<SubscriptionAddon | undefined> {
    const [addon] = await db.select().from(subscriptionAddons)
      .where(eq(subscriptionAddons.stripeSubscriptionItemId, stripeSubscriptionItemId));
    return addon;
  }

  async createAddon(data: InsertSubscriptionAddon): Promise<SubscriptionAddon> {
    const [addon] = await db.insert(subscriptionAddons).values(data).returning();
    return addon;
  }

  async updateAddon(id: number, updates: Partial<SubscriptionAddon>): Promise<SubscriptionAddon> {
    const [addon] = await db.update(subscriptionAddons).set(updates).where(eq(subscriptionAddons.id, id)).returning();
    return addon;
  }

  // Tracked Term operations
  async getTrackedTermsByUser(userId: string): Promise<TrackedTerm[]> {
    return await db.select().from(trackedTerms)
      .where(eq(trackedTerms.userId, userId))
      .orderBy(desc(trackedTerms.createdAt));
  }

  async getTrackedTermsByBrand(brandId: number): Promise<TrackedTerm[]> {
    return await db.select().from(trackedTerms)
      .where(eq(trackedTerms.brandId, brandId))
      .orderBy(desc(trackedTerms.createdAt));
  }

  async createTrackedTerm(data: InsertTrackedTerm): Promise<TrackedTerm> {
    const [term] = await db.insert(trackedTerms).values(data).returning();
    return term;
  }

  async updateTrackedTerm(id: number, updates: Partial<TrackedTerm>): Promise<TrackedTerm> {
    const [term] = await db.update(trackedTerms).set(updates).where(eq(trackedTerms.id, id)).returning();
    return term;
  }

  async deleteTrackedTerm(id: number): Promise<void> {
    await db.delete(trackedTerms).where(eq(trackedTerms.id, id));
  }

  async countActiveTrackedTerms(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedTerms)
      .where(and(eq(trackedTerms.userId, userId), eq(trackedTerms.isActive, true)));
    return result.count;
  }

  async getUserQuestionsByTerm(trackedTermId: number): Promise<UserQuestion[]> {
    return await db.select().from(userQuestions)
      .where(eq(userQuestions.trackedTermId, trackedTermId))
      .orderBy(desc(userQuestions.createdAt));
  }

  async getUserQuestionsByUser(userId: string): Promise<UserQuestion[]> {
    return await db.select().from(userQuestions)
      .where(eq(userQuestions.userId, userId))
      .orderBy(desc(userQuestions.createdAt));
  }

  async getActiveUserQuestionsByBrand(brandId: number): Promise<UserQuestion[]> {
    return await db.select({
      id: userQuestions.id,
      trackedTermId: userQuestions.trackedTermId,
      userId: userQuestions.userId,
      question: userQuestions.question,
      questionType: userQuestions.questionType,
      questionCategory: userQuestions.questionCategory,
      isActive: userQuestions.isActive,
      searchVolume: userQuestions.searchVolume,
      searchVolumeMin: userQuestions.searchVolumeMin,
      searchVolumeMax: userQuestions.searchVolumeMax,
      createdAt: userQuestions.createdAt,
    }).from(userQuestions)
      .innerJoin(trackedTerms, eq(userQuestions.trackedTermId, trackedTerms.id))
      .where(and(
        eq(trackedTerms.brandId, brandId),
        eq(userQuestions.isActive, true),
        eq(trackedTerms.isActive, true),
      ))
      .orderBy(desc(userQuestions.createdAt));
  }

  async createUserQuestion(data: InsertUserQuestion): Promise<UserQuestion> {
    const [q] = await db.insert(userQuestions).values(data).returning();
    return q;
  }

  async updateUserQuestion(id: number, updates: Partial<UserQuestion>): Promise<UserQuestion> {
    const [q] = await db.update(userQuestions).set(updates).where(eq(userQuestions.id, id)).returning();
    return q;
  }

  async deleteUserQuestion(id: number): Promise<void> {
    await db.delete(userQuestions).where(eq(userQuestions.id, id));
  }

  async deleteUserQuestionsByTerm(trackedTermId: number): Promise<void> {
    await db.delete(userQuestions).where(eq(userQuestions.trackedTermId, trackedTermId));
  }

  async countActiveUserQuestions(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(userQuestions)
      .where(and(eq(userQuestions.userId, userId), eq(userQuestions.isActive, true)));
    return result.count;
  }

  async getVisibilityRunsByUserQuestion(userQuestionId: number): Promise<VisibilityRun[]> {
    return await db.select().from(visibilityRuns)
      .where(eq(visibilityRuns.userQuestionId, userQuestionId))
      .orderBy(desc(visibilityRuns.runDate));
  }

  // Action Ticket operations
  async getActionTicketsByBrand(brandId: number): Promise<ActionTicket[]> {
    return await db.select().from(actionTickets)
      .where(eq(actionTickets.brandId, brandId))
      .orderBy(desc(actionTickets.updatedAt));
  }

  async getActionTicket(id: number): Promise<ActionTicket | undefined> {
    const [ticket] = await db.select().from(actionTickets).where(eq(actionTickets.id, id));
    return ticket;
  }

  async createActionTicket(ticket: InsertActionTicket): Promise<ActionTicket> {
    const [created] = await db.insert(actionTickets).values(ticket).returning();
    return created;
  }

  async updateActionTicket(id: number, updates: Partial<ActionTicket>): Promise<ActionTicket> {
    const [updated] = await db.update(actionTickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(actionTickets.id, id))
      .returning();
    return updated;
  }

  async deleteActionTicket(id: number): Promise<void> {
    await db.delete(actionTickets).where(eq(actionTickets.id, id));
  }

  async getActiveTicketsBySourceRef(brandId: number, source: string, sourceRef: string): Promise<ActionTicket[]> {
    return await db.select().from(actionTickets)
      .where(and(
        eq(actionTickets.brandId, brandId),
        eq(actionTickets.source, source),
        eq(actionTickets.sourceRef, sourceRef),
      ));
  }

  // Action Comment operations
  async getActionCommentsByTicket(ticketId: number): Promise<ActionComment[]> {
    return await db.select().from(actionComments)
      .where(eq(actionComments.ticketId, ticketId))
      .orderBy(actionComments.createdAt);
  }

  async getActionComment(id: number): Promise<ActionComment | undefined> {
    const [comment] = await db.select().from(actionComments).where(eq(actionComments.id, id));
    return comment;
  }

  async createActionComment(comment: InsertActionComment): Promise<ActionComment> {
    const [created] = await db.insert(actionComments).values(comment).returning();
    return created;
  }

  async deleteActionComment(id: number): Promise<void> {
    await db.delete(actionComments).where(eq(actionComments.id, id));
  }

  // Team Invitation operations
  async createTeamInvitation(invite: InsertTeamInvitation): Promise<TeamInvitation> {
    const [created] = await db.insert(teamInvitations).values(invite).returning();
    return created;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    const [invite] = await db.select().from(teamInvitations)
      .where(eq(teamInvitations.inviteToken, token));
    return invite;
  }

  async getTeamInvitationsByOwner(ownerId: string): Promise<TeamInvitation[]> {
    return await db.select().from(teamInvitations)
      .where(eq(teamInvitations.accountOwnerId, ownerId))
      .orderBy(desc(teamInvitations.createdAt));
  }

  async updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    const [updated] = await db.update(teamInvitations)
      .set(updates)
      .where(eq(teamInvitations.id, id))
      .returning();
    return updated;
  }

  // Team Member operations
  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(member).returning();
    return created;
  }

  async getTeamMembersByOwner(ownerId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers)
      .where(eq(teamMembers.accountOwnerId, ownerId));
  }

  async getTeamMemberByUserId(userId: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    return member;
  }

  async updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember> {
    const [updated] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: number): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  async countTeamMembers(ownerId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(eq(teamMembers.accountOwnerId, ownerId));
    return result[0]?.count ?? 0;
  }

  async getAiCache(brandId: number, cacheType: string, cacheKey: string): Promise<AiCache | undefined> {
    const [row] = await db.select().from(aiCache)
      .where(and(
        eq(aiCache.brandId, brandId),
        eq(aiCache.cacheType, cacheType),
        eq(aiCache.cacheKey, cacheKey),
      ));
    return row;
  }

  async upsertAiCache(brandId: number, cacheType: string, cacheKey: string, data: any): Promise<AiCache> {
    const existing = await this.getAiCache(brandId, cacheType, cacheKey);
    if (existing) {
      const [updated] = await db.update(aiCache)
        .set({ data, refreshedAt: new Date() })
        .where(eq(aiCache.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(aiCache)
      .values({ brandId, cacheType, cacheKey, data })
      .returning();
    return created;
  }

  async getAiCacheByBrandAndType(brandId: number, cacheType: string): Promise<AiCache[]> {
    return db.select().from(aiCache)
      .where(and(
        eq(aiCache.brandId, brandId),
        eq(aiCache.cacheType, cacheType),
      ))
      .orderBy(desc(aiCache.refreshedAt));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
    invalidateAiUsageCycleSpend(userId);
  }

  async deleteSubscriptionByUserId(userId: string): Promise<void> {
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    invalidateAiUsageCycleSpend(userId);
  }

  async deleteVisibilityRunsByBrand(brandId: number): Promise<void> {
    await db.delete(visibilityRuns).where(eq(visibilityRuns.brandId, brandId));
  }

  async deleteTeamMembersByOwner(ownerId: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.accountOwnerId, ownerId));
  }

  async deleteTeamInvitationsByOwner(ownerId: string): Promise<void> {
    await db.delete(teamInvitations).where(eq(teamInvitations.accountOwnerId, ownerId));
  }

  async createProvisionedAccount(data: InsertProvisionedAccount): Promise<ProvisionedAccount> {
    const [account] = await db.insert(provisionedAccounts).values(data).returning();
    return account;
  }

  async getProvisionedAccountByToken(token: string): Promise<ProvisionedAccount | undefined> {
    const [account] = await db.select().from(provisionedAccounts).where(eq(provisionedAccounts.inviteToken, token));
    return account;
  }

  async getProvisionedAccountByEmail(email: string): Promise<ProvisionedAccount | undefined> {
    const [account] = await db.select().from(provisionedAccounts)
      .where(eq(provisionedAccounts.email, email.toLowerCase()))
      .orderBy(desc(provisionedAccounts.createdAt));
    return account;
  }

  async getAllProvisionedAccounts(): Promise<ProvisionedAccount[]> {
    return db.select().from(provisionedAccounts).orderBy(desc(provisionedAccounts.createdAt));
  }

  async updateProvisionedAccount(id: number, updates: Partial<ProvisionedAccount>): Promise<ProvisionedAccount> {
    const [updated] = await db.update(provisionedAccounts).set(updates).where(eq(provisionedAccounts.id, id)).returning();
    return updated;
  }

  async createTrialAccountRequest(data: InsertTrialAccountRequest): Promise<TrialAccountRequest> {
    const [row] = await db.insert(trialAccountRequests).values(data).returning();
    return row;
  }

  async getTrialAccountRequest(id: number): Promise<TrialAccountRequest | undefined> {
    const [row] = await db.select().from(trialAccountRequests).where(eq(trialAccountRequests.id, id));
    return row;
  }

  async getAllTrialAccountRequests(): Promise<TrialAccountRequest[]> {
    return db.select().from(trialAccountRequests).orderBy(desc(trialAccountRequests.createdAt));
  }

  async getPendingTrialRequestByEmail(email: string): Promise<TrialAccountRequest | undefined> {
    const [row] = await db.select().from(trialAccountRequests)
      .where(and(eq(trialAccountRequests.email, email.toLowerCase()), eq(trialAccountRequests.status, "pending")))
      .orderBy(desc(trialAccountRequests.createdAt));
    return row;
  }

  async updateTrialAccountRequest(id: number, updates: Partial<TrialAccountRequest>): Promise<TrialAccountRequest> {
    const [updated] = await db.update(trialAccountRequests).set(updates).where(eq(trialAccountRequests.id, id)).returning();
    return updated;
  }

  async deleteTrialAccountRequest(id: number): Promise<void> {
    await db.delete(trialAccountRequests).where(eq(trialAccountRequests.id, id));
  }

  async getVisibilityRunCountsByModel(brandId: number, before?: Date): Promise<{ modelId: string; count: number; totalPromptChars: number; totalResponseChars: number }[]> {
    const conditions = [eq(visibilityRuns.brandId, brandId)];
    if (before) conditions.push(lt(visibilityRuns.runDate, before));
    const results = await db.select({
      modelId: visibilityRuns.modelId,
      count: sql<number>`count(*)::int`,
      totalPromptChars: sql<number>`coalesce(sum(length(${visibilityRuns.promptText})), 0)::int`,
      totalResponseChars: sql<number>`coalesce(sum(length(${visibilityRuns.rawResponse})), 0)::int`,
    })
    .from(visibilityRuns)
    .where(and(...conditions))
    .groupBy(visibilityRuns.modelId);
    return results;
  }

  async getAiUsageSummaryByUser(userId: string, since?: Date, until?: Date): Promise<AiUsageSummaryRow[]> {
    const conditions = [eq(aiUsageLogs.userId, userId)];
    if (since) conditions.push(gte(aiUsageLogs.createdAt, since));
    if (until) conditions.push(lt(aiUsageLogs.createdAt, until));
    return db.select({
      provider: aiUsageLogs.provider,
      model: aiUsageLogs.model,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::int`,
      thinkingTokens: sql<number>`coalesce(sum(${aiUsageLogs.thinkingTokens}), 0)::int`,
      cacheReadTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheReadTokens}), 0)::int`,
      cacheWriteTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheWriteTokens}), 0)::int`,
      cacheWrite1hTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheWrite1hTokens}), 0)::int`,
      costMicroUsd: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}), 0)::float8`,
    })
    .from(aiUsageLogs)
    .where(and(...conditions))
    .groupBy(aiUsageLogs.provider, aiUsageLogs.model);
  }

  async getOldestAiUsageAtOrAfter(userId: string, since: Date): Promise<Date | undefined> {
    const [row] = await db.select({ createdAt: min(aiUsageLogs.createdAt) })
      .from(aiUsageLogs)
      .where(and(
        eq(aiUsageLogs.userId, userId),
        gte(aiUsageLogs.createdAt, since),
      ));
    return row?.createdAt ?? undefined;
  }

  async getAiUsageBreakdown(filters: AiUsageBreakdownFilters): Promise<AiUsageBreakdownRow[]> {
    const groupCol =
      filters.groupBy === "feature" ? aiUsageLogs.feature :
      filters.groupBy === "brand" ? sql<string>`coalesce(${aiUsageLogs.brandId}::text, 'none')` :
      aiUsageLogs.model;

    const conditions = [];
    if (filters.userId) conditions.push(eq(aiUsageLogs.userId, filters.userId));
    if (filters.brandId != null) conditions.push(eq(aiUsageLogs.brandId, filters.brandId));
    if (filters.feature) conditions.push(eq(aiUsageLogs.feature, filters.feature));
    if (filters.since) conditions.push(gte(aiUsageLogs.createdAt, filters.since));
    if (filters.until) conditions.push(lt(aiUsageLogs.createdAt, filters.until));

    return db.select({
      group: sql<string>`${groupCol}`,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::int`,
      thinkingTokens: sql<number>`coalesce(sum(${aiUsageLogs.thinkingTokens}), 0)::int`,
      cacheReadTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheReadTokens}), 0)::int`,
      cacheWriteTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheWriteTokens}), 0)::int`,
      cacheWrite1hTokens: sql<number>`coalesce(sum(${aiUsageLogs.cacheWrite1hTokens}), 0)::int`,
      costMicroUsd: sql<number>`coalesce(sum(${aiUsageLogs.costMicroUsd}), 0)::float8`,
    })
    .from(aiUsageLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sql`${groupCol}`)
    .orderBy(sql`sum(${aiUsageLogs.costMicroUsd}) DESC`);
  }
}

export const storage = new DatabaseStorage();
