import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupLocalAuth, isAuthenticated, isAdmin, getUserId as getLocalUserId, getAccountOwnerId as getLocalAccountOwnerId, hasPermission, isAccountOwner } from "./localAuth";
import { seedAllData } from "./seed";
import {
  insertBrandSchema,
  insertChangeAlertSchema,
  insertReportSchema,
  insertNewsArticleSchema,
  insertCustomerReviewSchema,
  insertTrackedTermSchema,
  insertUserQuestionSchema,
  insertActionTicketSchema,
  insertActionCommentSchema,
  insertTrialAccountRequestSchema,
} from "@shared/schema";
import {
  calculateTrialEnd,
  DEFAULT_TRIAL_PLAN,
  MIN_TRIAL_DURATION_DAYS,
  TRIAL_PLAN_KEYS,
  TRIAL_DURATION_DAYS,
  type TrialPlan,
} from "@shared/trial";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { newsGenerator } from "./news-generator";
import { registerStripeRoutes, handleStripeWebhook, grantComplimentaryEnterprise } from "./stripe-routes";
import { isStripeConfigured } from "./stripe";
import { PLAN_CONFIG, getPlanConfig, canAccessFeature, getEffectiveAmount, formatPence, ADDON_CONFIG, getAddonConfig, getAddonEffectiveAmount } from "./plans";
import { createDealInLiftOS } from "./services/lift-os";
import { getTrialCompetitorLimit } from "./services/trial-plan-policy";
import { hasComplimentaryAccess, hasSuperAdminAccess, isProtectedAccountEmail } from "./privileged-accounts";
import { executeAiCall, type AiUsageContext } from "./services/ai-usage";
import { usageFromOpenAI } from "./services/llm-provider/openai/usage";
import { usageFromGemini } from "./services/llm-provider/gemini/usage";
import {
  getAiUsageCapStatus,
  isAiUsageCapExceededError,
  sendAiUsageCapError,
} from "./services/ai-usage/cap";
import {
  createAiJobAdmissionMiddleware,
  ensureAiJobReservation,
  registerAiJobBackgroundWork,
} from "./services/ai-jobs/admission";
import type { AiFeature } from "./services/ai-usage";
import {
  GEMINI_GROUNDED_PROMPT_METER,
  GEMINI_SEARCH_QUERY_METER,
  OPENAI_WEB_SEARCH_METER,
} from "@shared/ai-billing";
import {
  fakeAiSleep,
  fakeBenchmarkSummary,
  fakeBrandResearch,
  fakeCompetitorAnalysis,
  fakeCompetitorList,
  fakeCompetitorLookup,
  fakeConfusionExplanation,
  fakeFixSuggestion,
  fakeGeneratedQuestions,
  fakeVolumeEstimates,
  fakeWeaknessReport,
  isFakeAiEnabled,
  maybeThrowFakeAiError,
} from "./services/fake-ai";

function getUserId(req: Request): string {
  return getLocalUserId(req);
}

function getOwnerIdForBrands(req: Request): string {
  return getLocalAccountOwnerId(req);
}

const aiJobFeatureOverrides: Partial<Record<string, AiFeature>> = {
  "/api/brands/:id/extract-discovered": "competitor_research",
  "/api/brands/:id/scan": "visibility_scan",
  "/api/brands/:id/reports/generate": "report",
  "/api/brands/:id/action-tickets/generate": "ticket_generation",
};

const ensureAiJobAdmission = createAiJobAdmissionMiddleware(
  getOwnerIdForBrands,
  (req) => aiJobFeatureOverrides[req.route.path],
);

function checkBrandOwnership(req: Request, brand: { userId: string }): boolean {
  const ownerId = getOwnerIdForBrands(req);
  return brand.userId === ownerId;
}

interface BrandProfile {
  companyName?: string | null;
  domain: string;
  category?: string | null;
  products?: string | null;
  targetAudience?: string | null;
  problemStatement?: string | null;
}

function generateFallbackTermStrings(brand: BrandProfile): string[] {
  const brandName = brand.companyName || brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
  const category = brand.category || "technology";
  const products = brand.products || "";
  const targetAudience = brand.targetAudience || "";
  const problemStatement = brand.problemStatement || "";

  const terms: string[] = [];

  if (category) {
    terms.push(`best ${category} tools`);
    if (targetAudience) terms.push(`best ${category} for ${targetAudience}`);
  }
  if (brandName) {
    terms.push(`${brandName} reviews`);
    terms.push(`is ${brandName} worth it`);
  }
  if (products) {
    const productList = products.split(",").map(p => p.trim()).filter(Boolean);
    if (productList.length > 0) terms.push(`${productList[0]} alternatives`);
  }
  if (problemStatement && category) terms.push(`how to solve ${category} challenges`);
  if (targetAudience && category) terms.push(`${category} solutions for ${targetAudience}`);
  if (terms.length < 3) {
    terms.push(`${brandName} vs competitors`);
    terms.push(`${brandName} pricing`);
  }

  return [...new Set(terms)].slice(0, 8);
}

async function createFallbackTermsForBrand(
  brandId: number,
  ownerId: string,
  brand: BrandProfile,
  logPrefix: string = "fallback"
): Promise<{ created: any[]; atLimit: boolean }> {
  const termStrings = generateFallbackTermStrings(brand);
  const effectiveLimitsData = await getEffectiveLimits(ownerId);
  const termLimit = effectiveLimitsData.trackedTerms;
  const currentCount = await storage.countActiveTrackedTerms(ownerId);
  const created: any[] = [];

  for (const termText of termStrings) {
    if (termLimit !== null && currentCount + created.length >= termLimit) break;
    try {
      const validated = insertTrackedTermSchema.parse({
        term: termText.trim(),
        userId: ownerId,
        brandId,
      });
      const term = await storage.createTrackedTerm(validated);
      created.push(term);
    } catch (termErr) {
      console.warn(`[${logPrefix}] Failed to create fallback term "${termText}" for brand ${brandId}:`, termErr);
    }
  }

  const atLimit = termLimit !== null && currentCount + created.length >= termLimit;
  return { created, atLimit };
}

const trialDurationSchema = z.coerce
  .number()
  .int()
  .min(MIN_TRIAL_DURATION_DAYS);
const trialPlanSchema = z.enum(TRIAL_PLAN_KEYS);

class ProvisionGuardError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

async function provisionTrialAccount(params: {
  websiteUrl: string;
  email: string;
  adminUserId: string;
  trialDurationDays: number;
  trialPlan: TrialPlan;
}): Promise<{ accountId: number; inviteToken: string }> {
  const normalizedEmail = params.email.toLowerCase().trim();
  const websiteUrl = params.websiteUrl.trim();

  const existingUser = await storage.getUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new ProvisionGuardError("A user with this email already exists");
  }

  const existingProvision = await storage.getProvisionedAccountByEmail(normalizedEmail);
  if (existingProvision && !existingProvision.registeredUserId) {
    throw new ProvisionGuardError("A trial has already been provisioned for this email");
  }

  const crypto = await import("crypto");
  const inviteToken = crypto.randomBytes(32).toString("hex");

  const account = await storage.createProvisionedAccount({
    email: normalizedEmail,
    websiteUrl,
    inviteToken,
    scanStatus: "researching",
    emailSent: false,
    trialDurationDays: params.trialDurationDays,
    trialPlan: params.trialPlan,
    provisionedBy: params.adminUserId,
  });

  runProvisionPipelineAsync(
    account.id,
    websiteUrl,
    normalizedEmail,
    inviteToken,
    params.adminUserId,
    params.trialDurationDays,
    params.trialPlan,
  );

  return { accountId: account.id, inviteToken };
}

function runProvisionPipelineAsync(
  accountId: number,
  websiteUrl: string,
  normalizedEmail: string,
  inviteToken: string,
  adminUserId: string,
  trialDurationDays: number,
  trialPlan: TrialPlan,
): void {
  (async () => {
    try {
      const withProtocol = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
      let normalised: string;
      try {
        const parsed = new URL(withProtocol);
        const hostname = parsed.hostname.toLowerCase();
        normalised = `${parsed.protocol}//${hostname}${parsed.pathname}`.replace(/\/$/, "") || `${parsed.protocol}//${hostname}`;
      } catch {
        normalised = withProtocol;
      }

      console.log(`[Provision] Starting brand research for ${normalised} (account ${accountId})`);

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const researchPrompt = `You are a brand research analyst. Use Google Search to thoroughly research the website at ${normalised}. Visit the home page, product/service pages, about page, and pricing page to build a complete picture of what this company does, what it sells, and who it serves.

Based on your LIVE research of ${normalised}, return a JSON response with this structure (no markdown, no code fences, just raw JSON):
{
  "brandName": "...",
  "category": "...",
  "problemStatement": "...",
  "targetAudience": "...",
  "brandPositioning": "...",
  "products": "...",
  "differentiators": "...",
  "brandTone": "...",
  "suggestedTerms": ["...", "...", "..."]
}

Rules:
- You MUST use Google Search to find current, live information about this website.
- Research multiple pages on the site, not just the home page.
- Every field is REQUIRED. If you genuinely cannot determine a field, set its value to null.
- Return ONLY valid JSON. No markdown, no code fences.`;

      let researchResponse: { text?: string | null };
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("provision brand research");
        researchResponse = { text: JSON.stringify(fakeBrandResearch(normalised)) };
      } else {
        const { callGeminiWithRetry: callGeminiWithRetryProv } = await import("./services/gemini-retry");
        researchResponse = await callGeminiWithRetryProv(client, {
          model: "gemini-3.1-pro-preview",
          contents: researchPrompt,
          config: { tools: [{ googleSearch: {} }] },
          label: "provision-brand-research",
          usage: { userId: adminUserId, brandId: null, feature: "provisioning_research" },
        });
      }

      const researchText = researchResponse.text?.trim() || "";
      let brandProfile: any = {};
      try {
        const cleaned = researchText.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
        brandProfile = JSON.parse(cleaned);
      } catch {
        console.error(`[Provision] Failed to parse research for account ${accountId}`);
        await storage.updateProvisionedAccount(accountId, { scanStatus: "failed" });
        return;
      }

      const brandName = brandProfile.brandName || normalised;
      await storage.updateProvisionedAccount(accountId, { brandName, scanStatus: "finding_competitors" });

      console.log(`[Provision] Researching competitors for ${brandName} (account ${accountId})`);

      const competitorPrompt = `You are a competitive intelligence analyst. Use Google Search to find the top 3-5 direct competitors of "${brandName}" (${normalised}) in the ${brandProfile.category || "general"} industry.

Return a JSON array of competitors (no markdown, no code fences, just raw JSON):
[{"name": "Competitor Name", "domain": "competitor.com", "description": "Brief description"}]

Rules:
- You MUST use Google Search to identify real, current competitors.
- Only include direct competitors — companies selling similar products/services.
- Return ONLY valid JSON. No markdown, no code fences.`;

      let competitorResponse: { text?: string | null };
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("provision competitor research");
        competitorResponse = { text: JSON.stringify(fakeCompetitorList(brandName)) };
      } else {
        const { callGeminiWithRetry: callGeminiWithRetryProvComp } = await import("./services/gemini-retry");
        competitorResponse = await callGeminiWithRetryProvComp(client, {
          model: "gemini-3.1-pro-preview",
          contents: competitorPrompt,
          config: { tools: [{ googleSearch: {} }] },
          label: "provision-competitor-research",
          usage: { userId: adminUserId, brandId: null, feature: "provisioning_research" },
        });
      }

      const compText = competitorResponse.text?.trim() || "";
      let competitors: string[] = [];
      try {
        const cleaned = compText.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          competitors = parsed.map((c: any) => c.domain || c.name).filter(Boolean).slice(0, 5);
        }
      } catch {
        console.warn(`[Provision] Could not parse competitors for account ${accountId}`);
      }

      await storage.updateProvisionedAccount(accountId, { scanStatus: "creating_brand" });

      const brand = await storage.createBrand({
        userId: adminUserId,
        domain: normalised,
        companyName: brandName,
        competitors,
        category: brandProfile.category || null,
        problemStatement: brandProfile.problemStatement || null,
        targetAudience: brandProfile.targetAudience || null,
        brandPositioning: brandProfile.brandPositioning || null,
        products: brandProfile.products || null,
        differentiators: brandProfile.differentiators || null,
        brandTone: brandProfile.brandTone || null,
        scanStatus: "idle",
      });

      await storage.updateProvisionedAccount(accountId, { brandId: brand.id, scanStatus: "generating_terms" });

      console.log(`[Provision] Generating terms & questions for brand ${brand.id} (account ${accountId})`);

      const suggestedTerms: string[] = Array.isArray(brandProfile.suggestedTerms) ? brandProfile.suggestedTerms : [];
      const fallbackTerms = suggestedTerms.length > 0 ? suggestedTerms : [
        `best ${brandProfile.category || "software"} tools`,
        `${brandName} reviews`,
        `${brandName} alternatives`,
        `${brandProfile.category || "software"} comparison`,
      ];

      const createdTermIds: number[] = [];
      for (const termText of fallbackTerms.slice(0, 8)) {
        const term = await storage.createTrackedTerm({
          brandId: brand.id,
          userId: adminUserId,
          term: termText,
          category: brandProfile.category || null,
          isActive: true,
        });
        createdTermIds.push(term.id);
      }

      if (createdTermIds.length > 0) {
        try {
          for (const termId of createdTermIds) {
            const term = await storage.getTrackedTermsByBrand(brand.id).then((ts) => ts.find((t) => t.id === termId));
            if (!term) continue;
            const generated = await generateAllQuestions(term.term, brand, getPlanConfig(trialPlan).limits.questionsPerTerm, {
              userId: adminUserId,
              brandId: brand.id,
              feature: "question_generation",
              source: "system",
            });
            for (const q of generated.userQuestions) {
              await storage.createUserQuestion({
                trackedTermId: termId,
                userId: adminUserId,
                question: q.question,
                questionType: q.questionType,
                questionCategory: "user_question",
              });
            }
            for (const q of generated.brandSentiment) {
              await storage.createUserQuestion({
                trackedTermId: termId,
                userId: adminUserId,
                question: q.question,
                questionType: q.questionType,
                questionCategory: "brand_sentiment",
              });
            }
          }
        } catch (err) {
          console.warn(`[Provision] Question generation failed for account ${accountId}:`, err);
        }
      }

      await storage.updateProvisionedAccount(accountId, { scanStatus: "scanning" });
      await storage.updateBrand(brand.id, { scanStatus: "running" });

      console.log(`[Provision] Running full scan for brand ${brand.id} (account ${accountId})`);

      let scanSucceeded = false;
      try {
        const mod = await import("./assessment-engine");
        await mod.assessmentEngine.runFullScan(brand.id, "system");
        scanSucceeded = true;
      } catch (err) {
        console.error(`[Provision] Scan failed for brand ${brand.id}:`, err);
        await storage.updateBrand(brand.id, { scanStatus: "idle" });
      }

      if (!scanSucceeded) {
        await storage.updateProvisionedAccount(accountId, { scanStatus: "failed" });
        console.error(`[Provision] Pipeline stopped for account ${accountId} — scan failed, invite not sent`);
        return;
      }

      await storage.updateProvisionedAccount(accountId, { scanStatus: "completed" });

      console.log(`[Provision] Sending invite email to ${normalizedEmail} for account ${accountId}`);

      const { sendTrialInviteEmail, getBaseUrl } = await import("./services/email-service");
      const baseUrl = getBaseUrl();
      const signupUrl = `${baseUrl}/signup?token=${inviteToken}`;

      await sendTrialInviteEmail({
        to: normalizedEmail,
        brandName,
        signupUrl,
        trialDurationDays,
      });

      await storage.updateProvisionedAccount(accountId, {
        emailSent: true,
        emailSentAt: new Date(),
      });

      console.log(`[Provision] Completed provisioning for account ${accountId} (${normalizedEmail})`);
    } catch (err) {
      console.error(`[Provision] Pipeline failed for account ${accountId}:`, err);
      await storage.updateProvisionedAccount(accountId, { scanStatus: "failed" }).catch(() => {});
    }
  })();
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return !!user && hasSuperAdminAccess(user);
}

function isUserInTrial(sub: any): boolean {
  if (!sub?.trialEndsAt || sub.manualBilling) return false;
  return new Date() < new Date(sub.trialEndsAt);
}

async function userHasComplimentaryAccess(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  return !!user && hasComplimentaryAccess(user);
}

async function getEffectiveLimits(ownerId: string) {
  const sub = await storage.getSubscriptionByUserId(ownerId);
  const complimentaryAccess = await userHasComplimentaryAccess(ownerId);

  if (complimentaryAccess) {
    const enterpriseConfig = getPlanConfig("enterprise");
    return {
      sub,
      planConfig: enterpriseConfig,
      brands: null,
      competitors: null,
      trackedTerms: null,
    };
  }

  const planConfig = getPlanConfig(sub?.plan ?? "starter");
  const activeAddons = sub ? await storage.getAddonsBySubscriptionId(sub.id) : [];
  let extraBrands = 0;
  let extraCompetitors = 0;
  let extraTerms = 0;
  let extraPrompts = 0;
  let extraUsers = 0;
  let extraAudits = 0;
  let extraAlerts = 0;
  let extraPdfReports = 0;
  let extraWeeklyRefreshes = 0;
  for (const addon of activeAddons) {
    if (addon.status !== "active") continue;
    const cfg = getAddonConfig(addon.addonType);
    if (cfg) {
      const q = addon.quantity;
      extraBrands += (cfg.grantsExtra.brands ?? 0) * q;
      extraCompetitors += (cfg.grantsExtra.competitors ?? 0) * q;
      extraTerms += (cfg.grantsExtra.trackedTerms ?? 0) * q;
      extraPrompts += (cfg.grantsExtra.promptsLimit ?? 0) * q;
      extraUsers += (cfg.grantsExtra.usersLimit ?? 0) * q;
      extraAudits += (cfg.grantsExtra.auditsPerMonth ?? 0) * q;
      extraAlerts += (cfg.grantsExtra.alertsPerMonth ?? 0) * q;
      extraPdfReports += (cfg.grantsExtra.pdfReportsPerPeriod ?? 0) * q;
      extraWeeklyRefreshes += (cfg.grantsExtra.extraWeeklyRefreshes ?? 0) * q;
    }
  }

  // Translate plan cadence into a numeric refreshes/week so add-on bumps can
  // stack on top in a meaningful way. Legacy "monthly" cadence is treated as
  // 0.25 refreshes/week and rounded to 1 floor.
  const baseRefreshesPerWeek =
    planConfig.limits.dataRefreshCadence === "daily" ? 7 :
    planConfig.limits.dataRefreshCadence === "weekly" ? 1 : 0;
  const effectiveRefreshesPerWeek = baseRefreshesPerWeek + extraWeeklyRefreshes;

  const inTrial = isUserInTrial(sub);
  const competitorLimit = getTrialCompetitorLimit({
    plan: sub?.plan ?? "starter",
    isInTrial: inTrial,
    baseLimit: planConfig.limits.competitors,
    extraCompetitors,
  });

  const userBrands = await storage.getBrandsByUser(ownerId);
  const brandCount = Math.max(userBrands.length, 1);
  const baseTermAllowance = planConfig.limits.trackedTerms;
  const totalTrackedTerms = baseTermAllowance !== null
    ? (baseTermAllowance * brandCount) + extraTerms
    : null;

  return {
    sub,
    planConfig,
    brands: planConfig.limits.brands !== null ? planConfig.limits.brands + extraBrands : null,
    competitors: competitorLimit,
    trackedTerms: totalTrackedTerms,
    prompts: planConfig.limits.promptsLimit !== null ? planConfig.limits.promptsLimit + extraPrompts : null,
    users: planConfig.limits.usersLimit !== null ? planConfig.limits.usersLimit + extraUsers : null,
    audits: planConfig.limits.auditsPerMonth !== null ? planConfig.limits.auditsPerMonth + extraAudits : null,
    alerts: planConfig.limits.alertsPerMonth !== null ? planConfig.limits.alertsPerMonth + extraAlerts : null,
    pdfReports: planConfig.limits.pdfReportsPerPeriod !== null ? planConfig.limits.pdfReportsPerPeriod + extraPdfReports : null,
    dataRefreshCadence: planConfig.limits.dataRefreshCadence,
    refreshesPerWeek: effectiveRefreshesPerWeek,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupLocalAuth(app);
  await seedAllData();

  // Stripe webhook (signature is verified using captured req.rawBody)
  app.post("/api/stripe/webhook", handleStripeWebhook);
  registerStripeRoutes(app);

  // Keep authentication and upgrade paths available, but do not rely on the
  // client redirect as the only enforcement for expired provisioned trials.
  app.use("/api", async (req, res, next) => {
    if (
      req.path.startsWith("/auth/") ||
      req.path.startsWith("/billing/") ||
      !req.isAuthenticated() ||
      !req.user
    ) {
      return next();
    }

    try {
      const user = await storage.getUser(req.user.id);
      if (!user || hasSuperAdminAccess(user)) return next();

      const teamMember = await storage.getTeamMemberByUserId(user.id);
      const ownerId = teamMember?.accountOwnerId ?? user.id;
      const owner = ownerId === user.id ? user : await storage.getUser(ownerId);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      const hasActiveTrial = !!sub?.trialEndsAt && new Date() < new Date(sub.trialEndsAt);
      if (
        !sub?.trialEndsAt ||
        sub.manualBilling ||
        hasActiveTrial
      ) {
        if (
          sub?.stripeSubscriptionId &&
          !["active", "past_due"].includes(sub.status) &&
          !hasActiveTrial
        ) {
          return res.status(403).json({
            message: "Your paid subscription is not active. Complete checkout or choose a plan to continue.",
            code: "SUBSCRIPTION_INACTIVE",
          });
        }
        return next();
      }

      return res.status(403).json({
        message: "Your free trial has ended. Choose a plan to continue.",
        code: "TRIAL_EXPIRED",
        trialEnd: new Date(sub.trialEndsAt).toISOString(),
      });
    } catch (error) {
      console.error("Trial access check failed:", error);
      return res.status(500).json({ message: "Authorization check failed" });
    }
  });

  // ============= AUTH ROUTES =============
  app.get('/api/auth/user', isAuthenticated, async (req: Request, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post('/api/onboarding/welcome-video/seen', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.updateUser(userId, { seenWelcomeVideo: true });
      res.json({ seenWelcomeVideo: user.seenWelcomeVideo });
    } catch (error) {
      console.error("Error marking welcome video as seen:", error);
      res.status(500).json({ message: "Failed to mark welcome video as seen" });
    }
  });

  app.patch('/api/auth/onboarding-progress', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { step, data } = req.body;
      if (!step || typeof step !== "string") {
        return res.status(400).json({ message: "step is required" });
      }
      const user = await storage.updateUser(userId, {
        onboardingStep: step,
        onboardingData: data ?? null,
      });
      res.json({ onboardingStep: user.onboardingStep, onboardingData: user.onboardingData });
    } catch (error) {
      console.error("Error saving onboarding progress:", error);
      res.status(500).json({ message: "Failed to save onboarding progress" });
    }
  });

  app.delete('/api/auth/onboarding-progress', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateUser(userId, {
        onboardingStep: null,
        onboardingData: null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing onboarding progress:", error);
      res.status(500).json({ message: "Failed to clear onboarding progress" });
    }
  });

  // ============= ADMIN ROUTES =============
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch('/api/admin/users/:userId/role', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!['admin', 'manager', 'viewer'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      await storage.updateUserRole(userId, role);
      res.json({ message: "Role updated successfully" });
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.post('/api/admin/deactivate-account', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });
      const allUsers = await storage.getAllUsers();
      const target = allUsers.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
      if (!target) return res.status(404).json({ message: "User not found" });
      const targetBrands = await storage.getBrandsByUser(target.id);
      let pausedTerms = 0;
      for (const brand of targetBrands) {
        const terms = await storage.getTrackedTermsByBrand(brand.id);
        for (const term of terms) {
          if (term.isActive) {
            await storage.updateTrackedTerm(term.id, { isActive: false });
            pausedTerms++;
          }
        }
      }
      const sub = await storage.getSubscriptionByUserId(target.id);
      if (sub && sub.status === 'active') {
        await storage.updateSubscription(sub.id, { status: 'cancelled' });
      }
      await storage.updateUser(target.id, { isActive: false });
      res.json({ message: `Deactivated ${email}: paused ${pausedTerms} terms, cancelled subscription`, userId: target.id });
    } catch (error) {
      console.error("Error deactivating account:", error);
      res.status(500).json({ message: "Failed to deactivate account" });
    }
  });

  // ============= SUPER ADMIN ROUTES =============
  app.get('/api/auth/super-admin-status', isAuthenticated, async (req, res) => {
    try {
      const superAdmin = await isSuperAdmin(getUserId(req));
      const viewingAs = req.session?.superAdminViewingAs || null;
      let viewingAccount = null;
      if (superAdmin && viewingAs && viewingAs !== getUserId(req)) {
        const viewingUser = await storage.getUser(viewingAs);
        if (viewingUser) {
          viewingAccount = {
            userId: viewingUser.id,
            name: [viewingUser.firstName, viewingUser.lastName].filter(Boolean).join(" ") || viewingUser.email,
            email: viewingUser.email,
          };
        }
      }
      res.json({ isSuperAdmin: superAdmin, viewingAccount });
    } catch (error) {
      res.status(500).json({ message: "Failed to check super admin status" });
    }
  });

  app.get('/api/super-admin/accounts', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const allUsers = await storage.getAllUsers();
      const accounts = [];
      for (const u of allUsers) {
        const userBrands = await storage.getBrandsByUser(u.id);
        const sub = await storage.getSubscriptionByUserId(u.id);
        accounts.push({
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          isActive: u.isActive,
          plan: sub?.plan || "none",
          planDisplayName: sub ? getPlanConfig(sub.plan).displayName : "None",
          isProtectedAccount: isProtectedAccountEmail(u.email),
          brands: userBrands.map(b => ({
            id: b.id,
            domain: b.domain,
            companyName: b.companyName,
            scanStatus: b.scanStatus,
          })),
        });
      }
      res.json({ accounts });
    } catch (error) {
      console.error("Error fetching super admin accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  app.post('/api/super-admin/switch-account', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { accountOwnerId } = req.body;
      if (!accountOwnerId) {
        return res.status(400).json({ message: "accountOwnerId required" });
      }
      const targetUser = await storage.getUser(accountOwnerId);
      if (!targetUser) {
        return res.status(404).json({ message: "Account not found" });
      }
      req.session.superAdminViewingAs = accountOwnerId;
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.json({
          message: "Switched to account",
          viewingAccount: {
            userId: targetUser.id,
            name: [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" ") || targetUser.email,
            email: targetUser.email,
          },
        });
      });
    } catch (error) {
      console.error("Error switching account:", error);
      res.status(500).json({ message: "Failed to switch account" });
    }
  });

  app.post('/api/super-admin/exit-account', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      delete req.session.superAdminViewingAs;
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.json({ message: "Returned to own account" });
      });
    } catch (error) {
      console.error("Error exiting account:", error);
      res.status(500).json({ message: "Failed to exit account" });
    }
  });

  app.post('/api/super-admin/deactivate-account', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { accountOwnerId } = req.body;
      if (!accountOwnerId) {
        return res.status(400).json({ message: "accountOwnerId required" });
      }
      const target = await storage.getUser(accountOwnerId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (isProtectedAccountEmail(target.email)) {
        return res.status(400).json({ message: "Cannot deactivate a protected account" });
      }
      const targetBrands = await storage.getBrandsByUser(target.id);
      let pausedTerms = 0;
      for (const brand of targetBrands) {
        const terms = await storage.getTrackedTermsByBrand(brand.id);
        for (const term of terms) {
          if (term.isActive) {
            await storage.updateTrackedTerm(term.id, { isActive: false });
            pausedTerms++;
          }
        }
      }
      const sub = await storage.getSubscriptionByUserId(target.id);
      if (sub && sub.status === 'active') {
        await storage.updateSubscription(sub.id, { status: 'cancelled' });
      }
      await storage.updateUser(target.id, { isActive: false });
      res.json({ message: `Deactivated ${target.email}: paused ${pausedTerms} terms, cancelled subscription`, userId: target.id });
    } catch (error) {
      console.error("Error deactivating account:", error);
      res.status(500).json({ message: "Failed to deactivate account" });
    }
  });

  app.get('/api/super-admin/account-management', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { getAiUsageCutoverAt, getUsdToGbpRate } = await import('./services/system-config');
      const aiUsageCutoverAt = await getAiUsageCutoverAt();
      const usdGbpRate = await getUsdToGbpRate();
      const allUsers = await storage.getAllUsers();
      const accounts = [];
      for (const u of allUsers) {
        const teamMembership = await storage.getTeamMemberByUserId(u.id);
        const userBrands = await storage.getBrandsByUser(u.id);
        const sub = await storage.getSubscriptionByUserId(u.id);
        if (teamMembership && userBrands.length === 0 && !sub) {
          continue;
        }
        const members = await storage.getTeamMembersByOwner(u.id);
        const memberDetails = [];
        for (const m of members) {
          const memberUser = await storage.getUser(m.userId);
          if (memberUser) {
            memberDetails.push({
              id: m.id,
              userId: m.userId,
              email: memberUser.email,
              firstName: memberUser.firstName,
              lastName: memberUser.lastName,
              isActive: memberUser.isActive,
              permissions: m.permissions,
            });
          }
        }

        // Measured usage (post-cutover): real token counts from ai_usage_logs,
        // grouped per provider for the per-account cost cell.
        let llmCosts: { modelId: string; runs: number; estimatedCost: number }[] = [];
        let measuredCost = 0;
        const usageSummary = await storage.getAiUsageSummaryByUser(u.id);
        for (const row of usageSummary) {
          const costUsd = row.costMicroUsd / 1_000_000;
          measuredCost += costUsd;
          const existing = llmCosts.find(c => c.modelId === row.provider);
          if (existing) {
            existing.runs += row.calls;
            existing.estimatedCost += costUsd;
          } else {
            llmCosts.push({ modelId: row.provider, runs: row.calls, estimatedCost: costUsd });
          }
        }

        // Legacy estimate (pre-cutover only, frozen slice): chars/4 over
        // historical visibility_runs — the pre-instrumentation approximation.
        // Post-cutover runs are excluded here because they're measured above;
        // including them would double count.
        let legacyEstimatedCost = 0;
        for (const brand of userBrands) {
          const modelStats = await storage.getVisibilityRunCountsByModel(brand.id, aiUsageCutoverAt);
          for (const stat of modelStats) {
            const estimatedInputTokens = Math.ceil(stat.totalPromptChars / 4);
            const estimatedOutputTokens = Math.ceil(stat.totalResponseChars / 4);
            let costPerInputToken = 0;
            let costPerOutputToken = 0;
            if (stat.modelId === 'openai') {
              costPerInputToken = 0.15 / 1_000_000;
              costPerOutputToken = 0.60 / 1_000_000;
            } else if (stat.modelId === 'anthropic') {
              costPerInputToken = 1.00 / 1_000_000;
              costPerOutputToken = 5.00 / 1_000_000;
            } else if (stat.modelId === 'gemini') {
              costPerInputToken = 0.15 / 1_000_000;
              costPerOutputToken = 0.60 / 1_000_000;
            }
            legacyEstimatedCost += (estimatedInputTokens * costPerInputToken) + (estimatedOutputTokens * costPerOutputToken);
          }
        }

        accounts.push({
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          isActive: u.isActive,
          plan: sub?.plan || "none",
          planDisplayName: sub ? getPlanConfig(sub.plan).displayName : "None",
          subscriptionStatus: sub?.status || "none",
          brandsCount: userBrands.length,
          brands: userBrands.map((brand) => ({
            id: brand.id,
            name: brand.companyName || brand.domain,
          })),
          teamMembersCount: members.length,
          teamMembers: memberDetails,
          llmCosts,
          legacyEstimatedCost,
          measuredCost,
          totalLlmCost: legacyEstimatedCost + measuredCost,
          isProtectedAccount: isProtectedAccountEmail(u.email),
          accountType: u.accountType || "standard",
          manualBilling: !!sub?.manualBilling,
          trialStartedAt: sub?.trialStartedAt ?? null,
          trialEndsAt: sub?.trialEndsAt ?? null,
        });
      }
      const totalLegacy = accounts.reduce((s, a) => s + a.legacyEstimatedCost, 0);
      const totalMeasured = accounts.reduce((s, a) => s + a.measuredCost, 0);
      console.log(
        `[ai-usage] account-management cost breakdown: legacy est. $${totalLegacy.toFixed(2)} (pre-cutover) + measured $${totalMeasured.toFixed(2)} = $${(totalLegacy + totalMeasured).toFixed(2)} across ${accounts.length} accounts`,
      );
      res.json({ accounts, usdGbpRate });
    } catch (error) {
      console.error("Error fetching account management data:", error);
      res.status(500).json({ message: "Failed to fetch account management data" });
    }
  });

  // AI usage slicing: per-account / per-brand / per-feature / per-model
  // aggregates over measured ai_usage_logs. Costs returned in USD.
  app.get('/api/super-admin/ai-usage', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const groupBy = String(req.query.groupBy || "feature");
      if (!["feature", "brand", "model"].includes(groupBy)) {
        return res.status(400).json({ message: "groupBy must be one of: feature, brand, model" });
      }
      const { getUsdToGbpRate } = await import('./services/system-config');
      const rows = await storage.getAiUsageBreakdown({
        userId: req.query.userId ? String(req.query.userId) : undefined,
        brandId: req.query.brandId ? parseInt(String(req.query.brandId)) : undefined,
        feature: req.query.feature ? String(req.query.feature) : undefined,
        since: req.query.since ? new Date(String(req.query.since)) : undefined,
        until: req.query.until ? new Date(String(req.query.until)) : undefined,
        groupBy: groupBy as "feature" | "brand" | "model",
      });
      res.json({
        groupBy,
        usdGbpRate: await getUsdToGbpRate(),
        rows: rows.map((r) => ({ ...r, costUsd: r.costMicroUsd / 1_000_000 })),
      });
    } catch (error) {
      console.error("Error fetching AI usage breakdown:", error);
      res.status(500).json({ message: "Failed to fetch AI usage breakdown" });
    }
  });

  // Dynamic system config: readable + live-editable by super admins. One
  // generic update endpoint for every key — the registry supplies each key's
  // validation schema, so new config types need zero new endpoints.
  app.get('/api/super-admin/system-config', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { getAllConfigEntries } = await import('./services/system-config');
      res.json({ entries: getAllConfigEntries() });
    } catch (error) {
      console.error("Error fetching system config:", error);
      res.status(500).json({ message: "Failed to fetch system config" });
    }
  });

  app.put('/api/super-admin/system-config/:key', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { updateConfigValue, UnknownConfigKeyError } = await import('./services/system-config');
      try {
        const entry = await updateConfigValue(req.params.key, req.body?.value);
        console.log(`[system-config] '${req.params.key}' updated live by super admin ${getUserId(req)}`);
        res.json({ entry });
      } catch (err: any) {
        if (err instanceof UnknownConfigKeyError) {
          return res.status(404).json({ message: err.message });
        }
        if (err?.name === "ZodError") {
          return res.status(400).json({ message: "Value failed validation for this config key", issues: err.issues });
        }
        throw err;
      }
    } catch (error) {
      console.error("Error updating system config:", error);
      res.status(500).json({ message: "Failed to update system config" });
    }
  });

  app.get('/api/ai-usage/status', isAuthenticated, async (req, res) => {
    try {
      res.json(await getAiUsageCapStatus(getOwnerIdForBrands(req)));
    } catch (error) {
      console.error("Error fetching AI usage cap status:", error);
      res.status(500).json({ message: "Failed to fetch AI usage status" });
    }
  });

  // Flag (or unflag) an account for manual / off-Stripe billing. When enabled,
  // the account is granted a complimentary subscription on the chosen plan
  // (no Stripe charges, no trial expiry) and the in-app billing UI is hidden.
  app.post('/api/super-admin/set-manual-billing', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { accountOwnerId, enabled, plan } = req.body as {
        accountOwnerId?: string;
        enabled?: boolean;
        plan?: string;
      };
      if (!accountOwnerId || typeof enabled !== "boolean") {
        return res.status(400).json({ message: "accountOwnerId and enabled are required" });
      }

      const target = await storage.getUser(accountOwnerId);
      if (!target) return res.status(404).json({ message: "User not found" });

      if (isProtectedAccountEmail(target.email)) {
        return res.status(400).json({ message: "Cannot modify a protected account" });
      }

      if (enabled) {
        const allowedPlans = ["starter_v2", "growth_v2", "accelerate", "enterprise"] as const;
        const selectedPlan = (plan && (allowedPlans as readonly string[]).includes(plan)
          ? plan
          : "growth_v2") as typeof allowedPlans[number];
        await grantComplimentaryEnterprise(accountOwnerId, selectedPlan, "annual");
        const sub = await storage.getSubscriptionByUserId(accountOwnerId);
        if (sub) {
          await storage.updateSubscription(sub.id, {
            manualBilling: true,
            status: "active",
            plan: selectedPlan,
            trialStartedAt: null,
            trialEndsAt: null,
            trialUpdatedAt: null,
            trialUpdatedBy: null,
          });
        }
        if (target.accountType === "admin_provisioned") {
          await storage.updateUser(target.id, { accountType: "standard" });
        }
        return res.json({ message: `${target.email} is now billed manually on the ${selectedPlan} plan`, manualBilling: true, plan: selectedPlan });
      }

      const sub = await storage.getSubscriptionByUserId(accountOwnerId);
      if (sub) {
        // Drop the complimentary grant and put the account into an explicit
        // expired-trial state so the existing gating forces plan selection.
        const now = new Date();
        const expiredTrialStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        await storage.updateSubscription(sub.id, {
          manualBilling: false,
          status: "active",
          trialStartedAt: expiredTrialStart,
          trialEndsAt: expiredTrialStart,
          trialUpdatedAt: now,
          trialUpdatedBy: getUserId(req),
          billingPeriodEnd: now,
        });
      }
      return res.json({ message: `Manual billing disabled for ${target.email} — they must now choose a paid plan`, manualBilling: false });
    } catch (error) {
      console.error("Error setting manual billing:", error);
      res.status(500).json({ message: "Failed to update manual billing" });
    }
  });

  app.post('/api/super-admin/reactivate-account', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { accountOwnerId } = req.body;
      if (!accountOwnerId) {
        return res.status(400).json({ message: "accountOwnerId required" });
      }
      const target = await storage.getUser(accountOwnerId);
      if (!target) return res.status(404).json({ message: "User not found" });

      if (isProtectedAccountEmail(target.email)) {
        return res.status(400).json({ message: "Cannot modify a protected account" });
      }

      await storage.updateUser(target.id, { isActive: true });

      const targetBrands = await storage.getBrandsByUser(target.id);
      let reactivatedTerms = 0;
      for (const brand of targetBrands) {
        const terms = await storage.getTrackedTermsByBrand(brand.id);
        for (const term of terms) {
          if (!term.isActive) {
            await storage.updateTrackedTerm(term.id, { isActive: true });
            reactivatedTerms++;
          }
        }
      }

      const sub = await storage.getSubscriptionByUserId(target.id);
      if (sub && sub.status === 'cancelled') {
        await storage.updateSubscription(sub.id, { status: 'active' });
      }

      res.json({ message: `Reactivated ${target.email}: reactivated ${reactivatedTerms} terms and subscription`, userId: target.id });
    } catch (error) {
      console.error("Error reactivating account:", error);
      res.status(500).json({ message: "Failed to reactivate account" });
    }
  });

  app.delete('/api/super-admin/delete-account/:userId', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { userId } = req.params;
      const { confirmEmail } = req.body;
      const target = await storage.getUser(userId);
      if (!target) return res.status(404).json({ message: "User not found" });

      if (isProtectedAccountEmail(target.email)) {
        return res.status(400).json({ message: "Cannot delete a protected account" });
      }

      if (!confirmEmail || confirmEmail.toLowerCase() !== (target.email || "").toLowerCase()) {
        return res.status(400).json({ message: "Email confirmation does not match" });
      }

      const teamMembership = await storage.getTeamMemberByUserId(userId);
      const targetBrands = await storage.getBrandsByUser(target.id);
      const targetSub = await storage.getSubscriptionByUserId(target.id);
      if (teamMembership && targetBrands.length === 0 && !targetSub) {
        return res.status(400).json({ message: "Cannot delete a team member user. Use user deactivation instead." });
      }
      for (const brand of targetBrands) {
        await storage.deleteVisibilityRunsByBrand(brand.id);
        const terms = await storage.getTrackedTermsByBrand(brand.id);
        for (const term of terms) {
          await storage.deleteUserQuestionsByTerm(term.id);
          await storage.deleteTrackedTerm(term.id);
        }
        await storage.deleteBrand(brand.id);
      }

      await storage.deleteTeamMembersByOwner(target.id);
      await storage.deleteTeamInvitationsByOwner(target.id);
      await storage.deleteSubscriptionByUserId(target.id);
      await storage.deleteUser(target.id);

      res.json({ message: `Permanently deleted account: ${target.email}` });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.post('/api/super-admin/toggle-user-active', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { userId, isActive } = req.body;
      if (!userId || typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "userId and isActive (boolean) required" });
      }
      const target = await storage.getUser(userId);
      if (!target) return res.status(404).json({ message: "User not found" });

      if (isProtectedAccountEmail(target.email)) {
        return res.status(400).json({ message: "Cannot modify a protected account" });
      }

      await storage.updateUser(userId, { isActive });
      res.json({ message: `User ${target.email} ${isActive ? 'activated' : 'deactivated'}`, userId: target.id });
    } catch (error) {
      console.error("Error toggling user active status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  app.patch('/api/super-admin/accounts/:userId/trial', isAuthenticated, async (req, res) => {
    try {
      const adminUserId = getUserId(req);
      if (!(await isSuperAdmin(adminUserId))) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const target = await storage.getUser(req.params.userId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.accountType !== "admin_provisioned") {
        return res.status(400).json({ message: "Only provisioned trial accounts can be updated" });
      }

      const parsed = z.object({ trialDurationDays: trialDurationSchema }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid trial duration" });
      }

      const sub = await storage.getSubscriptionByUserId(target.id);
      if (!sub?.trialStartedAt) {
        return res.status(400).json({ message: "Account has no active trial entitlement" });
      }
      if (sub.manualBilling || sub.stripeSubscriptionId) {
        return res.status(400).json({ message: "Paid or manually billed accounts cannot have a trial duration" });
      }

      const trialEndsAt = calculateTrialEnd(new Date(sub.trialStartedAt), parsed.data.trialDurationDays);
      const updated = await storage.updateTrialEntitlement({
        userId: target.id,
        trialEndsAt,
        trialDurationDays: parsed.data.trialDurationDays,
        updatedBy: adminUserId,
      });

      res.json({
        message: `${target.email} now has a ${parsed.data.trialDurationDays}-day trial`,
        subscription: updated,
        trialEnd: trialEndsAt.toISOString(),
      });
    } catch (error) {
      console.error("Error updating trial entitlement:", error);
      res.status(500).json({ message: "Failed to update trial entitlement" });
    }
  });

  // ============= PROVISIONED TRIAL ROUTES =============
  app.post('/api/super-admin/provision-trial', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = z.object({
        websiteUrl: z.string().trim().url("Valid website URL is required"),
        email: z.string().trim().email("Valid email is required"),
        trialDurationDays: trialDurationSchema.default(TRIAL_DURATION_DAYS),
        trialPlan: trialPlanSchema.default(DEFAULT_TRIAL_PLAN),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      try {
        const { accountId } = await provisionTrialAccount({
          websiteUrl: parsed.data.websiteUrl,
          email: parsed.data.email,
          trialDurationDays: parsed.data.trialDurationDays,
          trialPlan: parsed.data.trialPlan,
          adminUserId: getUserId(req),
        });
        return res.status(201).json({
          message: "Trial provisioning started",
          provisionedAccountId: accountId,
          trialDurationDays: parsed.data.trialDurationDays,
          trialPlan: parsed.data.trialPlan,
        });
      } catch (err: any) {
        if (err instanceof ProvisionGuardError) {
          return res.status(err.status).json({ message: err.message });
        }
        throw err;
      }
    } catch (error) {
      console.error("Error provisioning trial:", error);
      res.status(500).json({ message: "Failed to provision trial" });
    }
  });

  // ============= PUBLIC TRIAL REQUEST ROUTES =============
  const trialRequestRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 submissions per IP per hour
    message: { message: "Too many trial requests from this IP. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post('/api/trial-requests', trialRequestRateLimiter, async (req, res) => {
    try {
      // Honeypot: bots typically fill every field. Real users won't see this hidden field.
      if (typeof req.body?.companyName === 'string' && req.body.companyName.trim() !== '') {
        console.warn('[TrialRequest] Honeypot triggered, silently accepting');
        return res.status(201).json({ message: "Trial request received" });
      }

      const trialRequestSchema = insertTrialAccountRequestSchema.extend({
        firstName: z.string().trim().min(1, "First name is required").max(100),
        lastName: z.string().trim().min(1, "Last name is required").max(100),
        email: z.string().trim().email("Valid email is required"),
        websiteUrl: z.string().trim().url("Valid website URL is required"),
      });

      const parsed = trialRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const normalizedEmail = parsed.data.email.toLowerCase();
      const websiteUrl = parsed.data.websiteUrl;

      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists. Please sign in instead." });
      }

      const existingPending = await storage.getPendingTrialRequestByEmail(normalizedEmail);
      if (existingPending) {
        return res.status(400).json({ message: "We've already received a trial request for this email. Please check your inbox." });
      }

      const existingProvision = await storage.getProvisionedAccountByEmail(normalizedEmail);
      if (existingProvision && !existingProvision.registeredUserId) {
        return res.status(400).json({ message: "A trial has already been set up for this email. Please check your inbox for an invite." });
      }

      const created = await storage.createTrialAccountRequest({
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName.trim(),
        email: normalizedEmail,
        websiteUrl,
      });

      const { sendTrialRequestReceivedEmail } = await import('./services/email-service');
      sendTrialRequestReceivedEmail({
        to: normalizedEmail,
        firstName: created.firstName,
        websiteUrl,
      }).catch((err) => console.error('[TrialRequest] Email send failed:', err));

      return res.status(201).json({ message: "Trial request received", id: created.id });
    } catch (error) {
      console.error("Error creating trial request:", error);
      res.status(500).json({ message: "Failed to submit trial request" });
    }
  });

  app.get('/api/super-admin/trial-requests', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const requests = await storage.getAllTrialAccountRequests();
      res.json({ requests });
    } catch (error) {
      console.error("Error fetching trial requests:", error);
      res.status(500).json({ message: "Failed to fetch trial requests" });
    }
  });

  app.patch('/api/super-admin/trial-requests/:id', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const editSchema = z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: z.string().trim().email(),
        websiteUrl: z.string().trim().url(),
      });
      const parsed = editSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const existing = await storage.getTrialAccountRequest(id);
      if (!existing) return res.status(404).json({ message: "Trial request not found" });
      if (existing.status !== "pending") {
        return res.status(400).json({ message: "Only pending requests can be edited" });
      }

      const newEmail = parsed.data.email.toLowerCase();
      const existingUser = await storage.getUserByEmail(newEmail);
      if (existingUser) {
        return res.status(400).json({ message: "A user with this email already exists" });
      }
      const existingPending = await storage.getPendingTrialRequestByEmail(newEmail);
      if (existingPending && existingPending.id !== id) {
        return res.status(400).json({ message: "Another pending trial request exists for this email" });
      }
      const existingProvision = await storage.getProvisionedAccountByEmail(newEmail);
      if (existingProvision && !existingProvision.registeredUserId) {
        return res.status(400).json({ message: "A trial has already been provisioned for this email" });
      }

      const updated = await storage.updateTrialAccountRequest(id, {
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName.trim(),
        email: newEmail,
        websiteUrl: parsed.data.websiteUrl,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating trial request:", error);
      res.status(500).json({ message: "Failed to update trial request" });
    }
  });

  app.post('/api/super-admin/trial-requests/:id/accept', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const request = await storage.getTrialAccountRequest(id);
      if (!request) return res.status(404).json({ message: "Trial request not found" });
      if (request.status !== "pending") {
        return res.status(400).json({ message: "Only pending requests can be accepted" });
      }

      const parsedEntitlement = z.object({
        trialDurationDays: trialDurationSchema.default(TRIAL_DURATION_DAYS),
        trialPlan: trialPlanSchema.default(DEFAULT_TRIAL_PLAN),
      }).safeParse(req.body ?? {});
      if (!parsedEntitlement.success) {
        return res.status(400).json({ message: parsedEntitlement.error.errors[0]?.message || "Invalid trial entitlement" });
      }

      try {
        const { accountId } = await provisionTrialAccount({
          websiteUrl: request.websiteUrl,
          email: request.email,
          adminUserId: getUserId(req),
          trialDurationDays: parsedEntitlement.data.trialDurationDays,
          trialPlan: parsedEntitlement.data.trialPlan,
        });
        const updated = await storage.updateTrialAccountRequest(id, {
          status: "accepted",
          reviewedByUserId: getUserId(req),
          reviewedAt: new Date(),
          provisionedAccountId: accountId,
        });
        return res.status(201).json({
          message: "Trial accepted and provisioning started",
          request: updated,
          provisionedAccountId: accountId,
          trialDurationDays: parsedEntitlement.data.trialDurationDays,
          trialPlan: parsedEntitlement.data.trialPlan,
        });
      } catch (err: any) {
        if (err instanceof ProvisionGuardError) {
          return res.status(err.status).json({ message: err.message });
        }
        throw err;
      }
    } catch (error) {
      console.error("Error accepting trial request:", error);
      res.status(500).json({ message: "Failed to accept trial request" });
    }
  });

  app.post('/api/super-admin/trial-requests/:id/decline', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const request = await storage.getTrialAccountRequest(id);
      if (!request) return res.status(404).json({ message: "Trial request not found" });
      if (request.status !== "pending") {
        return res.status(400).json({ message: "Only pending requests can be declined" });
      }

      const updated = await storage.updateTrialAccountRequest(id, {
        status: "declined",
        reviewedByUserId: getUserId(req),
        reviewedAt: new Date(),
      });
      res.json({ request: updated });
    } catch (error) {
      console.error("Error declining trial request:", error);
      res.status(500).json({ message: "Failed to decline trial request" });
    }
  });

  app.delete('/api/super-admin/trial-requests/:id', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      await storage.deleteTrialAccountRequest(id);
      res.json({ message: "Trial request deleted" });
    } catch (error) {
      console.error("Error deleting trial request:", error);
      res.status(500).json({ message: "Failed to delete trial request" });
    }
  });


  app.post('/api/super-admin/resume-provisioning/:id', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const accountId = parseInt(req.params.id, 10);
      if (!Number.isFinite(accountId)) {
        return res.status(400).json({ message: "Invalid account id" });
      }
      const all = await storage.getAllProvisionedAccounts();
      const account = all.find((a) => a.id === accountId);
      if (!account) {
        return res.status(404).json({ message: "Provisioned account not found" });
      }
      if (!account.brandId) {
        return res.status(400).json({ message: "Account has no brand to resume" });
      }
      if (account.emailSent) {
        return res.status(400).json({ message: "Invite email already sent" });
      }

      res.status(202).json({ message: "Resuming provisioning pipeline", accountId });

      (async () => {
        try {
          await storage.updateBrand(account.brandId!, { scanStatus: "idle" });
          await storage.updateProvisionedAccount(account.id, { scanStatus: "scanning" });

          console.log(`[ResumeProvision] Starting scan for brand ${account.brandId} (account ${account.id})`);

          let scanSucceeded = false;
          try {
            const mod = await import('./assessment-engine');
            await mod.assessmentEngine.runFullScan(account.brandId!, "system");
            scanSucceeded = true;
          } catch (err) {
            console.error(`[ResumeProvision] Scan failed for brand ${account.brandId}:`, err);
            await storage.updateBrand(account.brandId!, { scanStatus: 'idle' });
          }

          if (!scanSucceeded) {
            await storage.updateProvisionedAccount(account.id, { scanStatus: 'failed' });
            console.error(`[ResumeProvision] Pipeline stopped for account ${account.id} — invite NOT sent`);
            return;
          }

          await storage.updateProvisionedAccount(account.id, { scanStatus: 'completed' });

          console.log(`[ResumeProvision] Sending invite email to ${account.email}`);
          const { sendTrialInviteEmail, getBaseUrl } = await import('./services/email-service');
          const baseUrl = getBaseUrl();
          const signupUrl = `${baseUrl}/signup?token=${account.inviteToken}`;
          await sendTrialInviteEmail({
            to: account.email,
            brandName: account.brandName || "your brand",
            signupUrl,
            trialDurationDays: account.trialDurationDays,
          });

          await storage.updateProvisionedAccount(account.id, {
            emailSent: true,
            emailSentAt: new Date(),
          });
          console.log(`[ResumeProvision] Done — invite sent to ${account.email}`);
        } catch (err) {
          console.error(`[ResumeProvision] Pipeline failed for account ${account.id}:`, err);
          await storage.updateProvisionedAccount(account.id, { scanStatus: 'failed' }).catch(() => {});
        }
      })();
    } catch (error) {
      console.error("Error resuming provisioning:", error);
      res.status(500).json({ message: "Failed to resume provisioning" });
    }
  });

  app.get('/api/provisioned-accounts', isAuthenticated, async (req, res) => {
    try {
      if (!(await isSuperAdmin(getUserId(req)))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const accounts = await storage.getAllProvisionedAccounts();
      res.json({ accounts });
    } catch (error) {
      console.error("Error fetching provisioned accounts:", error);
      res.status(500).json({ message: "Failed to fetch provisioned accounts" });
    }
  });

  app.get('/api/auth/verify-invite-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const account = await storage.getProvisionedAccountByToken(token);
      if (!account) {
        return res.status(404).json({ message: "Invalid or expired invite token" });
      }
      if (account.registeredUserId) {
        return res.status(400).json({ message: "This invitation has already been used" });
      }
      res.json({
        email: account.email,
        brandName: account.brandName,
        websiteUrl: account.websiteUrl,
        trialDurationDays: account.trialDurationDays,
      });
    } catch (error) {
      console.error("Error verifying invite token:", error);
      res.status(500).json({ message: "Failed to verify token" });
    }
  });

  // ============= BRAND ROUTES =============
  app.get('/api/brands', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const brandList = await storage.getBrandsByUser(ownerId);
      res.json(brandList);
    } catch (error) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ message: "Failed to fetch brands" });
    }
  });

  app.get('/api/brands/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      storage.upsertAiCache(id, "brand_activity", "last_access", { accessedAt: new Date().toISOString() }).catch(() => {});

      res.json(brand);
    } catch (error) {
      console.error("Error fetching brand:", error);
      res.status(500).json({ message: "Failed to fetch brand" });
    }
  });

  app.post('/api/brands/research', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }

      const withProtocol = url.startsWith("http") ? url : `https://${url}`;
      let normalised: string;
      try {
        const parsed = new URL(withProtocol);
        const hostname = parsed.hostname.toLowerCase();
        if (!hostname.includes(".")) {
          return res.status(400).json({ message: "Invalid URL: domain must include a valid TLD (e.g. .com, .co.uk)" });
        }
        normalised = `${parsed.protocol}//${hostname}${parsed.pathname}`.replace(/\/$/, "") || `${parsed.protocol}//${hostname}`;
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const { callGeminiWithRetry, friendlyGeminiError } = await import("./services/gemini-retry");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `You are a brand research analyst. Use Google Search to thoroughly research the website at ${normalised}. Visit the home page, product/service pages, about page, and pricing page to build a complete picture of what this company does, what it sells, and who it serves.

Based on your LIVE research of ${normalised}, return a JSON response with this structure (no markdown, no code fences, just raw JSON):
{
  "brandName": "...",
  "category": "...",
  "problemStatement": "...",
  "targetAudience": "...",
  "brandPositioning": "...",
  "products": "...",
  "differentiators": "...",
  "brandTone": "...",
  "suggestedTerms": ["...", "...", "..."]
}

Field instructions:
- brandName: The company or brand name exactly as it appears on the website. Use the marketing/trading name, not the corporate parent.
- category: The specific industry category this brand operates in. Be precise — use the narrowest accurate category, not a broad umbrella term.
- problemStatement: A 1-2 sentence description of the core problem this brand solves for its customers, based on the website messaging. Write it from the customer's perspective.
- targetAudience: Who the brand serves — be specific about company size, industry, role, or demographics based on what the site says. Not just "businesses" — what kind of businesses?
- brandPositioning: A one-line positioning statement based on how the brand presents itself against alternatives. What makes them the choice over competitors?
- products: The specific product names, service lines, or solution names as listed on the website. Use the actual names the brand uses, comma-separated. If the brand has distinct product tiers or modules, list them.
- differentiators: The specific competitive advantages or unique selling points the brand highlights on the website. Look for claims like "the only", "first to", "fastest", specific numbers, patents, awards, or proprietary technology. Cite what the website actually says.
- brandTone: The overall communication style observed across the website. Must be exactly one of: professional, casual, technical, friendly, authoritative.
- suggestedTerms: 5-8 search queries a real person would type into an AI assistant when looking for the type of solution this brand provides. Use the actual brand name, product names, and category from your research — never use bracket placeholders.

Rules:
- You MUST use Google Search to find current, live information about this website. Do not rely on training data alone.
- Research multiple pages on the site, not just the home page.
- For suggestedTerms: every term must use the real brand name, real product names, or real category you discovered. Never output placeholder brackets like [category] or [brand]. Mix brand-specific queries (e.g. "is Acme good for X") with generic category queries (e.g. "best X tools for Y").
- For products: list specific product or service names from the website, not generic descriptions of what they do.
- For differentiators: quote or closely paraphrase specific claims from the website copy. Vague statements like "easy to use" are not differentiators unless the site backs them up with specifics.
- Do NOT include competitors — they will be researched separately.
- Every field is REQUIRED. If you genuinely cannot determine a field from your research, set its value to null — do NOT fabricate information.
- Return ONLY valid JSON. No markdown, no explanation text, no code fences.`;

      let brandResearchResponse: { text?: string | null };
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("brand research");
        brandResearchResponse = { text: JSON.stringify(fakeBrandResearch(normalised)) };
      } else {
        const response = await callGeminiWithRetry(client, {
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
          label: "brand-research",
          usage: { userId: getOwnerIdForBrands(req), brandId: null, feature: "brand_research" },
        });
        brandResearchResponse = response;
      }

      const text = brandResearchResponse.text?.trim() || "";
      if (!text) {
        console.error("Gemini returned empty response for brand research");
        return res.status(503).json({ message: "AI returned an empty response. Please try again in a moment." });
      }

      let parsed;
      try {
        const cleaned = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini research response:", text);
        return res.status(502).json({ message: "AI returned unparseable data. Please try again." });
      }

      if (!parsed.brandName) {
        console.error("Gemini could not identify brand name from:", normalised);
        return res.status(422).json({
          message: "Could not identify a brand from that URL. Please check the address points to your main website.",
        });
      }

      const result: Record<string, any> = {
        brandName: parsed.brandName,
        domain: normalised,
      };

      const fields = ["category", "problemStatement", "targetAudience", "brandPositioning", "products", "differentiators", "brandTone"] as const;
      for (const f of fields) {
        result[f] = parsed[f] ?? null;
      }

      result.suggestedTerms = Array.isArray(parsed.suggestedTerms) ? parsed.suggestedTerms.slice(0, 8) : [];

      res.json(result);
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Brand research error:", error);
      const { friendlyGeminiError } = await import("./services/gemini-retry");
      const isTransient = /503|UNAVAILABLE|overloaded|high demand/i.test(error?.message || "");
      res.status(isTransient ? 503 : 500).json({ message: friendlyGeminiError(error, "Brand research failed. Please try again.") });
    }
  });

  app.post('/api/brands/research-competitors', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { brandName, domain, category, problemStatement, targetAudience, brandPositioning, products, differentiators, territory, location } = req.body;
      if (!brandName || !category) {
        return res.status(400).json({ message: "Brand name and category are required" });
      }
      if (!territory) {
        return res.status(400).json({ message: "Territory is required" });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      let locationContext: string;
      let searchInstruction: string;
      if (territory === "global") {
        locationContext = "This brand operates globally as an online/digital service. Their competitors are other online providers and SaaS platforms in the same space — NOT local or regional businesses.";
        searchInstruction = `Search Google for "${category} software" OR "${category} platforms" OR "${category} tools" OR "alternatives to ${brandName}" to find online competitors that serve the same market globally.`;
      } else {
        if (!location || typeof location !== 'string') {
          return res.status(400).json({ message: "Location is required when territory is not global" });
        }
        locationContext = `This brand operates specifically in ${location}. Their competitors are other businesses offering ${category} services in ${location}.`;
        searchInstruction = `Search Google for "${category} in ${location}" OR "${category} companies ${location}" OR "${category} providers ${location}" OR "alternatives to ${brandName} in ${location}" to find competitors operating in the same geographical market.`;
      }

      const brandContext = [
        domain ? `Website: ${domain}` : null,
        problemStatement ? `What they do: ${problemStatement}` : null,
        targetAudience ? `Who they serve: ${targetAudience}` : null,
        brandPositioning ? `Positioning: ${brandPositioning}` : null,
        products ? `Products/Services they sell: ${products}` : null,
        differentiators ? `Their key differentiators: ${differentiators}` : null,
      ].filter(Boolean).join("\n");

      const prompt = `You are a competitive intelligence analyst. Use Google Search to find the direct competitors of a specific brand.

BRAND PROFILE:
Name: ${brandName}
Industry/Category: ${category}
${brandContext}

TERRITORY:
${locationContext}

SEARCH TASK:
${searchInstruction}

A direct competitor is a company that:
1. Sells similar products or services (${products ? `specifically: ${products}` : category}) to a similar customer base (${targetAudience || "similar audience"})
2. A buyer evaluating ${brandName} would also evaluate these companies — they solve the same problem for the same type of customer
3. They actually compete for the same customers in the same market${territory === "regional" && location ? ` in ${location}` : ""}

Do NOT include:
- Generic technology companies that happen to have overlapping features but serve a different market
- Companies in a completely different industry or solving a different problem
- Companies that serve a fundamentally different audience or market segment
- Companies that only operate in regions where ${brandName} does not

Provide a JSON response with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "competitors": [
    {
      "name": "Competitor Company Name",
      "domain": "competitor.com",
      "description": "One sentence explaining specifically what they sell and why they directly compete with ${brandName} for the same customers"
    }
  ]
}

Rules:
- You MUST use Google Search to verify each competitor is real and currently active. Do not guess.
- Find between 3 and 5 DIRECT competitors only — companies a buyer would shortlist alongside ${brandName}.
- Every competitor MUST be a real company with a real, working website.
- Use actual domain names (e.g. "hubspot.com" not "https://hubspot.com").
- Return ONLY valid JSON. No markdown, no explanation text, no code fences.`;

      let competitorResearchResponse: { text?: string | null };
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("competitor research");
        competitorResearchResponse = { text: JSON.stringify({ competitors: fakeCompetitorList(brandName) }) };
      } else {
        const { callGeminiWithRetry, friendlyGeminiError } = await import("./services/gemini-retry");
        competitorResearchResponse = await callGeminiWithRetry(client, {
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
          label: "competitor-research",
          usage: { userId: getOwnerIdForBrands(req), brandId: null, feature: "competitor_research" },
        });
      }

      const text = competitorResearchResponse.text?.trim() || "";
      if (!text) {
        console.error("Gemini returned empty response for competitor research");
        return res.status(503).json({ message: "AI returned an empty response. Please try again in a moment." });
      }

      let parsed;
      try {
        const cleaned = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini competitor response:", text);
        return res.status(502).json({ message: "AI returned unparseable data. Please try again." });
      }

      if (!Array.isArray(parsed.competitors) || parsed.competitors.length === 0) {
        return res.status(422).json({
          message: "Could not find any competitors. Try adjusting your category or location.",
        });
      }

      res.json({
        competitors: parsed.competitors.slice(0, 5).map((c: any) => ({
          name: c.name || "Unknown",
          domain: c.domain || "",
          description: c.description || "",
        })),
      });
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Competitor research error:", error);
      const { friendlyGeminiError } = await import("./services/gemini-retry");
      const isTransient = /503|UNAVAILABLE|overloaded|high demand/i.test(error?.message || "");
      res.status(isTransient ? 503 : 500).json({ message: friendlyGeminiError(error, "Competitor research failed. Please try again.") });
    }
  });

  app.post('/api/brands/research-competitor-url', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { url, brandName, category } = req.body;
      if (!url) {
        return res.status(400).json({ message: "Competitor URL is required" });
      }

      const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
      let domain: string;
      try {
        domain = new URL(normalizedUrl).hostname.replace(/^www\./, "");
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `You are a competitive intelligence analyst. Use Google Search to research the company at the website "${domain}" (${normalizedUrl}).

${brandName ? `CONTEXT: This company is being evaluated as a potential competitor to "${brandName}" in the "${category || "their"}" industry.` : ""}

Research this company and provide:
1. The company's actual trading name
2. A one-sentence description of what they do and what market they serve

Provide a JSON response with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "name": "Company Name",
  "domain": "${domain}",
  "description": "One sentence explaining what this company does and the market they serve"
}

Rules:
- You MUST use Google Search to find real information about this company.
- Use the company's actual trading name, not just the domain.
- Return ONLY valid JSON. No markdown, no explanation text, no code fences.`;

      let competitorUrlResponse: { text?: string | null };
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("competitor URL research");
        competitorUrlResponse = { text: JSON.stringify(fakeCompetitorLookup(domain)) };
      } else {
        const { callGeminiWithRetry, friendlyGeminiError } = await import("./services/gemini-retry");
        competitorUrlResponse = await callGeminiWithRetry(client, {
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
          label: "competitor-url-research",
          usage: { userId: getOwnerIdForBrands(req), brandId: null, feature: "competitor_research" },
        });
      }

      const text = competitorUrlResponse.text?.trim() || "";
      if (!text) {
        return res.status(503).json({ message: "AI returned an empty response. Please try again in a moment." });
      }

      let parsed;
      try {
        const cleaned = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini competitor URL response:", text);
        return res.status(502).json({ message: "AI returned unparseable data. Please try again." });
      }

      res.json({
        name: parsed.name || domain,
        domain: parsed.domain || domain,
        description: parsed.description || "",
      });
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Competitor URL research error:", error);
      const { friendlyGeminiError } = await import("./services/gemini-retry");
      const isTransient = /503|UNAVAILABLE|overloaded|high demand/i.test(error?.message || "");
      res.status(isTransient ? 503 : 500).json({ message: friendlyGeminiError(error, "Failed to research competitor. Please try again.") });
    }
  });

  app.post('/api/brands', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'addBrands')) {
        return res.status(403).json({ message: "Permission denied", permission: "addBrands" });
      }
      const ownerId = getOwnerIdForBrands(req);

      const { sub, planConfig, brands: brandLimit } = await getEffectiveLimits(ownerId);
      if (brandLimit !== null) {
        const existingBrands = await storage.getBrandsByUser(ownerId);
        if (existingBrands.length >= brandLimit) {
          return res.status(403).json({
            message: `Brand limit — your ${planConfig.displayName} plan includes ${brandLimit} brand${brandLimit === 1 ? "" : "s"}. Add an Extra Brand pack or upgrade for more.`,
            upgradeRequired: true,
            feature: "brands",
            currentPlan: sub?.plan ?? "starter",
            limit: brandLimit,
          });
        }
      }

      if (req.body.competitors && Array.isArray(req.body.competitors)) {
        const { planConfig: compPlanConfig, competitors: competitorLimit } = await getEffectiveLimits(ownerId);
        if (competitorLimit !== null && req.body.competitors.length > competitorLimit) {
          return res.status(403).json({
            message: `Competitor limit — your ${compPlanConfig.displayName} plan includes ${competitorLimit} competitor${competitorLimit === 1 ? "" : "s"}. Add a Competitor Pack or upgrade for more.`,
            upgradeRequired: true,
            feature: "competitors",
            limit: competitorLimit,
          });
        }
      }

      const validated = insertBrandSchema.parse({
        ...req.body,
        userId: ownerId,
      });

      const brand = await storage.createBrand(validated);

      if (!req.body.skipFallbackTerms) {
        try {
          const existingTerms = await storage.getTrackedTermsByBrand(brand.id);
          if (existingTerms.length === 0) {
            const { created } = await createFallbackTermsForBrand(brand.id, ownerId, brand, "brand-create");
            if (created.length > 0) {
              console.log(`[brand-create] Auto-created ${created.length} fallback terms for brand ${brand.id}`);
            } else {
              console.warn(`[brand-create] Could not create any fallback terms for brand ${brand.id}`);
            }
          }
        } catch (termGenErr) {
          console.warn(`[brand-create] Server-side fallback term generation failed for brand ${brand.id}:`, termGenErr);
        }
      }

      res.status(201).json(brand);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating brand:", error);
      res.status(500).json({ message: "Failed to create brand" });
    }
  });

  app.patch('/api/brands/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (req.body.competitors && !hasPermission(req, 'addCompetitors')) {
        return res.status(403).json({ message: "Permission denied", permission: "addCompetitors" });
      }

      if (req.body.competitors && Array.isArray(req.body.competitors)) {
        const { sub: compSub, planConfig: compPlanConfig, competitors: competitorLimit } = await getEffectiveLimits(ownerId);
        if (competitorLimit !== null && req.body.competitors.length > competitorLimit) {
          return res.status(403).json({
            message: `Competitor limit — your ${compPlanConfig.displayName} plan includes ${competitorLimit} competitor${competitorLimit === 1 ? "" : "s"}. Add a Competitor Pack or upgrade for more.`,
            upgradeRequired: true,
            feature: "competitors",
            currentPlan: compSub?.plan ?? "starter",
            limit: competitorLimit,
          });
        }
      }

      const updated = await storage.updateBrand(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating brand:", error);
      res.status(500).json({ message: "Failed to update brand" });
    }
  });

  app.delete('/api/brands/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const brandTerms = await storage.getTrackedTermsByBrand(id);
      for (const term of brandTerms) {
        await storage.deleteTrackedTerm(term.id);
      }

      await storage.deleteBrand(id);
      res.json({ message: "Brand deleted successfully" });
    } catch (error) {
      console.error("Error deleting brand:", error);
      res.status(500).json({ message: "Failed to delete brand" });
    }
  });

  app.post('/api/brands/:id/generate-terms', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const existingTerms = await storage.getTrackedTermsByBrand(id);
      const activeTerms = existingTerms.filter((t: { isActive: boolean | null }) => t.isActive !== false);
      if (activeTerms.length > 0) {
        return res.json({ created: activeTerms, count: activeTerms.length, source: "existing" });
      }

      const { created, atLimit } = await createFallbackTermsForBrand(id, ownerId, brand, "generate-terms");

      if (created.length === 0) {
        const reason = atLimit ? "limit_reached" : "generation_failed";
        const message = atLimit
          ? "You've reached your plan's key term limit. Upgrade your plan or remove existing terms to add more."
          : "Could not generate any terms for this brand. Please add terms manually.";
        console.warn(`[generate-terms] Failed to create any fallback terms for brand ${id} — reason: ${reason}`);
        return res.status(422).json({ message, created: [], count: 0, reason });
      }

      console.log(`[generate-terms] Created ${created.length} fallback terms for brand ${id}`);
      res.status(201).json({ created, count: created.length, source: "generated" });
    } catch (error) {
      console.error("Error generating terms for brand:", error);
      res.status(500).json({ message: "Failed to generate terms" });
    }
  });

  app.post('/api/brands/:id/dismiss-discovered', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Competitor name is required" });
      }

      const discovered = Array.isArray(brand.discoveredCompetitors) ? (brand.discoveredCompetitors as any[]) : [];
      const filtered = discovered.filter((d: any) => d.name?.toLowerCase() !== name.toLowerCase());
      await storage.updateBrand(id, { discoveredCompetitors: filtered });
      res.json({ message: "Dismissed" });
    } catch (error) {
      console.error("Error dismissing discovered competitor:", error);
      res.status(500).json({ message: "Failed to dismiss competitor" });
    }
  });

  app.post('/api/brands/:id/extract-discovered', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      const ownerId = getOwnerIdForBrands(req);
      if (brand.userId !== ownerId) return res.status(403).json({ message: "Forbidden" });

      const { extractDiscoveredCompetitors } = await import("./assessment-engine");
      await extractDiscoveredCompetitors(id);

      const updated = await storage.getBrand(id);
      res.json({ discoveredCompetitors: updated?.discoveredCompetitors || [] });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error extracting discovered competitors:", error);
      res.status(500).json({ message: "Failed to extract discovered competitors" });
    }
  });

  // ============= SCAN ROUTES (stubs) =============
  app.post('/api/brands/:id/scan', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getOwnerIdForBrands(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const brandOwner = await storage.getUser(brand.userId);
      if (brandOwner?.accountType === "admin_provisioned") {
        return res.status(403).json({ message: "Rescanning is not available on trial accounts" });
      }

      await ensureAiJobReservation({
        userId,
        brandId: id,
        feature: "visibility_scan",
        provider: "openai",
        model: "gpt-5-search-api",
        meters: [OPENAI_WEB_SEARCH_METER],
      });
      await registerAiJobBackgroundWork(async () => {
        try {
          const mod = await import('./assessment-engine');
          await mod.assessmentEngine.runFullScan(id);
        } catch (err) {
          console.error(`Scan failed for brand ${id}:`, err);
          await storage.updateBrand(id, { scanStatus: 'idle' });
          throw err;
        }
      }, async () => {
        await storage.updateBrand(id, { scanStatus: 'running' });
      });

      res.status(202).json({ message: "Scan started", scanStatus: 'running' });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error starting scan:", error);
      res.status(500).json({ message: "Failed to start scan" });
    }
  });

  app.get('/api/brands/:id/scan-status', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const brand = await storage.getBrand(id);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json({ scanStatus: brand.scanStatus });
    } catch (error) {
      console.error("Error fetching scan status:", error);
      res.status(500).json({ message: "Failed to fetch scan status" });
    }
  });

  app.post('/api/brands/:id/backfill-competitors', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const { extractInfo } = await import('./llm-runner');
      const brandName = brand.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const competitors = (brand.competitors as string[]) || [];
      const runs = await storage.getVisibilityRunsByBrand(brandId);
      let updated = 0;

      for (const run of runs) {
        if (!run.rawResponse) continue;
        const info = extractInfo(run.rawResponse, brandName, competitors);
        const newCompetitors = info.competitorsMentioned;
        const oldCompetitors = (run.competitorsMentioned as string[]) || [];
        if (newCompetitors.length !== oldCompetitors.length || info.appeared !== run.appeared) {
          await storage.updateVisibilityRun(run.id, {
            competitorsMentioned: newCompetitors,
            appeared: info.appeared,
            position: info.position,
            sentiment: info.sentiment,
          });
          updated++;
        }
      }

      res.json({ message: `Back-filled ${updated} of ${runs.length} runs`, updated, total: runs.length });
    } catch (error) {
      console.error("Error back-filling competitors:", error);
      res.status(500).json({ message: "Failed to back-fill" });
    }
  });

  // ============= VISIBILITY RUNS ROUTES =============
  app.get('/api/visibility-runs/:id', isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.id);
      const run = await storage.getVisibilityRun(runId);
      if (!run) return res.status(404).json({ message: "Visibility run not found" });
      const brand = await storage.getBrand(run.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });
      res.json(run);
    } catch (error) {
      console.error("Error fetching visibility run:", error);
      res.status(500).json({ message: "Failed to fetch visibility run" });
    }
  });

  app.get('/api/brands/:id/visibility-runs', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      storage.upsertAiCache(brandId, "brand_activity", "last_access", { accessedAt: new Date().toISOString() }).catch(() => {});

      const filters: { promptType?: string; modelId?: string; startDate?: Date } = {};
      if (req.query.promptType && req.query.promptType !== 'all') {
        filters.promptType = req.query.promptType as string;
      }
      if (req.query.modelId && req.query.modelId !== 'all') {
        filters.modelId = req.query.modelId as string;
      }
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }

      const runs = await storage.getVisibilityRunsByBrand(brandId, filters);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching visibility runs:", error);
      res.status(500).json({ message: "Failed to fetch visibility runs" });
    }
  });

  // ============= PERCEPTION PROFILE ROUTES =============
  app.get('/api/brands/:id/perception', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const profile = await storage.getPerceptionProfile(brandId);
      res.json(profile || null);
    } catch (error) {
      console.error("Error fetching perception profile:", error);
      res.status(500).json({ message: "Failed to fetch perception profile" });
    }
  });

  app.post('/api/brands/:id/refresh-perception', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await ensureAiJobReservation({
        userId: getOwnerIdForBrands(req),
        brandId,
        feature: "perception",
        provider: "gemini",
        model: "gemini-2.5-flash",
      });

      await registerAiJobBackgroundWork(async () => {
        try {
          const mod = await import('./perception-analyzer');
          await mod.perceptionAnalyzer.analyze(brandId);
        } catch (err) {
          console.error(`Perception refresh failed for brand ${brandId}:`, err);
          throw err;
        }
      });

      res.status(202).json({ message: "Perception refresh started" });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error refreshing perception:", error);
      res.status(500).json({ message: "Failed to refresh perception" });
    }
  });

  function hasValidPageSpeedData(data: any): boolean {
    if (!data || !data.results) return false;
    const mobile = data.results.mobile;
    const desktop = data.results.desktop;
    const mobileValid = mobile && !mobile.error;
    const desktopValid = desktop && !desktop.error;
    return mobileValid || desktopValid;
  }

  function normalizeUrlForPageSpeed(domain: string): string {
    let url = domain.trim();
    if (!url.startsWith("http")) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.pathname !== "/" && parsed.pathname.length > 1) {
        return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
      }
      return parsed.origin;
    } catch {
      return url;
    }
  }

  async function fetchPageSpeedFromGoogle(domain: string): Promise<{ domain: string; results: Record<string, any>; fetchedAt: string }> {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey) throw new Error("PageSpeed API key not configured");

    const url = normalizeUrlForPageSpeed(domain);

    const results: Record<string, any> = {};

    function extractAudit(audits: any, key: string) {
      const a = audits?.[key];
      if (!a) return null;
      return { score: a.score, value: a.numericValue ?? null, unit: a.numericUnit || null, display: a.displayValue || null };
    }
    function extractDetailedAudit(audits: any, key: string) {
      const a = audits?.[key];
      if (!a) return null;
      return {
        id: a.id || key,
        title: a.title || key,
        description: (a.description || "").replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
        score: a.score,
        value: a.numericValue ?? null,
        unit: a.numericUnit || null,
        display: a.displayValue || null,
        scoreDisplayMode: a.scoreDisplayMode || null,
      };
    }
    function extractCrux(crux: any, key: string) {
      const m = crux?.[key];
      if (!m) return null;
      return { percentile: m.percentile ?? null, category: (m.category || "unknown").toLowerCase(), distributions: m.distributions || [] };
    }
    function extractCategoryAudits(categories: any, audits: any, categoryKey: string) {
      const cat = categories?.[categoryKey];
      if (!cat?.auditRefs) return [];
      return cat.auditRefs
        .map((ref: any) => {
          const a = audits?.[ref.id];
          if (!a || a.score === null || a.score === undefined) return null;
          if (a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "manual") return null;
          return {
            id: a.id || ref.id,
            title: a.title || ref.id,
            description: (a.description || "").replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
            score: a.score,
            display: a.displayValue || null,
            scoreDisplayMode: a.scoreDisplayMode || null,
            group: ref.group || null,
            weight: ref.weight ?? 0,
          };
        })
        .filter(Boolean);
    }

    const performanceOpportunityKeys = [
      "render-blocking-resources", "unused-javascript", "unused-css-rules",
      "uses-optimized-images", "uses-responsive-images", "uses-text-compression",
      "uses-rel-preconnect", "uses-long-cache-ttl", "offscreen-images",
      "unminified-javascript", "unminified-css", "modern-image-formats",
    ];
    const performanceDiagnosticKeys = [
      "dom-size", "critical-request-chains", "redirects",
      "mainthread-work-breakdown", "bootup-time", "third-party-summary",
      "largest-contentful-paint-element", "layout-shift-elements",
      "long-tasks", "non-composited-animations", "unsized-images",
      "viewport", "uses-passive-event-listeners", "no-document-write",
    ];

    async function fetchSingleStrategy(strategy: string, timeoutMs: number): Promise<any> {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO&key=${apiKey}`;
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      return await response.json();
    }

    function parseStrategyData(data: any) {
      const categories = data?.lighthouseResult?.categories;
      const audits = data?.lighthouseResult?.audits;
      const crux = data?.loadingExperience?.metrics;
      return {
        performanceScore: categories?.performance?.score != null ? Math.round(categories.performance.score * 100) : null,
        overallCategory: (data?.loadingExperience?.overall_category || "unknown").toLowerCase(),
        categories: {
          performance: categories?.performance?.score != null ? Math.round(categories.performance.score * 100) : null,
          accessibility: categories?.accessibility?.score != null ? Math.round(categories.accessibility.score * 100) : null,
          bestPractices: categories?.["best-practices"]?.score != null ? Math.round(categories["best-practices"].score * 100) : null,
          seo: categories?.seo?.score != null ? Math.round(categories.seo.score * 100) : null,
        },
        lab: {
          fcp: extractAudit(audits, "first-contentful-paint"),
          lcp: extractAudit(audits, "largest-contentful-paint"),
          cls: extractAudit(audits, "cumulative-layout-shift"),
          tbt: extractAudit(audits, "total-blocking-time"),
          si: extractAudit(audits, "speed-index"),
          tti: extractAudit(audits, "interactive"),
          serverResponseTime: extractAudit(audits, "server-response-time"),
          maxFid: extractAudit(audits, "max-potential-fid"),
        },
        field: {
          lcp: extractCrux(crux, "LARGEST_CONTENTFUL_PAINT_MS"),
          fcp: extractCrux(crux, "FIRST_CONTENTFUL_PAINT_MS"),
          cls: extractCrux(crux, "CUMULATIVE_LAYOUT_SHIFT_SCORE"),
          ttfb: extractCrux(crux, "EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
          inp: extractCrux(crux, "INTERACTION_TO_NEXT_PAINT"),
        },
        performanceOpportunities: performanceOpportunityKeys.map(k => extractDetailedAudit(audits, k)).filter(Boolean),
        performanceDiagnostics: performanceDiagnosticKeys.map(k => extractDetailedAudit(audits, k)).filter(Boolean),
        accessibilityAudits: extractCategoryAudits(categories, audits, "accessibility"),
        seoAudits: extractCategoryAudits(categories, audits, "seo"),
        bestPracticesAudits: extractCategoryAudits(categories, audits, "best-practices"),
      };
    }

    async function fetchStrategyWithRetry(strategy: string): Promise<any> {
      try {
        const data = await fetchSingleStrategy(strategy, 60000);
        return parseStrategyData(data);
      } catch (firstErr: any) {
        console.log(`PageSpeed ${strategy} attempt 1 failed for ${url}: ${firstErr?.message}. Retrying...`);
        try {
          await new Promise(r => setTimeout(r, 2000));
          const data = await fetchSingleStrategy(strategy, 60000);
          return parseStrategyData(data);
        } catch (retryErr: any) {
          console.error(`PageSpeed ${strategy} attempt 2 failed for ${url}: ${retryErr?.message}`);
          return { error: retryErr?.message || "Failed to fetch after retry" };
        }
      }
    }

    const [mobileResult, desktopResult] = await Promise.all([
      fetchStrategyWithRetry("mobile"),
      fetchStrategyWithRetry("desktop"),
    ]);
    results.mobile = mobileResult;
    results.desktop = desktopResult;

    return { domain: url, results, fetchedAt: new Date().toISOString() };
  }

  app.get('/api/brands/:id/pagespeed', isAuthenticated, async (req, res) => {
    let cachedData: any = null;
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      cachedData = brand.pagespeedData;
      const forceRefresh = req.query.refresh === "true";
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      if (!forceRefresh && brand.pagespeedData && brand.pagespeedFetchedAt) {
        const age = Date.now() - new Date(brand.pagespeedFetchedAt).getTime();
        if (age < ONE_WEEK_MS && hasValidPageSpeedData(brand.pagespeedData)) {
          return res.json(brand.pagespeedData);
        }
      }

      const result = await fetchPageSpeedFromGoogle(brand.domain || "");
      await storage.updateBrand(brandId, {
        pagespeedData: result as any,
        pagespeedFetchedAt: new Date(),
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching PageSpeed data:", error);
      if (cachedData) {
        return res.json(cachedData);
      }
      res.status(500).json({ message: "Failed to fetch PageSpeed data" });
    }
  });

  const benchmarkJobsInProgress = new Map<number, boolean>();

  function extractScores(psData: any) {
    const mobile = psData?.results?.mobile;
    const desktop = psData?.results?.desktop;
    return {
      mobile: {
        performance: mobile?.categories?.performance ?? mobile?.performanceScore ?? null,
        accessibility: mobile?.categories?.accessibility ?? null,
        bestPractices: mobile?.categories?.bestPractices ?? null,
        seo: mobile?.categories?.seo ?? null,
      },
      desktop: {
        performance: desktop?.categories?.performance ?? desktop?.performanceScore ?? null,
        accessibility: desktop?.categories?.accessibility ?? null,
        bestPractices: desktop?.categories?.bestPractices ?? null,
        seo: desktop?.categories?.seo ?? null,
      },
    };
  }

  async function runBenchmarkJob(brandId: number, brand: any) {
    const competitors = (brand.competitors || []).filter(Boolean);
    const brandDomain = brand.domain || "";
    const allDomains = [brandDomain, ...competitors];
    const totalDomains = allDomains.length;
    const startedAt = new Date().toISOString();

    async function writeStatus(step: string, completedDomains: string[], currentDomain: string | null) {
      const progress = Math.min(Math.round((completedDomains.length / (totalDomains + 1)) * 100), 95);
      await storage.upsertAiCache(brandId, "pagespeed_benchmark_status", "current", {
        status: "running",
        progress,
        step,
        currentDomain,
        completedDomains,
        startedAt,
      });
    }

    async function savePartialResult(brandData: any, competitorResults: Record<string, any>) {
      const brandScores = extractScores(brandData);
      const compEntries = Object.entries(competitorResults).map(([domain, data]) => ({
        domain,
        scores: extractScores(data),
        data,
      }));
      const partial = {
        brand: { domain: brandDomain, scores: brandScores, data: brandData },
        competitors: compEntries,
        aiSummary: "",
        generatedAt: new Date().toISOString(),
        partial: true,
      };
      await storage.upsertAiCache(brandId, "pagespeed_benchmark", "latest", partial);
    }

    try {
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const completedDomains: string[] = [];

      await writeStatus(`Fetching insights for ${brandDomain}...`, [], brandDomain);

      let brandData = brand.pagespeedData as any;
      if (!brandData || !brand.pagespeedFetchedAt || !hasValidPageSpeedData(brandData) || (Date.now() - new Date(brand.pagespeedFetchedAt).getTime() > ONE_WEEK_MS)) {
        try {
          console.log(`[Benchmark] Fetching PageSpeed for brand: ${brandDomain}`);
          brandData = await fetchPageSpeedFromGoogle(brandDomain);
          const mobileOk = !brandData.results?.mobile?.error;
          const desktopOk = !brandData.results?.desktop?.error;
          console.log(`[Benchmark] Brand ${brandDomain}: mobile=${mobileOk ? 'OK' : brandData.results?.mobile?.error}, desktop=${desktopOk ? 'OK' : brandData.results?.desktop?.error}`);
          await storage.updateBrand(brandId, { pagespeedData: brandData as any, pagespeedFetchedAt: new Date() });
        } catch (e: any) {
          console.error(`[Benchmark] Brand fetch failed: ${e?.message}`);
          if (!brandData) brandData = { domain: brandDomain, results: {}, fetchedAt: new Date().toISOString() };
        }
      }

      completedDomains.push(brandDomain);
      await savePartialResult(brandData, {});
      const firstComp = competitors.length > 0 ? competitors[0] : null;
      await writeStatus(`Completed ${brandDomain}`, [...completedDomains], firstComp);

      const competitorResults: Record<string, any> = {};
      for (let i = 0; i < competitors.length; i++) {
        const comp = competitors[i];
        const nextComp = i + 1 < competitors.length ? competitors[i + 1] : null;

        await writeStatus(`Fetching insights for ${comp}...`, [...completedDomains], comp);

        try {
          const cacheKey = `pagespeed_${comp.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const cached = await storage.getAiCache(brandId, "competitor_pagespeed", cacheKey);
          let compData;
          if (cached && cached.refreshedAt) {
            const age = Date.now() - new Date(cached.refreshedAt).getTime();
            if (age < ONE_WEEK_MS && hasValidPageSpeedData(cached.data)) {
              compData = cached.data;
            }
          }
          if (!compData) {
            console.log(`[Benchmark] Fetching PageSpeed for competitor: ${comp}`);
            compData = await fetchPageSpeedFromGoogle(comp);
            const mobileOk = !compData.results?.mobile?.error;
            const desktopOk = !compData.results?.desktop?.error;
            console.log(`[Benchmark] Competitor ${comp}: mobile=${mobileOk ? 'OK' : compData.results?.mobile?.error}, desktop=${desktopOk ? 'OK' : compData.results?.desktop?.error}`);
            await storage.upsertAiCache(brandId, "competitor_pagespeed", cacheKey, compData);
          } else {
            console.log(`[Benchmark] Using cached data for competitor: ${comp}`);
          }
          competitorResults[comp] = compData;
        } catch (e: any) {
          console.error(`[Benchmark] Competitor ${comp} fetch failed: ${e?.message}`);
          competitorResults[comp] = { domain: comp, results: {}, fetchedAt: new Date().toISOString(), error: e?.message || "Failed to fetch" };
        }

        completedDomains.push(comp);
        await savePartialResult(brandData, competitorResults);
        await writeStatus(`Completed ${comp}`, [...completedDomains], nextComp);
      }

      await writeStatus("Generating AI analysis...", [...completedDomains], null);

      const brandScores = extractScores(brandData);
      const compScoresMap: Record<string, any> = {};
      for (const [domain, data] of Object.entries(competitorResults)) {
        compScoresMap[domain] = extractScores(data);
      }

      let aiSummary = "";
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const scoresSummary = [
          `Your brand (${brandDomain}): Mobile Performance ${brandScores.mobile.performance ?? 'N/A'}, Accessibility ${brandScores.mobile.accessibility ?? 'N/A'}, Best Practices ${brandScores.mobile.bestPractices ?? 'N/A'}, SEO ${brandScores.mobile.seo ?? 'N/A'}. Desktop Performance ${brandScores.desktop.performance ?? 'N/A'}, Accessibility ${brandScores.desktop.accessibility ?? 'N/A'}, Best Practices ${brandScores.desktop.bestPractices ?? 'N/A'}, SEO ${brandScores.desktop.seo ?? 'N/A'}.`,
          ...Object.entries(compScoresMap).map(([domain, scores]) =>
            `Competitor ${domain}: Mobile Performance ${scores.mobile.performance ?? 'N/A'}, Accessibility ${scores.mobile.accessibility ?? 'N/A'}, Best Practices ${scores.mobile.bestPractices ?? 'N/A'}, SEO ${scores.mobile.seo ?? 'N/A'}. Desktop Performance ${scores.desktop.performance ?? 'N/A'}, Accessibility ${scores.desktop.accessibility ?? 'N/A'}, Best Practices ${scores.desktop.bestPractices ?? 'N/A'}, SEO ${scores.desktop.seo ?? 'N/A'}.`
          ),
        ].join("\n");

        let industryContext = "";
        try {
          const brandObj = await storage.getBrand(brandId);
          if (brandObj) {
            const parts = [
              brandObj.category ? `Industry: ${brandObj.category}` : null,
              brandObj.targetAudience ? `Target audience: ${brandObj.targetAudience}` : null,
            ].filter(Boolean);
            if (parts.length > 0) industryContext = `\n\nBrand context: ${parts.join(". ")}.`;
          }
        } catch {}

        const prompt = `You are a web performance consultant comparing a brand's website against its competitors using Google PageSpeed Insights scores.${industryContext}

Here are the scores (0-100 scale):
${scoresSummary}

Write a concise executive summary (3-5 paragraphs) covering:
1. How the brand compares overall to its competitors across all 4 categories
2. Where the brand leads or falls behind, specifically naming competitors
3. The most critical areas for improvement and their business impact for this type of business and audience
4. Actionable priority recommendations (top 3)

Be specific with numbers. Be direct about weaknesses. Frame performance impacts in terms of what matters to this brand's specific audience and industry. Use a professional analytical tone. Do NOT use markdown headers or bullet points — write in flowing paragraphs. Do not use code fences.`;

        if (isFakeAiEnabled()) {
          await fakeAiSleep();
          maybeThrowFakeAiError("benchmark summary");
          aiSummary = fakeBenchmarkSummary(brandDomain, Object.keys(compScoresMap).length);
        } else {
          const response = await executeAiCall(
            { userId: brand.userId, brandId, feature: "other" },
            "gemini",
            "gemini-3.1-pro-preview",
            () => client.models.generateContent({
              model: "gemini-3.1-pro-preview",
              contents: prompt,
              config: { maxOutputTokens: 1000, temperature: 0.7 },
            }),
            usageFromGemini,
          );
          aiSummary = response.text?.trim() || "";
        }
        if (!aiSummary) {
          aiSummary = "AI analysis completed but returned empty. Try refreshing the report.";
        }
      } catch (e: any) {
        console.error("Gemini benchmark summary error:", e?.message || e);
        const hasValidScores = Object.values(compScoresMap).some((s: any) =>
          s.mobile.performance !== null || s.desktop.performance !== null
        );
        if (hasValidScores) {
          aiSummary = "AI analysis timed out. The benchmark scores above are still valid — you can review them directly. Try generating the report again for the AI summary.";
        } else {
          aiSummary = "Unable to generate AI summary at this time. Most competitor data could not be fetched — try again later.";
        }
      }

      const benchmarkResult = {
        brand: { domain: brandDomain, scores: brandScores, data: brandData },
        competitors: Object.entries(competitorResults).map(([domain, data]) => ({
          domain,
          scores: compScoresMap[domain],
          data,
        })),
        aiSummary,
        generatedAt: new Date().toISOString(),
      };

      await storage.upsertAiCache(brandId, "pagespeed_benchmark", "latest", benchmarkResult);
      await storage.upsertAiCache(brandId, "pagespeed_benchmark_status", "current", {
        status: "complete", progress: 100, step: "Done",
        completedDomains: [...completedDomains], completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Benchmark job failed for brand", brandId, error);
      await storage.upsertAiCache(brandId, "pagespeed_benchmark_status", "current", {
        status: "error", progress: 0, step: "Report generation failed. Please try again.", errorAt: new Date().toISOString(),
      });
      throw error;
    } finally {
      benchmarkJobsInProgress.delete(brandId);
    }
  }

  app.post('/api/brands/:id/pagespeed-benchmark', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const competitors = (brand.competitors || []).filter(Boolean);
      if (competitors.length === 0) {
        return res.status(400).json({ message: "No competitors configured for this brand" });
      }

      if (benchmarkJobsInProgress.has(brandId)) {
        return res.json({ status: "already_running" });
      }

      await ensureAiJobReservation({
        userId: getOwnerIdForBrands(req),
        brandId,
        feature: "other",
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
      });
      await registerAiJobBackgroundWork(
        () => runBenchmarkJob(brandId, brand).catch(err => {
          console.error("Unhandled benchmark job error:", err);
          benchmarkJobsInProgress.delete(brandId);
          throw err;
        }),
        async () => {
          benchmarkJobsInProgress.set(brandId, true);
          try {
            await storage.upsertAiCache(brandId, "pagespeed_benchmark_status", "current", {
              status: "running", progress: 0, step: "Starting analysis...", startedAt: new Date().toISOString(),
            });
          } catch (error) {
            benchmarkJobsInProgress.delete(brandId);
            throw error;
          }
        },
      );

      res.json({ status: "started" });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error starting PageSpeed benchmark:", error);
      res.status(500).json({ message: "Failed to start benchmark report" });
    }
  });

  app.get('/api/brands/:id/pagespeed-benchmark/status', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const statusCache = await storage.getAiCache(brandId, "pagespeed_benchmark_status", "current");
      if (statusCache && statusCache.data) {
        return res.json(statusCache.data);
      }
      return res.json({ status: "idle" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch status" });
    }
  });

  app.get('/api/brands/:id/pagespeed-benchmark', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const cached = await storage.getAiCache(brandId, "pagespeed_benchmark", "latest");
      if (cached && cached.data) {
        return res.json(cached.data);
      }
      return res.json(null);
    } catch (error) {
      console.error("Error fetching benchmark:", error);
      res.status(500).json({ message: "Failed to fetch benchmark" });
    }
  });

  // ============= AI EXPLANATION ROUTES =============
  app.post('/api/ai/explain-confusion', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { marker, brandName, brandId: rawBrandId, refresh } = req.body;
      if (!marker || !brandName) {
        return res.status(400).json({ message: "marker and brandName are required" });
      }

      let brandId: number | undefined;
      if (rawBrandId) {
        const brand = await storage.getBrand(rawBrandId);
        if (brand && checkBrandOwnership(req, brand)) {
          brandId = rawBrandId;
        }
      }

      const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

      if (brandId && !refresh) {
        const cached = await storage.getAiCache(brandId, "confusion_explanation", marker);
        if (cached && cached.refreshedAt) {
          const age = Date.now() - new Date(cached.refreshedAt).getTime();
          if (age < NINETY_DAYS_MS) {
            return res.json({ ...(cached.data as any), cachedAt: cached.refreshedAt, fromCache: true });
          }
        }
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      let brandContextNote = "";
      if (brandId) {
        const brandObj = await storage.getBrand(brandId);
        if (brandObj) {
          const parts = [
            brandObj.category ? `Category: ${brandObj.category}` : null,
            brandObj.targetAudience ? `Target audience: ${brandObj.targetAudience}` : null,
            brandObj.brandPositioning ? `Positioning: ${brandObj.brandPositioning}` : null,
            brandObj.products ? `Products/Services: ${brandObj.products}` : null,
          ].filter(Boolean);
          if (parts.length > 0) brandContextNote = `\n\nBrand context:\n${parts.join("\n")}`;
        }
      }

      const prompt = `You are an AI visibility consultant helping a marketer understand a "confusion marker" that was identified during an AI perception analysis of their brand.

The brand: ${brandName}${brandContextNote}
The confusion marker: "${marker}"

Write a clear, helpful explanation in 3-4 sentences that covers:
1. What this confusion marker actually means in plain language (for a non-technical marketer)
2. Why it matters for their brand's AI visibility specifically in their industry
3. What "good" looks like — what a brand with no confusion in this area would have

Keep the tone professional but accessible. Do not use jargon. Write as a single paragraph, not a list.`;

      let explanation: string | undefined;
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("confusion explanation");
        explanation = fakeConfusionExplanation(marker, brandName);
      } else {
        const response = await executeAiCall(
          { userId: getOwnerIdForBrands(req), brandId: brandId ?? null, feature: "perception" },
          "gemini",
          "gemini-3.1-pro-preview",
          () => client.models.generateContent({ model: "gemini-3.1-pro-preview", contents: prompt }),
          usageFromGemini,
        );
        explanation = response.text?.trim();
      }
      if (!explanation) {
        return res.status(500).json({ message: "AI returned an empty response" });
      }

      const result = { explanation };
      if (brandId) {
        await storage.upsertAiCache(brandId, "confusion_explanation", marker, result);
      }

      res.json(result);
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error explaining confusion marker:", error?.message || error);
      res.status(500).json({ message: "Failed to generate explanation" });
    }
  });

  app.post('/api/ai/competitor-analysis', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { competitorName, brandName, brandCategory, missedPrompts, brandId: rawBrandId, refresh } = req.body;
      if (!competitorName || !brandName) {
        return res.status(400).json({ message: "competitorName and brandName are required" });
      }

      let brandId: number | undefined;
      if (rawBrandId) {
        const brand = await storage.getBrand(rawBrandId);
        if (brand && checkBrandOwnership(req, brand)) {
          brandId = rawBrandId;
        }
      }

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const cacheKey = competitorName.toLowerCase().trim();

      if (brandId && !refresh) {
        const cached = await storage.getAiCache(brandId, "competitor_analysis", cacheKey);
        if (cached && cached.refreshedAt) {
          const age = Date.now() - new Date(cached.refreshedAt).getTime();
          if (age < THIRTY_DAYS_MS) {
            return res.json({ ...(cached.data as any), cachedAt: cached.refreshedAt, fromCache: true });
          }
        }
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const promptContext = missedPrompts && missedPrompts.length > 0
        ? `\n\nHere are some actual AI prompts where ${competitorName} appeared but ${brandName} did not:\n${missedPrompts.slice(0, 5).map((p: string, i: number) => `${i + 1}. "${p}"`).join("\n")}`
        : "";

      let brandProfileContext = "";
      if (brandId) {
        const brandObj = await storage.getBrand(brandId);
        if (brandObj) {
          const parts = [
            brandObj.targetAudience ? `Target audience: ${brandObj.targetAudience}` : null,
            brandObj.products ? `Products/Services: ${brandObj.products}` : null,
            brandObj.differentiators ? `Key differentiators: ${brandObj.differentiators}` : null,
            brandObj.brandPositioning ? `Positioning: ${brandObj.brandPositioning}` : null,
          ].filter(Boolean);
          if (parts.length > 0) brandProfileContext = `\n\n${brandName}'s profile:\n${parts.join("\n")}`;
        }
      }

      const prompt = `You are an AI visibility strategist. A brand called "${brandName}"${brandCategory ? ` (in the ${brandCategory} space)` : ""} is monitoring their AI visibility and has identified "${competitorName}" as a competitor who appears in AI responses where ${brandName} does not.${brandProfileContext}${promptContext}

Using your knowledge and Google Search, research ${competitorName} and provide a competitive intelligence briefing. Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "overview": "A 2-3 sentence summary of who ${competitorName} is, what they do, and their market position.",
  "strengths": ["3-5 specific strengths that make ${competitorName} visible in AI responses. Focus on content strategy, brand authority, structured data, thought leadership, and market presence."],
  "weaknesses": ["2-4 specific weaknesses or gaps in ${competitorName}'s positioning that ${brandName} could exploit. Reference ${brandName}'s actual strengths where relevant."],
  "whyAiPrefersThem": "A 2-3 sentence explanation of why AI models might be recommending ${competitorName} over ${brandName} for these types of queries. What are they doing that creates AI visibility?",
  "howToCompete": "A 2-3 sentence actionable recommendation for how ${brandName} can win back visibility from ${competitorName}. Reference ${brandName}'s specific products and strengths — what should they emphasise to differentiate?"
}

Rules:
- Use Google Search to find current information about ${competitorName}
- Be specific and factual — reference real products, features, content they publish
- Focus on what makes them visible to AI models specifically, not just general business strengths
- When suggesting how to compete, reference ${brandName}'s actual products and differentiators, not generic advice
- Return ONLY valid JSON`;

      let competitorAnalysisText: string;
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("competitor analysis");
        competitorAnalysisText = JSON.stringify(fakeCompetitorAnalysis(competitorName, brandName));
      } else {
        const response = await executeAiCall(
          { userId: getOwnerIdForBrands(req), brandId: brandId ?? null, feature: "competitor_research" },
          "gemini",
          "gemini-2.5-flash",
          () => client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
          }),
          usageFromGemini,
          { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
        );
        competitorAnalysisText = response.text?.trim() || "";
      }

      const text = competitorAnalysisText;
      if (!text) {
        return res.status(500).json({ message: "AI returned an empty response" });
      }

      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      if (brandId) {
        await storage.upsertAiCache(brandId, "competitor_analysis", cacheKey, parsed);
      }

      res.json(parsed);
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error analysing competitor:", error?.message || error);
      res.status(500).json({ message: "Failed to analyse competitor" });
    }
  });

  app.post('/api/ai/competitor-weakness', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const { competitorName, competitorDomain, brandName, brandCategory, brandId: rawBrandId, refresh } = req.body;
      if (!competitorName) {
        return res.status(400).json({ message: "competitorName is required" });
      }

      let brandId: number | undefined;
      let targetAudience: string | null = null;
      if (rawBrandId) {
        const brand = await storage.getBrand(rawBrandId);
        if (brand && checkBrandOwnership(req, brand)) {
          brandId = rawBrandId;
          targetAudience = brand.targetAudience || null;
        }
      }

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const cacheKey = competitorName.toLowerCase().trim();

      if (brandId && !refresh) {
        const cached = await storage.getAiCache(brandId, "competitor_weakness", cacheKey);
        if (cached && cached.refreshedAt) {
          const age = Date.now() - new Date(cached.refreshedAt).getTime();
          if (age < THIRTY_DAYS_MS) {
            return res.json({ ...(cached.data as any), cachedAt: cached.refreshedAt, fromCache: true });
          }
        }
      }

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const domainContext = competitorDomain ? ` (website: ${competitorDomain})` : "";

      const prompt = `Using Google Search, research real customer complaints, negative reviews, and known problems with "${competitorName}"${domainContext}.

Search for reviews on G2, Capterra, Trustpilot, Reddit complaints, known issues/bugs, and why customers leave "${competitorName}".

${brandName ? `Context: This analysis is for "${brandName}"${brandCategory ? ` (in the ${brandCategory} space)` : ""}${targetAudience ? `, who serves ${targetAudience}` : ""}, who competes with ${competitorName}. Focus on weaknesses that are most relevant to ${brandName}'s target customers.` : ""}

Based on what you find in search results, return this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "summary": "A 2-3 sentence factual overview based ONLY on what was found in search results.",
  "overallSentiment": "positive|mixed|negative",
  "reviewScore": "The actual review score found in search results (e.g. '4.2/5 on G2') or null if none was found",
  "complaints": [
    {
      "category": "Category name (e.g. 'Customer Support', 'Pricing', 'Product Reliability')",
      "severity": "high|medium|low",
      "detail": "The specific complaint as described in search results. Quote or closely paraphrase what reviewers actually said.",
      "frequency": "How common based on what search results indicate",
      "source": "The specific platform or website where this was found"
    }
  ],
  "vulnerabilities": [
    "A specific vulnerability identified from search results"
  ],
  "customerChurnReasons": [
    "A specific reason customers leave, based on search results"
  ]
}

Rules:
- Report ONLY what you actually find in search results — do NOT fabricate complaints
- For each complaint, cite which website or review platform it came from
- Include actual review scores from G2, Capterra, or Trustpilot if found
- If search results are thin on negative feedback, include fewer items rather than fabricating
- Order complaints by severity (high first)
- Return ONLY valid JSON`;

      let text = "";
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("competitor weakness");
        text = JSON.stringify(fakeWeaknessReport(competitorName));
      } else {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await executeAiCall(
              { userId: getOwnerIdForBrands(req), brandId: brandId ?? null, feature: "competitor_research" },
              "gemini",
              "gemini-2.5-flash",
              () => client.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] },
              }),
              usageFromGemini,
              { expectedMeters: [GEMINI_GROUNDED_PROMPT_METER] },
            );
            text = response.text?.trim() || "";
            if (text) break;
            console.log(`[CompetitorWeakness] Attempt ${attempt + 1} returned empty, retrying...`);
          } catch (err: any) {
            if (isAiUsageCapExceededError(err)) throw err;
            console.log(`[CompetitorWeakness] Attempt ${attempt + 1} failed: ${err?.message}`);
            if (attempt === 1) throw err;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      if (!text) {
        return res.status(500).json({ message: "AI search returned no results. Please try again." });
      }

      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("[CompetitorWeakness] JSON parse failed, raw text:", cleaned.slice(0, 500));
        parsed = {
          summary: cleaned.slice(0, 500),
          overallSentiment: "mixed",
          reviewScore: null,
          complaints: [],
          vulnerabilities: [],
          customerChurnReasons: [],
        };
      }

      if (brandId) {
        await storage.upsertAiCache(brandId, "competitor_weakness", cacheKey, parsed);
      }

      res.json(parsed);
    } catch (error: any) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("[CompetitorWeakness] Error:", error?.message || error);
      if (error?.message?.includes("timed out")) {
        return res.status(504).json({ message: "The analysis is taking longer than expected. Please try again — results are often cached from the previous attempt." });
      }
      res.status(500).json({ message: "Failed to analyse competitor weaknesses. Please try again." });
    }
  });

  app.get('/api/brands/:id/weakness-summary', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const entries = await storage.getAiCacheByBrandAndType(brandId, "competitor_weakness");

      const { getBrandDisplayName } = await import("./prompt-builder");
      const brandCacheKey = getBrandDisplayName(brand).toLowerCase().trim();

      let brandWeaknessCount = 0;
      let competitorWeaknessCount = 0;

      for (const entry of entries) {
        const data = entry.data as any;
        const complaints = Array.isArray(data?.complaints) ? data.complaints.length : 0;
        const vulnerabilities = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities.length : 0;
        const total = complaints + vulnerabilities;

        if (entry.cacheKey === brandCacheKey) {
          brandWeaknessCount = total;
        } else {
          competitorWeaknessCount += total;
        }
      }

      res.json({ brandWeaknessCount, competitorWeaknessCount });
    } catch (error) {
      console.error("Error fetching weakness summary:", error);
      res.status(500).json({ message: "Failed to fetch weakness summary" });
    }
  });

  app.get('/api/brands/:id/ai-cache/:cacheType', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const cacheType = req.params.cacheType;
      const entries = await storage.getAiCacheByBrandAndType(brandId, cacheType);
      const result: Record<string, any> = {};
      for (const entry of entries) {
        result[entry.cacheKey] = {
          ...(entry.data as any),
          cachedAt: entry.refreshedAt,
          fromCache: true,
        };
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching AI cache:", error);
      res.status(500).json({ message: "Failed to fetch cached data" });
    }
  });

  // ============= COVERAGE GAP ROUTES =============
  app.get('/api/brands/:id/coverage-gaps', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const sub = await storage.getSubscriptionByUserId(userId);
      const complimentaryAccess = await userHasComplimentaryAccess(userId);
      if (!complimentaryAccess && sub && !canAccessFeature(sub.plan, "coverageGap")) {
        return res.status(403).json({
          message: "Coverage Gap Analysis is available on the Growth plan. Upgrade to unlock this feature.",
          upgradeRequired: true,
          feature: "coverageGap",
        });
      }

      const gap = await storage.getCoverageGap(brandId);
      res.json(gap || null);
    } catch (error) {
      console.error("Error fetching coverage gaps:", error);
      res.status(500).json({ message: "Failed to fetch coverage gaps" });
    }
  });

  app.post('/api/brands/:id/refresh-coverage', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const sub = await storage.getSubscriptionByUserId(userId);
      const complimentaryCoverageAccess = await userHasComplimentaryAccess(userId);
      if (!complimentaryCoverageAccess && sub && !canAccessFeature(sub.plan, "coverageGap")) {
        return res.status(403).json({
          message: "Coverage Gap Analysis is available on the Growth plan. Upgrade to unlock this feature.",
          upgradeRequired: true,
          feature: "coverageGap",
        });
      }

      await ensureAiJobReservation({
        userId: getOwnerIdForBrands(req),
        brandId,
        feature: "coverage",
        provider: "openai",
        model: "gpt-4o-mini",
      });

      await registerAiJobBackgroundWork(async () => {
        try {
          const mod = await import('./coverage-analyzer');
          await mod.coverageAnalyzer.analyze(brandId);
        } catch (err) {
          console.error(`Coverage refresh failed for brand ${brandId}:`, err);
          throw err;
        }
      });

      res.status(202).json({ message: "Coverage refresh started" });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error refreshing coverage:", error);
      res.status(500).json({ message: "Failed to refresh coverage" });
    }
  });

  // ============= READABILITY AUDIT ROUTES =============
  app.get('/api/brands/:id/readability-audit', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const audit = await storage.getReadabilityAudit(brandId);
      res.json(audit || null);
    } catch (error) {
      console.error("Error fetching readability audit:", error);
      res.status(500).json({ message: "Failed to fetch readability audit" });
    }
  });

  app.post('/api/brands/:id/audit', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      try {
        const mod = await import('./readability-auditor');
        const result = await mod.readabilityAuditor.audit(brandId);
        if (result.success) {
          res.json({ message: "Audit complete", success: true });
        } else {
          res.json({ message: "Audit completed with errors", success: false, error: result.error });
        }
      } catch (err: any) {
        if (sendAiUsageCapError(res, err)) return;
        console.error(`Audit failed for brand ${brandId}:`, err);
        res.json({ message: "Audit failed", success: false, error: err?.message || "Unknown error" });
      }
    } catch (error) {
      console.error("Error starting audit:", error);
      res.status(500).json({ message: "Failed to start audit" });
    }
  });

  // ============= CHANGE ALERT ROUTES =============
  app.get('/api/brands/:id/alerts', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const unreadOnly = req.query.unreadOnly === 'true';
      const alerts = await storage.getChangeAlertsByBrand(brandId, unreadOnly);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get('/api/brands/:id/alerts/unread-count', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const count = await storage.countUnreadChangeAlerts(brandId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch('/api/alerts/:id/read', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markChangeAlertAsRead(id);
      res.json({ message: "Alert marked as read" });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  app.post('/api/brands/:id/alerts/mark-all-read', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.markAllChangeAlertsAsRead(brandId);
      res.json({ message: "All alerts marked as read" });
    } catch (error) {
      console.error("Error marking all alerts as read:", error);
      res.status(500).json({ message: "Failed to mark all alerts as read" });
    }
  });

  // ============= REPORT ROUTES =============
  app.get('/api/brands/:id/reports', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const reportList = await storage.getReportsByBrand(brandId);
      res.json(reportList);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post('/api/brands/:id/reports/generate', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { reportType } = req.body;
      if (!['executive', 'marketing', 'competitive'].includes(reportType)) {
        return res.status(400).json({ message: "Invalid report type" });
      }

      const sub = await storage.getSubscriptionByUserId(userId);
      const complimentaryReportAccess = await userHasComplimentaryAccess(userId);
      if (sub && !complimentaryReportAccess) {
        const planConfig = getPlanConfig(sub.plan);
        if (!planConfig.limits.allowedReportTypes.includes(reportType)) {
          return res.status(403).json({
            message: `${reportType} reports are available on the Growth plan. Upgrade to unlock this report type.`,
            upgradeRequired: true,
            feature: "allowedReportTypes",
          });
        }
        if (planConfig.limits.reportsPerMonth !== null) {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const existingReports = await storage.getReportsByBrand(brandId);
          const reportsThisMonth = existingReports.filter(r =>
            r.createdAt && new Date(r.createdAt) >= monthStart
          ).length;
          if (reportsThisMonth >= planConfig.limits.reportsPerMonth) {
            return res.status(403).json({
              message: `Monthly report limit — your ${planConfig.displayName} plan includes ${planConfig.limits.reportsPerMonth} report${planConfig.limits.reportsPerMonth === 1 ? "" : "s"} per month. Upgrade for unlimited reports.`,
              upgradeRequired: true,
              feature: "reportsPerMonth",
            });
          }
        }
      }

      const { ensureFreshData } = await import('./services/data-freshness');
      const freshData = await ensureFreshData(brandId, storage);

      const { generateReport } = await import('./report-generator');
      const content = await generateReport(reportType, {
        brand,
        visibilityRuns: freshData.visibilityRuns,
        perceptionProfile: freshData.perceptionProfile,
        coverageGap: freshData.coverageGap,
        readabilityAudit: freshData.readabilityAudit,
        competitorWeaknesses: freshData.competitorWeaknesses,
      });

      const report = await storage.createReport({
        brandId,
        reportType,
        content: content as any,
      });

      res.status(201).json({ ...report, dataRefreshed: freshData.dataRefreshed });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.get('/api/brands/:id/reports/:reportId/download', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const reportId = parseInt(req.params.reportId);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const report = await storage.getReport(reportId);
      if (!report || report.brandId !== brandId) {
        return res.status(404).json({ message: "Report not found" });
      }

      const { ReportPDFGenerator } = await import('./pdf-generator');
      const reportContent = report.content as any;
      const generator = new ReportPDFGenerator({
        report: reportContent,
        brandDomain: brand.domain,
      });
      const pdfBuffer = await generator.generate();

      const reportTypeLabel = {
        executive: 'Executive-Snapshot',
        marketing: 'Marketing-Action-Report',
        competitive: 'Competitive-Intelligence',
      }[report.reportType] ?? report.reportType;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${brand.domain}-${reportTypeLabel}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error downloading report:", error);
      res.status(500).json({ message: "Failed to download report" });
    }
  });

  // ============= NEWS ARTICLE ROUTES =============

  app.post('/api/admin/news/generate', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { prompt, targetKeywords } = req.body;
      const userId = getUserId(req);

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ message: 'Prompt is required' });
      }

      const article = await newsGenerator.generateArticle(prompt, targetKeywords, userId);

      const validated = insertNewsArticleSchema.parse({
        title: article.title,
        slug: article.slug,
        content: article.content,
        metaDescription: article.metaDescription,
        keywords: article.keywords,
        questionsAnswered: article.questionsAnswered,
        keyTakeaways: article.keyTakeaways,
        authorId: userId,
        isPublished: false,
      });

      const created = await storage.createNewsArticle(validated);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      console.error('Error generating article:', error);
      res.status(500).json({ message: 'Failed to generate article' });
    }
  });

  app.get('/api/admin/news', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const articles = await storage.getAllNewsArticles(false);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching news articles:', error);
      res.status(500).json({ message: 'Failed to fetch articles' });
    }
  });

  app.patch('/api/admin/news/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const updated = await storage.updateNewsArticle(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating article:', error);
      res.status(500).json({ message: 'Failed to update article' });
    }
  });

  app.patch('/api/admin/news/:id/publish', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isPublished } = req.body;
      const updates = {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      };
      const updated = await storage.updateNewsArticle(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error publishing article:', error);
      res.status(500).json({ message: 'Failed to publish article' });
    }
  });

  app.delete('/api/admin/news/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteNewsArticle(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting article:', error);
      res.status(500).json({ message: 'Failed to delete article' });
    }
  });

  app.get('/api/news', async (req, res) => {
    try {
      const articles = await storage.getAllNewsArticles(true);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching published articles:', error);
      res.status(500).json({ message: 'Failed to fetch articles' });
    }
  });

  app.get('/api/news/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const article = await storage.getNewsArticleBySlug(slug);

      if (!article || !article.isPublished) {
        return res.status(404).json({ message: 'Article not found' });
      }

      res.json(article);
    } catch (error) {
      console.error('Error fetching article:', error);
      res.status(500).json({ message: 'Failed to fetch article' });
    }
  });

  // ============= CUSTOMER REVIEW ROUTES =============

  app.get('/api/admin/reviews', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const reviews = await storage.getAllCustomerReviews();
      res.json(reviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      res.status(500).json({ message: 'Failed to fetch reviews' });
    }
  });

  app.post('/api/admin/reviews', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validated = insertCustomerReviewSchema.parse(req.body);
      const review = await storage.createCustomerReview(validated);
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      console.error('Error creating review:', error);
      res.status(500).json({ message: 'Failed to create review' });
    }
  });

  app.patch('/api/admin/reviews/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const updated = await storage.updateCustomerReview(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating review:', error);
      res.status(500).json({ message: 'Failed to update review' });
    }
  });

  app.delete('/api/admin/reviews/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomerReview(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting review:', error);
      res.status(500).json({ message: 'Failed to delete review' });
    }
  });

  app.get('/api/reviews', async (req, res) => {
    try {
      const reviews = await storage.getApprovedCustomerReviews();
      res.json(reviews);
    } catch (error) {
      console.error('Error fetching approved reviews:', error);
      res.status(500).json({ message: 'Failed to fetch reviews' });
    }
  });

  app.get('/api/reviews/approved', async (req, res) => {
    try {
      const reviews = await storage.getApprovedCustomerReviews();
      res.json(reviews);
    } catch (error) {
      console.error('Error fetching approved reviews:', error);
      res.status(500).json({ message: 'Failed to fetch reviews' });
    }
  });

  // ============= BILLING ROUTES =============

  async function checkAndRenewMonthlySubscription(userId: string) {
    const sub = await storage.getSubscriptionByUserId(userId);
    if (!sub || sub.status !== "active") return;
    // Finite trials end through trialEndsAt and must never roll into a local
    // billing period or create a zero-value invoice merely from a status read.
    if (sub.trialEndsAt) return;
    // Stripe-backed subscriptions are renewed by Stripe + synced via webhooks.
    // Skip the legacy manual renewal path so Stripe stays the source of truth
    // and we never create duplicate local invoices.
    if (sub.stripeSubscriptionId) return;
    const now = new Date();

    if (sub.billingInterval === "monthly" && sub.billingPeriodEnd < now) {
      const newStart = new Date(sub.billingPeriodEnd);
      const newEnd = new Date(newStart);
      newEnd.setMonth(newEnd.getMonth() + 1);
      await storage.updateSubscription(sub.id, {
        billingPeriodStart: newStart,
        billingPeriodEnd: newEnd,
      });
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const plan = getPlanConfig(sub.plan);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      let totalAmount = sub.monthlyAmount;
      const activeAddons = await storage.getAddonsBySubscriptionId(sub.id);
      const monthlyAddons = activeAddons.filter(a => a.billingInterval === "monthly");
      for (const addon of monthlyAddons) {
        totalAmount += addon.monthlyAmount * addon.quantity;
      }

      const addonSummary = monthlyAddons.length > 0
        ? ` + ${monthlyAddons.length} add-on${monthlyAddons.length > 1 ? "s" : ""}`
        : "";

      await storage.createInvoice({
        subscriptionId: sub.id,
        userId,
        invoiceNumber,
        amount: totalAmount,
        currency: sub.currency,
        status: "pending",
        description: `${plan.displayName} Plan — Monthly subscription${addonSummary} (${newStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`,
        dueDate,
        paidAt: null,
      });
    }

    if (sub.billingInterval === "annual" && sub.billingPeriodEnd < now) {
      const newStart = new Date(sub.billingPeriodEnd);
      const newEnd = new Date(newStart);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      await storage.updateSubscription(sub.id, {
        billingPeriodStart: newStart,
        billingPeriodEnd: newEnd,
      });
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const plan = getPlanConfig(sub.plan);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      let totalAmount = sub.annualAmount;
      const activeAddons = await storage.getAddonsBySubscriptionId(sub.id);
      const annualAddons = activeAddons.filter(a => a.billingInterval === "annual");
      for (const addon of annualAddons) {
        totalAmount += addon.annualAmount * addon.quantity;
      }

      const addonSummary = annualAddons.length > 0
        ? ` + ${annualAddons.length} add-on${annualAddons.length > 1 ? "s" : ""}`
        : "";

      await storage.createInvoice({
        subscriptionId: sub.id,
        userId,
        invoiceNumber,
        amount: totalAmount,
        currency: sub.currency,
        status: "pending",
        description: `${plan.displayName} Plan — Annual subscription${addonSummary} (${newStart.getFullYear()})`,
        dueDate,
        paidAt: null,
      });
    }
  }

  app.get('/api/billing/subscription', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      await checkAndRenewMonthlySubscription(ownerId);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      if (!sub) return res.json(null);
      const planConfig = getPlanConfig(sub.plan);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [userBrands, userTerms, activeUserQuestions, activeAddons] = await Promise.all([
        storage.getBrandsByUser(ownerId),
        storage.getTrackedTermsByUser(ownerId),
        storage.countActiveUserQuestions(ownerId),
        storage.getAddonsByUserId(ownerId),
      ]);
      const activeTerms = userTerms.filter(t => t.isActive).length;
      const totalCompetitors = userBrands.reduce((sum, b) => sum + (Array.isArray(b.competitors) ? b.competitors.length : 0), 0);
      let reportsThisMonth = 0;
      for (const brand of userBrands) {
        const brandReports = await storage.getReportsByBrand(brand.id);
        reportsThisMonth += brandReports.filter(r =>
          r.createdAt && new Date(r.createdAt) >= monthStart
        ).length;
      }

      let extraBrands = 0;
      let extraCompetitors = 0;
      let extraTerms = 0;
      let extraPrompts = 0;
      let extraUsers = 0;
      let extraAudits = 0;
      let extraAlerts = 0;
      let extraPdfReports = 0;
      let extraWeeklyRefreshes = 0;
      for (const addon of activeAddons) {
        const cfg = getAddonConfig(addon.addonType);
        if (cfg) {
          const q = addon.quantity;
          extraBrands += (cfg.grantsExtra.brands ?? 0) * q;
          extraCompetitors += (cfg.grantsExtra.competitors ?? 0) * q;
          extraTerms += (cfg.grantsExtra.trackedTerms ?? 0) * q;
          extraPrompts += (cfg.grantsExtra.promptsLimit ?? 0) * q;
          extraUsers += (cfg.grantsExtra.usersLimit ?? 0) * q;
          extraAudits += (cfg.grantsExtra.auditsPerMonth ?? 0) * q;
          extraAlerts += (cfg.grantsExtra.alertsPerMonth ?? 0) * q;
          extraPdfReports += (cfg.grantsExtra.pdfReportsPerPeriod ?? 0) * q;
          extraWeeklyRefreshes += (cfg.grantsExtra.extraWeeklyRefreshes ?? 0) * q;
        }
      }

      const inTrial = isUserInTrial(sub);
      const complimentaryBillingAccess = await userHasComplimentaryAccess(ownerId);
      const brandCount = Math.max(userBrands.length, 1);
      const baseRefreshesPerWeek =
        planConfig.limits.dataRefreshCadence === "daily" ? 7 :
        planConfig.limits.dataRefreshCadence === "weekly" ? 1 : 0;
      const effectiveLimits = complimentaryBillingAccess
        ? {
            ...getPlanConfig("enterprise").limits,
            brands: null,
            competitors: null,
            trackedTerms: null,
          }
        : {
            ...planConfig.limits,
            brands: planConfig.limits.brands !== null ? planConfig.limits.brands + extraBrands : null,
            competitors: getTrialCompetitorLimit({
              plan: sub.plan,
              isInTrial: inTrial,
              baseLimit: planConfig.limits.competitors,
              extraCompetitors,
            }),
            trackedTerms: planConfig.limits.trackedTerms !== null ? (planConfig.limits.trackedTerms * brandCount) + extraTerms : null,
            promptsLimit: planConfig.limits.promptsLimit !== null ? planConfig.limits.promptsLimit + extraPrompts : null,
            usersLimit: planConfig.limits.usersLimit !== null ? planConfig.limits.usersLimit + extraUsers : null,
            auditsPerMonth: planConfig.limits.auditsPerMonth !== null ? planConfig.limits.auditsPerMonth + extraAudits : null,
            alertsPerMonth: planConfig.limits.alertsPerMonth !== null ? planConfig.limits.alertsPerMonth + extraAlerts : null,
            pdfReportsPerPeriod: planConfig.limits.pdfReportsPerPeriod !== null ? planConfig.limits.pdfReportsPerPeriod + extraPdfReports : null,
            refreshesPerWeek: baseRefreshesPerWeek + extraWeeklyRefreshes,
          };

      const usage = {
        trackedTerms: activeTerms,
        userQuestions: activeUserQuestions,
        brands: userBrands.length,
        competitors: totalCompetitors,
        reportsThisMonth,
      };
      const trialEnd = sub.trialEndsAt && !sub.manualBilling
        ? new Date(sub.trialEndsAt).toISOString()
        : null;
      const isInTrial = trialEnd ? new Date() < new Date(trialEnd) : false;
      res.json({ subscription: sub, planConfig: { ...planConfig, limits: effectiveLimits }, usage, addons: activeAddons, trialEnd, isInTrial, isManuallyBilled: !!sub.manualBilling });
    } catch (error) {
      console.error("Error fetching billing subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get('/api/billing/invoices', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const userInvoices = await storage.getInvoicesByUserId(ownerId);
      res.json(userInvoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get('/api/billing/invoices/:id/download', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice || invoice.userId !== ownerId) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const sub = await storage.getSubscriptionByUserId(ownerId);
      const user = await storage.getUser(ownerId);
      const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
      const text = [
        "════════════════════════════════════════════════════════",
        "Bobble Digital Ltd",
        "AEOSTARS — AI Representation & Visibility Intelligence Platform",
        "Suite 1.07, Department, 4 The Boulevard, Leeds Dock, Leeds, LS10 1PZ",
        "+44 (0113) 468 3902 | billing@aeostars.com",
        "════════════════════════════════════════════════════════",
        "",
        `INVOICE`,
        `Invoice Number: ${invoice.invoiceNumber}`,
        `Invoice Date:   ${invoiceDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        `Due Date:       ${dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        `Status:         ${invoice.status.toUpperCase()}`,
        "",
        "────────────────────────────────────────────────────────",
        "BILLED TO",
        `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Account Holder",
        user?.email ?? "",
        "",
        "────────────────────────────────────────────────────────",
        "DESCRIPTION",
        `${invoice.description ?? "AEOSTARS Subscription"}`,
        "",
        "────────────────────────────────────────────────────────",
        `TOTAL:          ${formatPence(invoice.amount)}`,
        "",
        "Payment instructions will be sent separately.",
        "Please reference invoice number when making payment.",
        "════════════════════════════════════════════════════════",
      ].join("\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.txt"`);
      res.send(text);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ message: "Failed to download invoice" });
    }
  });

  app.post('/api/billing/subscribe', isAuthenticated, async (req, res) => {
    try {
      // Hard guard: when Stripe is configured, every paid subscription MUST
      // be created via Stripe Checkout. This legacy local-only path can only
      // run in dev environments where no Stripe keys are configured.
      if (isStripeConfigured()) {
        return res.status(503).json({
          message: "Subscriptions must be created through Stripe — please use the secure checkout flow.",
          code: "STRIPE_REQUIRED",
        });
      }
      const ownerId = getOwnerIdForBrands(req);
      const existing = await storage.getSubscriptionByUserId(ownerId);
      if (existing) {
        return res.status(409).json({ message: "Subscription already exists" });
      }
      const { plan, billingInterval = "annual" } = req.body;
      if (!["starter", "growth", "enterprise", "starter_v2", "growth_v2", "accelerate"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }
      if (!["monthly", "annual"].includes(billingInterval)) {
        return res.status(400).json({ message: "Invalid billing interval" });
      }
      const planConfig = getPlanConfig(plan);
      const now = new Date();
      const periodEnd = new Date(now);
      if (billingInterval === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      const sub = await storage.createSubscription({
        userId: ownerId,
        plan,
        billingInterval,
        status: "active",
        monthlyAmount: planConfig.monthlyAmount ?? 0,
        annualAmount: planConfig.annualAmount ?? 0,
        currency: "GBP",
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
        trialStartedAt: now,
        trialEndsAt: calculateTrialEnd(now, TRIAL_DURATION_DAYS),
        trialUpdatedAt: now,
        trialUpdatedBy: ownerId,
        cancelledAt: null,
      });
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const amount = getEffectiveAmount(plan, billingInterval);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const intervalLabel = billingInterval === "annual" ? "Annual" : "Monthly";
      const invoice = await storage.createInvoice({
        subscriptionId: sub.id,
        userId: ownerId,
        invoiceNumber,
        amount,
        currency: "GBP",
        status: "pending",
        description: `${planConfig.displayName} Plan — ${intervalLabel} subscription`,
        dueDate,
        paidAt: null,
      });
      res.status(201).json({ subscription: sub, invoice });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  app.post('/api/billing/confirm-plan', isAuthenticated, async (req, res) => {
    try {
      // Hard guard: when Stripe is configured, every paid plan change MUST go
      // through Stripe. The legacy "local-only" subscription path can only run
      // in dev environments where no Stripe keys are configured.
      if (isStripeConfigured()) {
        return res.status(503).json({
          message: "Billing must go through Stripe — please use the secure checkout flow.",
          code: "STRIPE_REQUIRED",
        });
      }
      const ownerId = getOwnerIdForBrands(req);
      const { plan, billingInterval = "annual", companyName, billingAddress, billingEmail, telephone } = req.body;
      if (!["starter", "growth", "starter_v2", "growth_v2", "accelerate"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }
      if (!["monthly", "annual"].includes(billingInterval)) {
        return res.status(400).json({ message: "Invalid billing interval" });
      }
      if (!companyName) {
        return res.status(400).json({ message: "Company name is required" });
      }

      const planConfig = getPlanConfig(plan);
      const now = new Date();
      const periodEnd = new Date(now);
      if (billingInterval === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const existing = await storage.getSubscriptionByUserId(ownerId);
      let sub;
      if (existing) {
        sub = await storage.updateSubscription(existing.id, {
          plan,
          billingInterval,
          status: "active",
          monthlyAmount: planConfig.monthlyAmount ?? 0,
          annualAmount: planConfig.annualAmount ?? 0,
          billingPeriodStart: now,
          billingPeriodEnd: periodEnd,
          trialStartedAt: null,
          trialEndsAt: null,
          trialUpdatedAt: null,
          trialUpdatedBy: null,
        });
      } else {
        sub = await storage.createSubscription({
          userId: ownerId,
          plan,
          billingInterval,
          status: "active",
          monthlyAmount: planConfig.monthlyAmount ?? 0,
          annualAmount: planConfig.annualAmount ?? 0,
          currency: "GBP",
          billingPeriodStart: now,
          billingPeriodEnd: periodEnd,
          trialStartedAt: now,
          trialEndsAt: calculateTrialEnd(now, TRIAL_DURATION_DAYS),
          trialUpdatedAt: now,
          trialUpdatedBy: ownerId,
          cancelledAt: null,
        });
      }

      const invoiceNumber = await storage.getNextInvoiceNumber();
      const amount = getEffectiveAmount(plan, billingInterval);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const intervalLabel = billingInterval === "annual" ? "Annual" : "Monthly";
      await storage.createInvoice({
        subscriptionId: sub.id,
        userId: ownerId,
        invoiceNumber,
        amount,
        currency: "GBP",
        status: "pending",
        description: `${planConfig.displayName} Plan — ${intervalLabel} subscription`,
        dueDate,
        paidAt: null,
      });

      const user = await storage.getUser(ownerId);
      if (user?.accountType === "admin_provisioned") {
        await storage.updateUser(ownerId, { accountType: "standard" });
      }
      const priceDisplay = billingInterval === "annual"
        ? `£${((planConfig.annualAmount ?? 0) / 100).toFixed(2)}/year`
        : `£${((planConfig.monthlyAmount ?? 0) / 100).toFixed(2)}/month`;

      const { planFeatures = [] } = req.body;

      createDealInLiftOS({
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        email: billingEmail || (user?.email ?? ""),
        telephone: telephone || "",
        companyName,
        billingAddress: billingAddress || "",
        planName: planConfig.displayName,
        billingInterval,
        planPrice: priceDisplay,
        planFeatures: Array.isArray(planFeatures) ? planFeatures : [],
      }).catch(() => {});

      res.status(201).json({ subscription: sub });
    } catch (error) {
      console.error("Error confirming plan:", error);
      res.status(500).json({ message: "Failed to confirm plan" });
    }
  });

  app.post('/api/billing/upgrade', isAuthenticated, async (req, res) => {
    try {
      // Hard guard: when Stripe is configured, plan upgrades MUST go through
      // /api/billing/stripe/change-plan so Stripe stays the source of truth.
      if (isStripeConfigured()) {
        return res.status(503).json({
          message: "Plan changes must go through Stripe — please use the Change Plan flow.",
          code: "STRIPE_REQUIRED",
        });
      }
      const ownerId = getOwnerIdForBrands(req);
      const { plan, billingInterval } = req.body;
      if (!["starter", "growth", "enterprise", "starter_v2", "growth_v2", "accelerate"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }
      const sub = await storage.getSubscriptionByUserId(ownerId);
      if (!sub) {
        return res.status(404).json({ message: "No active subscription found" });
      }
      const planConfig = getPlanConfig(plan);
      const now = new Date();
      const newInterval = billingInterval ?? sub.billingInterval;
      const periodEnd = new Date(now);
      if (newInterval === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      const updated = await storage.updateSubscription(sub.id, {
        plan,
        billingInterval: newInterval,
        monthlyAmount: planConfig.monthlyAmount ?? 0,
        annualAmount: planConfig.annualAmount ?? 0,
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
        trialStartedAt: null,
        trialEndsAt: null,
        trialUpdatedAt: null,
        trialUpdatedBy: null,
      });
      const user = await storage.getUser(ownerId);
      if (user?.accountType === "admin_provisioned") {
        await storage.updateUser(ownerId, { accountType: "standard" });
      }
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const amount = getEffectiveAmount(plan, newInterval);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const intervalLabel = newInterval === "annual" ? "Annual" : "Monthly";
      const invoice = await storage.createInvoice({
        subscriptionId: sub.id,
        userId: ownerId,
        invoiceNumber,
        amount,
        currency: "GBP",
        status: "pending",
        description: `${planConfig.displayName} Plan — ${intervalLabel} subscription (upgrade)`,
        dueDate,
        paidAt: null,
      });
      res.json({ subscription: updated, invoice });
    } catch (error) {
      console.error("Error upgrading subscription:", error);
      res.status(500).json({ message: "Failed to upgrade subscription" });
    }
  });

  app.post('/api/billing/cancel', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      if (!sub) {
        return res.status(404).json({ message: "No active subscription found" });
      }

      const { confirm } = req.body;
      if (!confirm) {
        return res.status(400).json({ message: "Confirmation required" });
      }

      await storage.updateSubscription(sub.id, {
        status: "cancelled",
        cancelledAt: new Date(),
      });

      const userBrands = await storage.getBrandsByUser(ownerId);
      for (const brand of userBrands) {
        await storage.deleteBrand(brand.id);
      }

      const userTerms = await storage.getTrackedTermsByUser(ownerId);
      for (const term of userTerms) {
        await storage.deleteTrackedTerm(term.id);
      }

      res.json({ message: "Subscription cancelled and data deleted" });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // ============= ADDON PACK ROUTES =============

  app.get('/api/billing/addons', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const addons = await storage.getAddonsByUserId(ownerId);
      res.json(addons);
    } catch (error) {
      console.error("Error fetching addons:", error);
      res.status(500).json({ message: "Failed to fetch add-ons" });
    }
  });

  app.post('/api/billing/addons', isAuthenticated, async (req, res) => {
    try {
      // Hard guard: paid add-ons MUST be billed through Stripe when Stripe
      // is configured. The Stripe-backed equivalent lives at
      // POST /api/billing/stripe/addons.
      if (isStripeConfigured()) {
        return res.status(503).json({
          message: "Add-ons must be purchased through Stripe — please use the Stripe add-on flow.",
          code: "STRIPE_REQUIRED",
        });
      }
      const ownerId = getOwnerIdForBrands(req);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      if (!sub || sub.status !== "active") {
        return res.status(400).json({ message: "Active subscription required to purchase add-ons" });
      }
      const { addonType, billingInterval = "monthly" } = req.body;
      if (!["extra_brand", "competitor_pack", "key_terms_pack"].includes(addonType)) {
        return res.status(400).json({ message: "Invalid add-on type" });
      }
      if (!["monthly", "annual"].includes(billingInterval)) {
        return res.status(400).json({ message: "Invalid billing interval" });
      }
      const addonConfig = getAddonConfig(addonType);
      if (!addonConfig) {
        return res.status(400).json({ message: "Add-on configuration not found" });
      }
      const addon = await storage.createAddon({
        subscriptionId: sub.id,
        userId: ownerId,
        addonType,
        quantity: 1,
        billingInterval,
        monthlyAmount: addonConfig.monthlyAmount,
        annualAmount: addonConfig.annualAmount,
        status: "active",
        cancelledAt: null,
      });
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const amount = getAddonEffectiveAmount(addonType, billingInterval);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const intervalLabel = billingInterval === "annual" ? "Annual" : "Monthly";
      const invoice = await storage.createInvoice({
        subscriptionId: sub.id,
        userId: ownerId,
        invoiceNumber,
        amount,
        currency: "GBP",
        status: "pending",
        description: `${addonConfig.displayName} Pack — ${intervalLabel} add-on`,
        dueDate,
        paidAt: null,
      });
      res.status(201).json({ addon, invoice });
    } catch (error) {
      console.error("Error purchasing addon:", error);
      res.status(500).json({ message: "Failed to purchase add-on" });
    }
  });

  app.post('/api/billing/addons/:id/quantity', isAuthenticated, async (req, res) => {
    try {
      // Hard guard: increasing add-on quantity grants new paid entitlements,
      // so it MUST go through Stripe when Stripe is configured. The Stripe
      // equivalent lives at POST /api/billing/stripe/addons/:id/quantity.
      if (isStripeConfigured()) {
        return res.status(503).json({
          message: "Add-on quantity must be changed through Stripe — please use the Stripe add-on flow.",
          code: "STRIPE_REQUIRED",
        });
      }
      const ownerId = getOwnerIdForBrands(req);
      const addonId = parseInt(req.params.id);
      const { quantity } = req.body as { quantity: number };
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: "quantity must be a non-negative integer" });
      }
      const addons = await storage.getAddonsByUserId(ownerId);
      const addon = addons.find(a => a.id === addonId);
      if (!addon) {
        return res.status(404).json({ message: "Add-on not found" });
      }
      // Manual/legacy path — quantity 0 cancels; otherwise update quantity.
      const updated = quantity === 0
        ? await storage.updateAddon(addonId, { status: "cancelled", cancelledAt: new Date() })
        : await storage.updateAddon(addonId, { quantity });
      res.json({ addon: updated });
    } catch (error) {
      console.error("Error updating addon quantity:", error);
      res.status(500).json({ message: "Failed to update add-on quantity" });
    }
  });

  app.post('/api/billing/addons/:id/cancel', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const addonId = parseInt(req.params.id);
      const addons = await storage.getAddonsByUserId(ownerId);
      const addon = addons.find(a => a.id === addonId);
      if (!addon) {
        return res.status(404).json({ message: "Add-on not found" });
      }
      const updated = await storage.updateAddon(addonId, {
        status: "cancelled",
        cancelledAt: new Date(),
      });
      res.json({ addon: updated });
    } catch (error) {
      console.error("Error cancelling addon:", error);
      res.status(500).json({ message: "Failed to cancel add-on" });
    }
  });

  // ============= TRACKED TERMS ROUTES =============

  app.get('/api/tracked-terms', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      res.json(terms);
    } catch (error) {
      console.error("Error fetching tracked terms:", error);
      res.status(500).json({ message: "Failed to fetch tracked terms" });
    }
  });

  app.post('/api/tracked-terms/bulk', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const { terms, brandId } = req.body as { terms: string[]; brandId?: number };
      if (!Array.isArray(terms) || terms.length === 0) {
        return res.status(400).json({ message: "terms must be a non-empty array of strings" });
      }

      const effectiveLimitsData = await getEffectiveLimits(ownerId);
      const limit = effectiveLimitsData.trackedTerms;

      const currentCount = await storage.countActiveTrackedTerms(ownerId);
      const created: any[] = [];

      for (const termText of terms) {
        if (!termText || typeof termText !== "string" || !termText.trim()) continue;
        if (limit !== null && currentCount + created.length >= limit) break;

        const validated = insertTrackedTermSchema.parse({
          term: termText.trim(),
          userId: ownerId,
          brandId: brandId ?? null,
        });
        const term = await storage.createTrackedTerm(validated);
        created.push(term);
      }

      if (created.length === 0 && terms.length > 0) {
        console.warn(`[tracked-terms/bulk] Received ${terms.length} terms for brand ${brandId ?? 'unknown'} but created 0 — possible limit or validation issue`);
      }

      res.status(201).json({ created, count: created.length });
    } catch (error) {
      console.error("Error bulk creating tracked terms:", error);
      res.status(500).json({ message: "Failed to create tracked terms" });
    }
  });

  app.post('/api/tracked-terms', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      const effectiveLimitsData = await getEffectiveLimits(ownerId);
      if (sub) {
        const limit = effectiveLimitsData.trackedTerms;
        if (limit !== null) {
          const currentCount = await storage.countActiveTrackedTerms(ownerId);
          if (currentCount >= limit) {
            return res.status(403).json({
              message: `Key term limit — your ${effectiveLimitsData.planConfig.displayName} plan includes ${limit} tracked terms. Upgrade your plan or add a Key Terms Pack for more capacity.`,
              upgradeRequired: true,
              feature: "trackedTerms",
              currentPlan: sub.plan,
              limit,
            });
          }
        }
      }
      const validated = insertTrackedTermSchema.parse({ ...req.body, userId: ownerId });
      await ensureAiJobReservation({
        userId: ownerId,
        brandId: validated.brandId ?? null,
        feature: "question_generation",
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
        meters: [GEMINI_SEARCH_QUERY_METER],
      });
      const term = await storage.createTrackedTerm(validated);

      const qPerTerm = effectiveLimitsData.planConfig.limits.questionsPerTerm;

      let generatedQuestions: any[] = [];
      try {
        let brand = null;
        if (term.brandId) {
          brand = await storage.getBrand(term.brandId);
        }
        const { userQuestions: questions, brandSentiment: sentimentQuestions } = await generateAllQuestions(
          term.term,
          brand,
          qPerTerm,
          { userId: ownerId, brandId: term.brandId ?? null, feature: "question_generation" },
        );
        for (const q of questions) {
          const uq = await storage.createUserQuestion({
            trackedTermId: term.id,
            userId: ownerId,
            question: q.question,
            questionType: q.questionType,
            questionCategory: "user_question",
          });
          generatedQuestions.push(uq);
        }

        if (brand) {
          for (const q of sentimentQuestions) {
            const uq = await storage.createUserQuestion({
              trackedTermId: term.id,
              userId: ownerId,
              question: q.question,
              questionType: q.questionType,
              questionCategory: "brand_sentiment",
            });
            generatedQuestions.push(uq);
          }
          console.log(`Generated ${questions.length} user questions + ${sentimentQuestions.length} brand sentiment questions for term ${term.id}`);
        } else {
          console.log(`Generated ${questions.length} user questions for term ${term.id}`);
        }
      } catch (err) {
        if (isAiUsageCapExceededError(err)) throw err;
        console.error(`Question generation failed for term ${term.id}:`, err);
      }

      res.status(201).json({ ...term, questionsGenerated: generatedQuestions.length });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating tracked term:", error);
      res.status(500).json({ message: "Failed to create tracked term" });
    }
  });

  app.patch('/api/tracked-terms/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === id);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      const updated = await storage.updateTrackedTerm(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating tracked term:", error);
      res.status(500).json({ message: "Failed to update tracked term" });
    }
  });

  app.get('/api/tracked-terms/:id/runs', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === id);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      const runs = await storage.getVisibilityRunsByTrackedTerm(id);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching tracked term runs:", error);
      res.status(500).json({ message: "Failed to fetch visibility runs" });
    }
  });

  app.delete('/api/tracked-terms/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === id);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      await storage.deleteTrackedTerm(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tracked term:", error);
      res.status(500).json({ message: "Failed to delete tracked term" });
    }
  });

  app.delete('/api/tracked-terms/:id/questions', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === id);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      await storage.deleteUserQuestionsByTerm(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting questions for term:", error);
      res.status(500).json({ message: "Failed to delete questions" });
    }
  });

  // ============= USER QUESTIONS ROUTES =============

  app.get('/api/brands/:id/user-questions', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const userId = getUserId(req);
      const brand = await storage.getBrand(brandId);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const questions = await storage.getActiveUserQuestionsByBrand(brandId);
      res.json(questions);
    } catch (error) {
      console.error("Error fetching brand user questions:", error);
      res.status(500).json({ message: "Failed to fetch user questions" });
    }
  });

  app.get('/api/tracked-terms/:id/questions', isAuthenticated, async (req, res) => {
    try {
      const termId = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === termId);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      const questions = await storage.getUserQuestionsByTerm(termId);
      res.json(questions);
    } catch (error) {
      console.error("Error fetching user questions:", error);
      res.status(500).json({ message: "Failed to fetch user questions" });
    }
  });

  app.post('/api/tracked-terms/:id/questions', isAuthenticated, async (req, res) => {
    try {
      const termId = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === termId);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });
      const validated = insertUserQuestionSchema.parse({
        ...req.body,
        trackedTermId: termId,
        userId: ownerId,
      });
      const question = await storage.createUserQuestion(validated);
      res.status(201).json(question);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating user question:", error);
      res.status(500).json({ message: "Failed to create user question" });
    }
  });

  app.post('/api/tracked-terms/:id/generate-questions', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const termId = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const terms = await storage.getTrackedTermsByUser(ownerId);
      const term = terms.find(t => t.id === termId);
      if (!term) return res.status(404).json({ message: "Tracked term not found" });

      const sub = await storage.getSubscriptionByUserId(ownerId);
      const planCfg = sub ? getPlanConfig(sub.plan) : getPlanConfig("starter");
      const qPerTerm = planCfg.limits.questionsPerTerm;

      let brand = null;
      if (term.brandId) {
        brand = await storage.getBrand(term.brandId);
      }

      const { userQuestions: questions, brandSentiment: sentimentQuestions } = await generateAllQuestions(
        term.term,
        brand,
        qPerTerm,
        { userId: ownerId, brandId: term.brandId ?? null, feature: "question_generation" },
      );
      const created = [];
      for (const q of questions) {
        const uq = await storage.createUserQuestion({
          trackedTermId: termId,
          userId: ownerId,
          question: q.question,
          questionType: q.questionType,
          questionCategory: "user_question",
        });
        created.push(uq);
      }

      if (brand) {
        for (const q of sentimentQuestions) {
          const uq = await storage.createUserQuestion({
            trackedTermId: termId,
            userId: ownerId,
            question: q.question,
            questionType: q.questionType,
            questionCategory: "brand_sentiment",
          });
          created.push(uq);
        }
      }

      res.json({ questions: created });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error generating user questions:", error);
      res.status(500).json({ message: "Failed to generate user questions" });
    }
  });

  app.post('/api/tracked-terms/generate-questions-bulk', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const { termIds, brandId } = req.body as { termIds: number[]; brandId?: number };
      if (!Array.isArray(termIds) || termIds.length === 0) {
        return res.status(400).json({ message: "termIds must be a non-empty array" });
      }

      const sub = await storage.getSubscriptionByUserId(ownerId);
      const planCfg = sub ? getPlanConfig(sub.plan) : getPlanConfig("starter");
      const qPerTerm = planCfg.limits.questionsPerTerm;

      let brand = null;
      if (brandId) {
        brand = await storage.getBrand(brandId);
      }

      const userTerms = await storage.getTrackedTermsByUser(ownerId);
      const results: Record<number, any[]> = {};

      const validTerms = termIds
        .map(termId => ({ termId, term: userTerms.find(t => t.id === termId) }))
        .filter((entry): entry is { termId: number; term: NonNullable<typeof entry.term> } => !!entry.term);

      const settled = await Promise.allSettled(
        validTerms.map(async ({ termId, term }) => {
          const generated = await generateAllQuestions(
            term.term,
            brand,
            qPerTerm,
            { userId: ownerId, brandId: brandId ?? null, feature: "question_generation" },
          );
          return { termId, generated };
        })
      );

      const capFailure = settled.find(
        (result) => result.status === "rejected" && isAiUsageCapExceededError(result.reason),
      );
      if (capFailure?.status === "rejected") throw capFailure.reason;

      for (let si = 0; si < settled.length; si++) {
        const result = settled[si];
        if (result.status === "rejected") {
          const failedTermId = validTerms[si].termId;
          console.error(`Failed to generate questions for term ${failedTermId}:`, result.reason);
          results[failedTermId] = [];
          continue;
        }
        const { termId, generated } = result.value;
        const { userQuestions: questions, brandSentiment: sentimentQuestions } = generated;

        try {
          const created = [];
          for (const q of questions) {
            const uq = await storage.createUserQuestion({
              trackedTermId: termId,
              userId: ownerId,
              question: q.question,
              questionType: q.questionType,
              questionCategory: "user_question",
            });
            created.push(uq);
          }

          if (brand) {
            for (const q of sentimentQuestions) {
              const uq = await storage.createUserQuestion({
                trackedTermId: termId,
                userId: ownerId,
                question: q.question,
                questionType: q.questionType,
                questionCategory: "brand_sentiment",
              });
              created.push(uq);
            }
          }

          results[termId] = created;
        } catch (err) {
          console.error(`Failed to save questions for term ${termId}:`, err);
          results[termId] = [];
        }
      }

      res.json({ results });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error bulk generating questions:", error);
      res.status(500).json({ message: "Failed to generate questions" });
    }
  });

  app.patch('/api/user-questions/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const userQs = await storage.getUserQuestionsByUser(ownerId);
      const q = userQs.find(uq => uq.id === id);
      if (!q) return res.status(404).json({ message: "User question not found" });
      const updated = await storage.updateUserQuestion(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating user question:", error);
      res.status(500).json({ message: "Failed to update user question" });
    }
  });

  app.delete('/api/user-questions/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const userQs = await storage.getUserQuestionsByUser(ownerId);
      const q = userQs.find(uq => uq.id === id);
      if (!q) return res.status(404).json({ message: "User question not found" });
      await storage.deleteUserQuestion(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user question:", error);
      res.status(500).json({ message: "Failed to delete user question" });
    }
  });

  // ============= SEARCH VOLUME ESTIMATION =============
  app.post('/api/brands/:id/estimate-volumes', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });
      if (!checkBrandOwnership(req, brand)) return res.status(403).json({ message: "Forbidden" });

      const questions = await storage.getActiveUserQuestionsByBrand(brandId);
      const needsEstimate = questions.filter(q => !q.searchVolume);

      if (needsEstimate.length === 0) {
        return res.json({ message: "All questions already have volume estimates", updated: 0 });
      }

      if (isFakeAiEnabled()) {
        // Placed before the OpenAI client construction: the SDK throws on a
        // missing key, and fake mode must run keyless.
        await fakeAiSleep();
        maybeThrowFakeAiError("volume estimation");
        const fakes = fakeVolumeEstimates(`volumes-route:${brandId}`, needsEstimate.length);
        let updated = 0;
        for (let i = 0; i < needsEstimate.length; i++) {
          const est = fakes[i];
          await storage.updateUserQuestion(needsEstimate[i].id, {
            searchVolume: est.volume_label,
            searchVolumeMin: est.volume_min,
            searchVolumeMax: est.volume_max,
          });
          updated++;
        }
        return res.json({ message: "Volume estimation complete", updated, total: needsEstimate.length });
      }

      const region = brand.territory === "regional" && brand.location ? brand.location : "global";
      const category = brand.category || "general";

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_DIRECT_KEY });

      const BATCH = 10;
      let updated = 0;

      for (let i = 0; i < needsEstimate.length; i += BATCH) {
        const batch = needsEstimate.slice(i, i + BATCH);
        const questionList = batch.map((q, idx) => `${idx + 1}. "${q.question}"`).join("\n");

        const prompt = `You are a search volume estimation expert. Estimate the monthly search traffic volume for each of the following questions/queries within the ${region} market, in the ${category} industry.

For each question, provide a tight estimated monthly search volume range. The range should be narrow (e.g., "200-350" not "100-10000"). Consider:
- How likely real users are to search this exact phrase or very similar variations
- The specificity of the query (very specific = lower volume, broad = higher)
- The market size in ${region}
- Include related semantic variations that would match this intent

Questions:
${questionList}

Respond ONLY with a JSON array of objects, one per question, in the same order:
[{"index": 1, "volume_min": 200, "volume_max": 350, "volume_label": "200-350"}]

Rules:
- volume_min and volume_max must be integers
- The range should be tight (max should be no more than 3x the min for most queries)
- Very niche B2B queries might be 10-50/month
- Broad consumer queries could be 1000-5000/month
- Be realistic, not inflated
- Return ONLY valid JSON array, no markdown`;

        try {
          const response = await executeAiCall(
            { userId: getOwnerIdForBrands(req), brandId, feature: "volume_estimation" },
            "openai",
            "gpt-4o-mini",
            () => client.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1000,
              temperature: 0.3,
            }),
            usageFromOpenAI,
          );

          const text = response.choices[0]?.message?.content || "";
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const estimates = JSON.parse(jsonMatch[0]);
            for (const est of estimates) {
              const idx = (est.index || 0) - 1;
              if (idx >= 0 && idx < batch.length && est.volume_min != null && est.volume_max != null) {
                await storage.updateUserQuestion(batch[idx].id, {
                  searchVolume: est.volume_label || `${est.volume_min}-${est.volume_max}`,
                  searchVolumeMin: est.volume_min,
                  searchVolumeMax: est.volume_max,
                });
                updated++;
              }
            }
          }
        } catch (err) {
          if (isAiUsageCapExceededError(err)) throw err;
          console.error(`Volume estimation batch failed (questions ${i + 1}-${i + batch.length}):`, err);
        }

        if (i + BATCH < needsEstimate.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      res.json({ message: "Volume estimation complete", updated, total: needsEstimate.length });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error estimating volumes:", error);
      res.status(500).json({ message: "Failed to estimate volumes" });
    }
  });

  // ============= TEAM MANAGEMENT ROUTES =============
  app.get('/api/team/permissions', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const isOwner = isAccountOwner(req);
      if (isOwner) {
        return res.json({
          isOwner: true,
          permissions: {
            addBrands: true, billing: true, addCompetitors: true,
            manageUsers: true, createTickets: true, deleteTickets: true, editTickets: true,
          },
        });
      }
      res.json({
        isOwner: false,
        permissions: req.teamPermissions || {},
      });
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ message: "Failed to fetch permissions" });
    }
  });

  app.get('/api/team/users', isAuthenticated, async (req, res) => {
    try {
      const ownerId = getOwnerIdForBrands(req);
      const owner = await storage.getUser(ownerId);
      const members = await storage.getTeamMembersByOwner(ownerId);

      const users: { id: string; firstName: string | null; lastName: string | null; email: string }[] = [];

      if (owner) {
        users.push({ id: owner.id, firstName: owner.firstName, lastName: owner.lastName, email: owner.email });
      }

      for (const m of members) {
        const u = await storage.getUser(m.userId);
        if (u) {
          users.push({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email });
        }
      }

      res.json(users);
    } catch (error) {
      console.error("Error fetching team users:", error);
      res.status(500).json({ message: "Failed to fetch team users" });
    }
  });

  app.get('/api/team', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const ownerId = getOwnerIdForBrands(req);
      const members = await storage.getTeamMembersByOwner(ownerId);
      const invitations = await storage.getTeamInvitationsByOwner(ownerId);

      const memberDetails = await Promise.all(members.map(async (m) => {
        const user = await storage.getUser(m.userId);
        return {
          ...m,
          user: user ? { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl, lastLogin: user.lastLogin } : null,
        };
      }));

      const owner = await storage.getUser(ownerId);
      const sub = await storage.getSubscriptionByUserId(ownerId);
      const planConfig = getPlanConfig(sub?.plan ?? "starter");
      const teamLimit = planConfig.limits.teamUsers;
      const currentCount = members.length + 1;

      res.json({
        owner: owner ? { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName, profileImageUrl: owner.profileImageUrl } : null,
        members: memberDetails,
        invitations: invitations.filter(i => i.status === 'pending'),
        teamLimit,
        currentCount,
        plan: sub?.plan ?? "starter",
        planDisplayName: planConfig.displayName,
      });
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.post('/api/team/invite', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const ownerId = getOwnerIdForBrands(req);
      const { name, email, permissions: rawPermissions } = req.body;

      if (!name || !email || !rawPermissions) {
        return res.status(400).json({ message: "Name, email, and permissions are required" });
      }

      const permissionKeys = ['addBrands', 'billing', 'addCompetitors', 'manageUsers', 'createTickets', 'deleteTickets', 'editTickets'] as const;
      const permissions: Record<string, boolean> = {};
      for (const key of permissionKeys) {
        permissions[key] = rawPermissions[key] === true;
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        const existingMember = await storage.getTeamMemberByUserId(existingUser.id);
        if (existingMember || existingUser.id === ownerId) {
          return res.status(400).json({ message: "This user is already on your team" });
        }
      }

      const sub = await storage.getSubscriptionByUserId(ownerId);
      const complimentaryTeamAccess = await userHasComplimentaryAccess(ownerId);
      const planConfig = getPlanConfig(sub?.plan ?? "starter");
      const teamLimit = planConfig.limits.teamUsers;
      if (!complimentaryTeamAccess && teamLimit !== null) {
        const memberCount = await storage.countTeamMembers(ownerId);
        const pendingInvites = (await storage.getTeamInvitationsByOwner(ownerId)).filter(i => i.status === 'pending').length;
        if (memberCount + pendingInvites + 1 >= teamLimit) {
          return res.status(403).json({
            message: `Team limit — your ${planConfig.displayName} plan includes ${teamLimit} users (including yourself). Upgrade your plan for more team members.`,
            upgradeRequired: true,
            feature: "teamUsers",
            currentPlan: sub?.plan ?? "starter",
            limit: teamLimit,
          });
        }
      }

      const { randomBytes } = await import('crypto');
      const inviteToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitation = await storage.createTeamInvitation({
        accountOwnerId: ownerId,
        email,
        name,
        inviteToken,
        status: 'pending',
        permissions,
        expiresAt,
      });

      const ownerUser = await storage.getUser(ownerId);
      const inviterName = ownerUser?.firstName && ownerUser?.lastName
        ? `${ownerUser.firstName} ${ownerUser.lastName}`
        : ownerUser?.email || 'Your team';

      const brands = await storage.getBrandsByUser(ownerId);
      const brandName = brands[0]?.domain || 'your brand';

      const { sendTeamInviteEmail, getBaseUrl } = await import('./services/email-service');
      const inviteUrl = `${getBaseUrl()}/accept-invite/${inviteToken}`;

      try {
        await sendTeamInviteEmail({ to: email, inviterName, brandName, inviteUrl });
      } catch (emailErr) {
        console.error('Failed to send invite email:', emailErr);
      }

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  app.delete('/api/team/invite/:id', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const invitations = await storage.getTeamInvitationsByOwner(ownerId);
      const invite = invitations.find(i => i.id === id);
      if (!invite) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      await storage.updateTeamInvitation(id, { status: 'revoked' });
      res.json({ message: "Invitation revoked" });
    } catch (error) {
      console.error("Error revoking invitation:", error);
      res.status(500).json({ message: "Failed to revoke invitation" });
    }
  });

  app.post('/api/team/resend-invite/:id', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const invitations = await storage.getTeamInvitationsByOwner(ownerId);
      const invite = invitations.find(i => i.id === id && i.status === 'pending');
      if (!invite) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const ownerUser = await storage.getUser(ownerId);
      const inviterName = ownerUser?.firstName && ownerUser?.lastName
        ? `${ownerUser.firstName} ${ownerUser.lastName}`
        : ownerUser?.email || 'Your team';
      const brands = await storage.getBrandsByUser(ownerId);
      const brandName = brands[0]?.domain || 'your brand';
      const { sendTeamInviteEmail, getBaseUrl } = await import('./services/email-service');
      const inviteUrl = `${getBaseUrl()}/accept-invite/${invite.inviteToken}`;

      try {
        await sendTeamInviteEmail({ to: invite.email, inviterName, brandName, inviteUrl });
      } catch (emailErr) {
        console.error('Failed to resend invite email:', emailErr);
      }

      res.json({ message: "Invitation resent" });
    } catch (error) {
      console.error("Error resending invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  app.get('/api/team/accept/:token', async (req, res) => {
    try {
      const invite = await storage.getTeamInvitationByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      if (invite.status !== 'pending') {
        return res.status(400).json({ message: "Invitation has already been used or revoked" });
      }
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ message: "Invitation has expired" });
      }

      const ownerUser = await storage.getUser(invite.accountOwnerId);
      const brands = await storage.getBrandsByUser(invite.accountOwnerId);
      const inviterName = ownerUser?.firstName && ownerUser?.lastName
        ? `${ownerUser.firstName} ${ownerUser.lastName}`
        : ownerUser?.email || 'Your team';
      const brandName = brands[0]?.domain || 'your brand';

      res.json({
        email: invite.email,
        name: invite.name,
        inviterName,
        brandName,
        valid: true,
      });
    } catch (error) {
      console.error("Error validating invite:", error);
      res.status(500).json({ message: "Failed to validate invitation" });
    }
  });

  app.post('/api/team/accept/:token', async (req, res) => {
    try {
      const invite = await storage.getTeamInvitationByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      if (invite.status !== 'pending') {
        return res.status(400).json({ message: "Invitation has already been used or revoked" });
      }
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ message: "Invitation has expired" });
      }

      const { password } = req.body;
      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const { hashPassword, validatePasswordStrength } = await import('./auth');
      const passwordCheck = validatePasswordStrength(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ message: "Password does not meet requirements", errors: passwordCheck.errors });
      }

      const existingUser = await storage.getUserByEmail(invite.email);
      let userId: string;

      if (existingUser) {
        const existingMemberCheck = await storage.getTeamMemberByUserId(existingUser.id);
        if (existingMemberCheck) {
          return res.status(400).json({ message: "This account is already part of a team. Please log in instead." });
        }
        if (existingUser.passwordHash) {
          const { verifyPassword } = await import('./auth');
          const passwordValid = await verifyPassword(password, existingUser.passwordHash);
          if (!passwordValid) {
            return res.status(401).json({ message: "An account with this email already exists. Please enter your current password to join the team." });
          }
        } else {
          const passwordHash = await hashPassword(password);
          await storage.updatePassword(existingUser.id, passwordHash);
        }
        userId = existingUser.id;
      } else {
        const nameParts = invite.name.split(' ');
        const firstName = nameParts[0] || invite.name;
        const lastName = nameParts.slice(1).join(' ') || '';
        const passwordHash = await hashPassword(password);

        const user = await storage.createUser({
          email: invite.email,
          passwordHash,
          firstName,
          lastName,
          role: 'viewer',
          emailVerified: true,
          isActive: true,
        });
        userId = user.id;
      }

      const existingMember = await storage.getTeamMemberByUserId(userId);
      if (!existingMember) {
        await storage.createTeamMember({
          accountOwnerId: invite.accountOwnerId,
          userId,
          permissions: invite.permissions,
        });
      }

      await storage.updateTeamInvitation(invite.id, { status: 'accepted' });

      const passport = await import('passport');
      req.login({ id: userId }, (err) => {
        if (err) {
          return res.status(500).json({ message: "Account created but login failed" });
        }
        res.json({ message: "Welcome to AEOSTARS", userId });
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  app.patch('/api/team/members/:id', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const members = await storage.getTeamMembersByOwner(ownerId);
      const member = members.find(m => m.id === id);
      if (!member) {
        return res.status(404).json({ message: "Team member not found" });
      }

      const { permissions } = req.body;
      if (!permissions) {
        return res.status(400).json({ message: "Permissions are required" });
      }

      const updated = await storage.updateTeamMember(id, { permissions });
      res.json(updated);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  app.delete('/api/team/members/:id', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'manageUsers')) {
        return res.status(403).json({ message: "Permission denied", permission: "manageUsers" });
      }
      const id = parseInt(req.params.id);
      const ownerId = getOwnerIdForBrands(req);
      const members = await storage.getTeamMembersByOwner(ownerId);
      const member = members.find(m => m.id === id);
      if (!member) {
        return res.status(404).json({ message: "Team member not found" });
      }

      await storage.deleteTeamMember(id);
      res.json({ message: "Team member removed" });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });

  // ============= ACTION TICKETS ROUTES =============
  app.get('/api/brands/:id/action-tickets', isAuthenticated, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const tickets = await storage.getActionTicketsByBrand(brandId);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching action tickets:", error);
      res.status(500).json({ message: "Failed to fetch action tickets" });
    }
  });

  app.post('/api/brands/:id/action-tickets', isAuthenticated, async (req, res) => {
    try {
      if (!hasPermission(req, 'createTickets')) {
        return res.status(403).json({ message: "Permission denied", permission: "createTickets" });
      }
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getUserId(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const validated = insertActionTicketSchema.parse({
        brandId,
        userId,
        title: req.body.title,
        description: req.body.description || null,
        source: req.body.source || 'manual',
        sourceRef: req.body.sourceRef || null,
        stage: req.body.stage || 'in_progress',
        priority: req.body.priority || 'medium',
        assignedToUserId: req.body.assignedToUserId || null,
        informedUserIds: req.body.informedUserIds || [],
      });

      const ticket = await storage.createActionTicket(validated);
      res.status(201).json(ticket);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating action ticket:", error);
      res.status(500).json({ message: "Failed to create action ticket" });
    }
  });

  app.patch('/api/action-tickets/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(id);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!hasPermission(req, 'editTickets')) {
        return res.status(403).json({ message: "Permission denied", permission: "editTickets" });
      }

      const allowedFields = ['stage', 'priority', 'title', 'description', 'assignedToUserId', 'informedUserIds'] as const;
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const ownerId = getOwnerIdForBrands(req);
      if (updates.assignedToUserId) {
        const assignedUser = await storage.getUser(updates.assignedToUserId);
        if (!assignedUser) {
          return res.status(400).json({ message: "Assigned user not found" });
        }
        const isMember = await storage.getTeamMemberByUserId(updates.assignedToUserId);
        if (updates.assignedToUserId !== ownerId && (!isMember || isMember.accountOwnerId !== ownerId)) {
          return res.status(400).json({ message: "User is not on your team" });
        }
      }

      if (updates.informedUserIds && Array.isArray(updates.informedUserIds)) {
        const teamMembers = await storage.getTeamMembersByOwner(ownerId);
        const validIds = new Set([ownerId, ...teamMembers.map(m => m.userId)]);
        for (const id of updates.informedUserIds) {
          if (!validIds.has(id)) {
            return res.status(400).json({ message: "Informed user is not on your team" });
          }
        }
      }

      const updated = await storage.updateActionTicket(id, updates);
      res.json(updated);

      (async () => {
        try {
          const { sendTicketAssignedEmail, sendTicketUpdateEmail } = await import('./services/email-service');
          const changerUser = await storage.getUser(userId);
          const changerName = changerUser ? `${changerUser.firstName || ''} ${changerUser.lastName || ''}`.trim() || changerUser.email || 'Someone' : 'Someone';
          const brandName = brand?.domain || 'your brand';

          if (req.body.assignedToUserId && req.body.assignedToUserId !== ticket.assignedToUserId) {
            const assignedUser = await storage.getUser(req.body.assignedToUserId);
            if (assignedUser?.email && assignedUser.id !== userId) {
              await sendTicketAssignedEmail({
                to: assignedUser.email,
                assigneeName: `${assignedUser.firstName || ''} ${assignedUser.lastName || ''}`.trim() || 'there',
                ticketTitle: ticket.title,
                brandName,
                assignedBy: changerName,
              });
            }
          }

          if (req.body.stage && req.body.stage !== ticket.stage) {
            const notifyIds = new Set<string>();
            if (ticket.userId) notifyIds.add(ticket.userId);
            if (ticket.assignedToUserId) notifyIds.add(ticket.assignedToUserId);
            if (ticket.informedUserIds) ticket.informedUserIds.forEach(id => notifyIds.add(id));
            notifyIds.delete(userId);

            for (const nId of notifyIds) {
              const nUser = await storage.getUser(nId);
              if (nUser?.email) {
                await sendTicketUpdateEmail({
                  to: nUser.email,
                  recipientName: `${nUser.firstName || ''} ${nUser.lastName || ''}`.trim() || 'there',
                  ticketTitle: ticket.title,
                  brandName,
                  changeDescription: `Stage changed from "${ticket.stage}" to "${req.body.stage}"`,
                  changedBy: changerName,
                });
              }
            }
          }
        } catch (emailErr) {
          console.error('Failed to send ticket update emails:', emailErr);
        }
      })();
    } catch (error) {
      console.error("Error updating action ticket:", error);
      res.status(500).json({ message: "Failed to update action ticket" });
    }
  });

  app.delete('/api/action-tickets/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(id);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!hasPermission(req, 'deleteTickets')) {
        return res.status(403).json({ message: "Permission denied", permission: "deleteTickets" });
      }
      await storage.deleteActionTicket(id);
      res.json({ message: "Ticket deleted successfully" });
    } catch (error) {
      console.error("Error deleting action ticket:", error);
      res.status(500).json({ message: "Failed to delete action ticket" });
    }
  });

  app.post('/api/action-tickets/:id/reject', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(id);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updated = await storage.updateActionTicket(id, {
        rejectedAt: new Date(),
        stage: 'archived',
      });
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting action ticket:", error);
      res.status(500).json({ message: "Failed to reject action ticket" });
    }
  });

  app.get('/api/action-tickets/:id/comments', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await storage.getActionCommentsByTicket(ticketId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post('/api/action-tickets/:id/comments', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      const userId = getUserId(req);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const user = await storage.getUser(userId);
      const userName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown'
        : 'Unknown';

      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ message: "Content is required" });
      }

      const validated = insertActionCommentSchema.parse({
        ticketId,
        userId,
        userName,
        content,
      });

      const comment = await storage.createActionComment(validated);
      res.status(201).json(comment);

      (async () => {
        try {
          const { sendTicketUpdateEmail, sendMentionEmail, getBaseUrl } = await import('./services/email-service');
          const brandName = brand?.domain || 'your brand';
          const ticketUrl = `${getBaseUrl()}/actions`;

          const mentionNames: string[] = [];
          const bracketPattern = /@\[([^\]]+)\]/g;
          const simplePattern = /@([\w'-]+)/g;
          let match;
          while ((match = bracketPattern.exec(content)) !== null) {
            mentionNames.push(match[1].toLowerCase());
          }
          const bracketMentionCount = mentionNames.length;
          while ((match = simplePattern.exec(content)) !== null) {
            const captured = match[1].toLowerCase();
            if (!mentionNames.includes(captured)) {
              mentionNames.push(captured);
            }
          }

          console.log(`[Mention] Comment content: "${content.substring(0, 200)}"`);
          console.log(`[Mention] Extracted names (${mentionNames.length}): ${JSON.stringify(mentionNames)} (${bracketMentionCount} bracket, ${mentionNames.length - bracketMentionCount} simple)`);

          const ownerId = brand?.userId || userId;
          const teamMembers = await storage.getTeamMembersByOwner(ownerId);
          const allUserIds = new Set<string>([ownerId]);
          for (const m of teamMembers) allUserIds.add(m.userId);

          console.log(`[Mention] Team pool: ${allUserIds.size} users (owner + ${teamMembers.length} members)`);

          const mentionedUserIds = new Set<string>();
          if (mentionNames.length > 0) {
            for (const uid of allUserIds) {
              const u = await storage.getUser(uid);
              if (!u) continue;
              const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
              const firstName = (u.firstName || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              for (const name of mentionNames) {
                if (name === fullName || name === firstName || name === email) {
                  console.log(`[Mention] Matched "${name}" to user ${uid} (${fullName || email})`);
                  mentionedUserIds.add(uid);
                }
              }
            }
          }

          if (mentionedUserIds.size === 0 && mentionNames.length > 0) {
            console.log(`[Mention] No users matched for mentions: ${JSON.stringify(mentionNames)}`);
          }

          for (const mId of mentionedUserIds) {
            if (mId === userId) {
              console.log(`[Mention] Skipping self-mention for user ${mId}`);
              continue;
            }
            const mUser = await storage.getUser(mId);
            if (mUser?.email) {
              console.log(`[Mention] Sending mention email to ${mUser.email}`);
              await sendMentionEmail({
                to: mUser.email,
                recipientName: `${mUser.firstName || ''} ${mUser.lastName || ''}`.trim() || 'there',
                mentionedBy: userName,
                ticketTitle: ticket.title,
                brandName,
                commentText: content.substring(0, 500),
                ticketUrl,
              });
            } else {
              console.log(`[Mention] User ${mId} has no email, skipping`);
            }
          }

          const notifyIds = new Set<string>();
          if (ticket.userId) notifyIds.add(ticket.userId);
          if (ticket.assignedToUserId) notifyIds.add(ticket.assignedToUserId);
          if (ticket.informedUserIds) ticket.informedUserIds.forEach(id => notifyIds.add(id));
          notifyIds.delete(userId);
          for (const mId of mentionedUserIds) notifyIds.delete(mId);

          for (const nId of notifyIds) {
            const nUser = await storage.getUser(nId);
            if (nUser?.email) {
              await sendTicketUpdateEmail({
                to: nUser.email,
                recipientName: `${nUser.firstName || ''} ${nUser.lastName || ''}`.trim() || 'there',
                ticketTitle: ticket.title,
                brandName,
                changeDescription: `New comment by ${userName}: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
                changedBy: userName,
              });
            }
          }
        } catch (emailErr) {
          console.error('Failed to send comment notification emails:', emailErr);
        }
      })();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.delete('/api/action-comments/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);

      const comment = await storage.getActionComment(id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteActionComment(id);
      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.post('/api/action-tickets/:id/suggest-fix', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getActionTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const brand = await storage.getBrand(ticket.brandId);
      if (!brand || !checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const brandDomain = brand.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'unknown';
      const brandPositioning = brand.brandPositioning || '';
      const category = brand.category || '';
      const targetAudience = brand.targetAudience || '';

      const { previousSuggestion, revisionRequest } = req.body || {};
      const isRevision = !!(previousSuggestion && revisionRequest);

      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      let prompt: string;

      if (isRevision) {
        prompt = `You are a senior digital marketing strategist revising a previous fix suggestion for a brand based on user feedback.

BRAND CONTEXT:
- Website: ${brandDomain}
- Category: ${category}
- Positioning: ${brandPositioning}
- Target audience: ${targetAudience}

ORIGINAL TICKET:
Title: ${ticket.title}
Description: ${ticket.description || 'No description provided.'}

PREVIOUS SUGGESTION:
${previousSuggestion}

USER REVISION REQUEST:
${revisionRequest}

Revise the previous suggestion based on the user's feedback. Keep what was good, adjust what was requested.

OUTPUT FORMAT RULES (CRITICAL — follow exactly):
- Return production-ready content that can be copied and pasted directly into a CMS, HTML file, or developer handoff document.
- Use HTML formatting for rich text: <h3> for section headings, <p> for paragraphs, <ul>/<li> for lists, <code> for inline code, <pre> for code blocks.
- Do NOT use markdown syntax. No **, no ##, no ---, no backtick fences.
- For code blocks use: <pre><code>the code here</code></pre>
- Content must be final and production-ready — not a draft or outline.
- Write in the brand's tone of voice based on what you find on their website.
- Only include verified facts from Google Search. If something cannot be verified, state that clearly.`;
      } else {
        prompt = `You are a senior digital marketing strategist generating production-ready fix content for a brand. Use real data from their website to create content that matches their existing tone of voice.

BRAND CONTEXT:
- Website: ${brandDomain}
- Category: ${category}
- Positioning: ${brandPositioning}
- Target audience: ${targetAudience}

TICKET TO FIX:
Title: ${ticket.title}
Description: ${ticket.description || 'No description provided.'}
Source: ${ticket.source}
Priority: ${ticket.priority}

INSTRUCTIONS:
1. Search the brand's website (${brandDomain}) to understand their current tone of voice, writing style, and existing content
2. Generate specific, production-ready fix content — not a draft, not an outline
3. Match the brand's existing tone — if they are formal, be formal; if conversational, be conversational
4. Use real data found on their actual website (real company name, real addresses, real product names)
5. If the ticket is about schema markup, generate the complete JSON-LD code ready to paste into their HTML
6. If about meta descriptions, write the final meta descriptions ready to use
7. If about content gaps, write the actual content paragraphs in their voice
8. If about authority signals, generate specific markup using their real team/about page data
9. If about performance, give specific technical fixes for their actual tech stack

OUTPUT FORMAT RULES (CRITICAL — follow exactly):
- Return production-ready content that can be copied and pasted directly into a CMS, HTML file, or developer handoff document.
- Use HTML formatting for rich text: <h3> for section headings, <p> for paragraphs, <ul>/<li> for lists, <code> for inline code, <pre> for code blocks.
- Do NOT use markdown syntax. No **, no ##, no ---, no backtick fences.
- For code blocks use: <pre><code>the code here</code></pre>
- Structure your response with these sections:
  <h3>What Needs to Change</h3> — Brief explanation of the issue and fix
  <h3>Production-Ready Content</h3> — The actual code/copy to implement, ready to paste
  <h3>Where to Place This</h3> — Specific pages or file locations
  <h3>Expected Impact</h3> — What this improves for AI visibility

IMPORTANT: Only include facts and data you can verify through Google Search grounding. If you cannot find specific information about the brand's website, explicitly state what you could not verify rather than inventing details.`;
      }

      let text: string;
      if (isFakeAiEnabled()) {
        await fakeAiSleep();
        maybeThrowFakeAiError("fix suggestion");
        text = fakeFixSuggestion(ticket.title, brandDomain);
      } else {
        const response = await executeAiCall(
          { userId: getOwnerIdForBrands(req), brandId: ticket.brandId, feature: "suggest_fix" },
          "gemini",
          "gemini-3.1-pro-preview",
          () => client.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: prompt,
            config: { temperature: 0.3, tools: [{ googleSearch: {} }] },
          }),
          usageFromGemini,
          { expectedMeters: [GEMINI_SEARCH_QUERY_METER] },
        );

        if (typeof response.text === "function") {
          const result = response.text();
          text = result instanceof Promise ? await result : result;
        } else {
          text = String((response as any).text ?? "");
        }
      }

      if (!text || text.trim().length === 0) {
        return res.status(500).json({ message: "AI returned empty response" });
      }

      res.json({ suggestion: text.trim() });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error generating fix suggestion:", error);
      res.status(500).json({ message: "Failed to generate fix suggestion" });
    }
  });

  app.post('/api/brands/:id/action-tickets/generate', isAuthenticated, ensureAiJobAdmission, async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const brand = await storage.getBrand(brandId);

      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const userId = getOwnerIdForBrands(req);
      if (!checkBrandOwnership(req, brand)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { ensureFreshData } = await import('./services/data-freshness');
      const freshData = await ensureFreshData(brandId, storage);

      const { generateActionTickets } = await import('./services/ticket-generator');
      const result = await generateActionTickets(brandId, userId, storage, freshData);
      res.json({ ...result, dataRefreshed: freshData.dataRefreshed });
    } catch (error) {
      if (sendAiUsageCapError(res, error)) return;
      console.error("Error generating action tickets:", error);
      res.status(500).json({ message: "Failed to generate action tickets" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

interface GeneratedQuestion {
  question: string;
  questionType: "awareness" | "consideration" | "commercial";
}

async function generateAllQuestions(
  termText: string,
  brand: any,
  questionsPerTerm: number = 6,
  usage?: AiUsageContext,
): Promise<{ userQuestions: GeneratedQuestion[]; brandSentiment: GeneratedQuestion[] }> {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const { getBrandDisplayName } = await import("./prompt-builder");
  const brandName = brand ? getBrandDisplayName(brand) : "the brand";

  const territory = brand?.territory || null;
  const location = brand?.location || null;
  const products = brand?.products || null;
  const differentiators = brand?.differentiators || null;
  const brandTone = brand?.brandTone || null;
  const category = brand?.category || null;
  const targetAudience = brand?.targetAudience || null;

  const brandContextLines = brand ? [
    `- Domain: ${brand.domain}`,
    `- Brand name: ${brandName}`,
    category ? `- Category: ${category}` : null,
    targetAudience ? `- Target audience: ${targetAudience}` : null,
    brand.problemStatement ? `- Problem they solve: ${brand.problemStatement}` : null,
    brand.brandPositioning ? `- Positioning: ${brand.brandPositioning}` : null,
    products ? `- Products/Services: ${products}` : null,
    differentiators ? `- Key differentiators: ${differentiators}` : null,
    (brand.competitors || []).length > 0 ? `- Competitors: ${brand.competitors.join(", ")}` : null,
    territory ? `- Territory: ${territory}` : null,
    location ? `- Location: ${location}` : null,
    brandTone ? `- Brand tone: ${brandTone}` : null,
  ].filter(Boolean) : [];

  const brandContext = brandContextLines.length > 0 ? `\nBrand context:\n${brandContextLines.join("\n")}` : "";

  const isRegional = territory === "regional";
  const isNational = territory === "national";

  const qPerSet = Math.max(1, Math.floor(questionsPerTerm / 2));

  let locationInstructions = "";
  if (location && isRegional) {
    locationInstructions = `
IMPORTANT — REGIONAL CONTEXT:
This brand operates locally in ${location}. Generate questions that a real user in ${location} would type — the way someone would search for a local business or service near them.
- For userQuestions: include location-specific phrasing (e.g. "in ${location}" or "near ${location}") in at least ${Math.min(2, qPerSet)} of the ${qPerSet} questions.
- For brandSentiment: include location context where natural (e.g. "Is ${brandName} good for businesses in ${location}?").`;
  } else if (location && isNational) {
    locationInstructions = `
GEOGRAPHIC CONTEXT:
This brand operates nationally in the ${location} market. Generate questions that someone in ${location} would realistically type.
- For userQuestions: include "${location}" or "${location}-based" phrasing in at least 1 of the ${qPerSet} questions to reflect the user's market.
- For brandSentiment: reference the ${location} market where natural.`;
  } else if (location) {
    locationInstructions = `
GEOGRAPHIC CONTEXT:
This brand serves customers in ${location}. Where relevant, include ${location} context in questions to reflect the user's perspective.`;
  } else {
    locationInstructions = `
GEOGRAPHIC CONTEXT:
No specific location is set. Keep questions geographically neutral.`;
  }

  const funnelStages2 = ["awareness", "commercial"];
  const funnelStages3 = ["awareness", "consideration", "commercial"];
  const stages = qPerSet <= 2 ? funnelStages2 : funnelStages3;
  const stagesLabel = stages.join(", ");

  const stageDescDiscovery = stages.map(s => {
    if (s === "awareness") return `- awareness: A question about the challenge or problem described in the key term, from someone experiencing it. They don't know solutions exist yet.`;
    if (s === "consideration") return `- consideration: A question comparing approaches or types of solutions for the specific scenario in the key term. NOT about specific brands.`;
    return `- commercial: A purchase-intent question from a buyer in the exact scenario described by the key term.`;
  }).join("\n");

  const stageDescSentiment = stages.map(s => {
    if (s === "awareness") return `- awareness: Test if the AI knows what ${brandName} does in the context of "${termText}"`;
    if (s === "consideration") return `- consideration: Test if the AI recommends ${brandName} when someone asks about "${termText}"`;
    return `- commercial: Test if the AI suggests ${brandName} as a purchase choice for the scenario in "${termText}"`;
  }).join("\n");

  const jsonUserExamples = stages.map(s => `    {"question": "...", "type": "${s}"}`).join(",\n");
  const jsonBrandExamples = stages.map(s => `    {"question": "...", "type": "${s}"}`).join(",\n");

  const prompt = `You are generating questions to test a brand's visibility in AI assistant responses. We need TWO distinct types of questions.

KEY TERM (this is the PRIMARY topic — ALL questions must be directly relevant to this):
"${termText}"

BRAND CONTEXT (for background understanding only):
${brandContext}
${locationInstructions}

SET 1 — "userQuestions" (Discovery Questions):
These simulate real people${location ? ` in ${location}` : ""} typing questions into an AI assistant. ALL ${qPerSet} questions must be directly about the topic in the key term "${termText}".

The key term defines the subject matter. If the key term mentions a specific industry (e.g. "recruitment"), ALL questions must be about that industry. If the key term mentions a specific use case (e.g. "lead scoring"), ALL questions must relate to that use case. Do NOT wander into other industries or verticals not mentioned in the key term.

Write ${qPerSet} questions — one per funnel stage — all tightly focused on "${termText}":

${stageDescDiscovery}

RULES FOR DISCOVERY QUESTIONS:
1. ZERO brand names — not "${brandName}", not any competitor name, not any vendor name
2. ZERO branded product or feature names from any vendor
3. ALL ${qPerSet} questions must be about the topic in "${termText}" — do NOT generate questions about unrelated industries or use cases
4. DO use common industry terminology (e.g. "lead scoring", "email campaigns", "campaign automation") — just not branded feature names
5. Each question should explore a different angle of the SAME topic (different funnel stage, not different topic)
6. Questions should sound like what a real person would type into ChatGPT or Google

SET 2 — "brandSentiment" (Brand Questions):
These questions test whether AI models know about ${brandName} specifically in the context of "${termText}". Every question MUST include "${brandName}" by name. One per funnel stage:
${products ? `\nThe brand offers: ${products}. Reference specific products/capabilities relevant to "${termText}".` : ""}

${stageDescSentiment}

Return ONLY this JSON (no markdown, no fences):
{
  "userQuestions": [
${jsonUserExamples}
  ],
  "brandSentiment": [
${jsonBrandExamples}
  ]
}

Rules:
- Discovery questions: 10-25 words, natural and conversational. They must NEVER contain "${brandName}", any competitor name, or any branded product/feature names. They MUST all be about the topic in "${termText}".
- Brand questions: 8-18 words, MUST include "${brandName}" in every question. MUST relate to "${termText}".
- Each question explores a different funnel stage of the SAME topic — not different topics
- EXACTLY 1 of each funnel stage per set (${stagesLabel})
- Do NOT just rephrase the key term as a question — think about real people in real scenarios related to that topic`;

  if (isFakeAiEnabled()) {
    await fakeAiSleep();
    maybeThrowFakeAiError("question generation");
    const fake = fakeGeneratedQuestions(
      termText,
      brandName,
      stages as Array<"awareness" | "consideration" | "commercial">,
    );
    return { userQuestions: fake.userQuestions, brandSentiment: fake.brandSentiment };
  }

  let text = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await executeAiCall(
        usage ?? (brand?.userId
          ? { userId: brand.userId, brandId: brand.id ?? null, feature: "question_generation" }
          : undefined),
        "gemini",
        "gemini-3.1-pro-preview",
        () => client.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        }),
        usageFromGemini,
        { expectedMeters: [GEMINI_SEARCH_QUERY_METER] },
      );
      text = response.text?.trim() || "";
      if (text) break;
    } catch (err: any) {
      if (isAiUsageCapExceededError(err)) throw err;
      console.error(`Question generation attempt ${attempt + 1} failed:`, err?.message);
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  const categoryLabel = category || "this type of solution";
  const audienceLabel = targetAudience || "businesses";
  const allUserFallbacks: GeneratedQuestion[] = [
    { question: products ? `How does ${products.split(",")[0].trim()} help ${audienceLabel}?` : `How does ${categoryLabel} help ${audienceLabel} solve their challenges?`, questionType: "awareness" },
    { question: products ? `What ${categoryLabel} tools offer ${products.split(",")[0].trim()}?` : `What are the leading ${categoryLabel} solutions for ${audienceLabel}?`, questionType: "consideration" },
    { question: `Which ${categoryLabel} solution is best for ${audienceLabel}?`, questionType: "commercial" },
  ];
  const allSentimentFallbacks: GeneratedQuestion[] = [
    { question: `What does ${brandName} do and who is it for?`, questionType: "awareness" },
    { question: `How does ${brandName} compare to other ${categoryLabel} solutions?`, questionType: "consideration" },
    { question: `Should ${audienceLabel} choose ${brandName} for ${categoryLabel}?`, questionType: "commercial" },
  ];
  const userFallback = allUserFallbacks.filter(q => stages.includes(q.questionType));
  const sentimentFallback = allSentimentFallbacks.filter(q => stages.includes(q.questionType));

  if (!text) return { userQuestions: userFallback, brandSentiment: sentimentFallback };

  try {
    const cleaned = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    const typeMap: Record<string, "awareness" | "consideration" | "commercial"> = {
      awareness: "awareness", consideration: "consideration", commercial: "commercial",
    };

    const mapQuestions = (arr: any[]): GeneratedQuestion[] => {
      if (!Array.isArray(arr) || arr.length === 0) return [];
      return arr.slice(0, qPerSet).map((item: any) => ({
        question: String(item.question || item).trim(),
        questionType: typeMap[item.type] || "consideration",
      })).filter(q => q.question);
    };

    let uq = mapQuestions(parsed.userQuestions);
    const bs = mapQuestions(parsed.brandSentiment);

    const brandNameLower = brandName.toLowerCase();
    const brandDomainLower = (brand?.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(".")[0].toLowerCase();
    const competitorTerms: string[] = [];
    for (const c of (brand?.competitors || []) as string[]) {
      const cleaned = c.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const domainRoot = cleaned.split(".")[0].toLowerCase();
      if (domainRoot.length > 2) competitorTerms.push(domainRoot);
      const fullDomain = cleaned.toLowerCase();
      if (fullDomain.length > 2 && fullDomain !== domainRoot) competitorTerms.push(fullDomain);
    }
    const allBrandTerms = [brandNameLower, brandDomainLower, ...competitorTerms].filter(t => t.length > 2);
    const uniqueBrandTerms = [...new Set(allBrandTerms)];

    uq = uq.filter(q => {
      const qLower = q.question.toLowerCase();
      return !uniqueBrandTerms.some(term => qLower.includes(term));
    });

    if (uq.length === 0) {
      console.warn(`All generated userQuestions contained brand/competitor names — using fallback for "${brandName}"`);
      uq = userFallback;
    }

    const validBs = bs.length > 0 && bs.every(q => q.question.toLowerCase().includes(brandNameLower));

    return {
      userQuestions: uq,
      brandSentiment: validBs ? bs : sentimentFallback,
    };
  } catch {
    console.error("Failed to parse combined question generation response:", text);
    return { userQuestions: userFallback, brandSentiment: sentimentFallback };
  }
}
