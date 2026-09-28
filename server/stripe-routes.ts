import type { Express, Request, Response } from "express";
import type Stripe from "stripe";
import type { Invoice, Subscription } from "@shared/schema";
import { createHash } from "node:crypto";
import { storage } from "./storage";
import { isAuthenticated, isAdmin, getAccountOwnerId } from "./localAuth";
import {
  getStripe,
  isStripeConfigured,
  getStripeMode,
  getWebhookSecret,
  resolvePriceId,
  seedStripeProductsAndPrices,
  buildSeedItems,
  planLookupKey,
  addonLookupKey,
  type PriceLookupKey,
} from "./stripe";
import {
  PLAN_CONFIG,
  ADDON_CONFIG,
  getPlanConfig,
  getAddonConfig,
  type PlanKey,
  type AddonType,
} from "./plans";
import {
  sendInvoicePaidEmail,
  sendInvoicePaymentFailedEmail,
  sendPaymentSetupRequiredEmail,
  getBaseUrl,
} from "./services/email-service";
import { hasComplimentaryAccess } from "./privileged-accounts";
import { pool } from "./db";
import {
  getStripeSubscriptionPolicy,
  shouldRestoreTrialAfterStripeDeletion,
} from "./services/stripe-subscription-policy";

// Plans accepted by the public Stripe routes (`/api/billing/checkout`,
// `/api/billing/stripe/change-plan`). The May 2026 pricing model uses the
// `_v2` and `accelerate` keys; the legacy `starter`/`growth` keys remain so
// existing customers can still resolve their lookup_keys when their Stripe
// subscription is reconciled. `enterprise` (Custom) and Agency are
// contact-sales only and never go through self-serve checkout.
const PLAN_KEYS: PlanKey[] = ["starter", "growth", "starter_v2", "growth_v2", "accelerate"];
const ADDON_KEYS: AddonType[] = [
  "extra_brand",
  "competitor_pack",
  "extra_user",
  "topic_prompt_pack",
  "change_alerts_pack",
  // Legacy add-on retained so already-purchased packs can still be cancelled
  // / quantity-updated; not offered to new customers in the UI.
  "key_terms_pack",
];

class StripeCheckoutConflictError extends Error {}

// Privileged-organization staff and a small allow-list get complimentary
// unlimited access. They never go through Stripe — every billing route
// short-circuits with a friendly response and (where it makes sense) updates
// the local subscription/add-on records directly.
export async function isComplimentaryUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user) return false;
  // Accounts an admin has explicitly flagged for manual (off-Stripe) billing
  // are treated as complimentary so every Stripe billing route short-circuits.
  const sub = await storage.getSubscriptionByUserId(userId);
  if (sub?.manualBilling) return true;
  return hasComplimentaryAccess(user);
}

export async function grantComplimentaryEnterprise(userId: string, plan: PlanKey = "growth", interval: "monthly" | "annual" = "annual") {
  const planConfig = getPlanConfig(plan);
  const existing = await storage.getSubscriptionByUserId(userId);
  const now = new Date();
  const farFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000 * 10); // +10 years
  const data = {
    userId,
    plan,
    billingInterval: interval,
    status: "active" as const,
    monthlyAmount: 0,
    annualAmount: 0,
    currency: "GBP",
    billingPeriodStart: now,
    billingPeriodEnd: farFuture,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    // Clear any legacy Stripe linkage so complimentary rows never accidentally
    // route subsequent requests through Stripe.
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeSubscriptionItemId: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialUpdatedAt: null,
    trialUpdatedBy: null,
  };
  if (existing) {
    const updated = await storage.updateSubscription(existing.id, data);
    const user = await storage.getUser(userId);
    if (user?.accountType === "admin_provisioned") {
      await storage.updateUser(userId, { accountType: "standard" });
    }
    return updated;
  }
  return storage.createSubscription(data);
}

function appBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return `${proto}://${host}`;
}

async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { userId: user.id },
  }, { idempotencyKey: `aeostars-customer-${user.id}` });
  await storage.updateUser(user.id, { stripeCustomerId: customer.id });
  return customer.id;
}

function priceKeyForPlan(plan: PlanKey, interval: "monthly" | "annual"): PriceLookupKey {
  return planLookupKey(plan, interval);
}

function priceKeyForAddon(addon: AddonType, interval: "monthly" | "annual"): PriceLookupKey {
  return addonLookupKey(addon, interval);
}

// ---------------------------------------------------------------------------
// Customer Portal configuration
// ---------------------------------------------------------------------------
// We programmatically ensure the portal lets customers update their billing
// address and tax IDs (required for Stripe Tax / VAT compliance). The
// configuration is created once per process and cached. If a configuration
// with our marker metadata already exists on the account it is reused.

const PORTAL_CONFIG_MARKER = "aeostars_vat_v1";
let cachedPortalConfigId: string | null = null;

async function ensurePortalConfiguration(): Promise<string | null> {
  if (cachedPortalConfigId) return cachedPortalConfigId;
  try {
    const stripe = getStripe();
    const list = await stripe.billingPortal.configurations.list({ limit: 100 });
    const existing = list.data.find(
      (c) => c.metadata?.aeostars_marker === PORTAL_CONFIG_MARKER,
    );
    if (existing) {
      cachedPortalConfigId = existing.id;
      return existing.id;
    }
    const created = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "AEOSTARS billing",
      },
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["address", "name", "email", "phone", "tax_id"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: {
            enabled: true,
            options: [
              "too_expensive",
              "missing_features",
              "switched_service",
              "unused",
              "other",
            ],
          },
        },
      },
      metadata: { aeostars_marker: PORTAL_CONFIG_MARKER },
    });
    cachedPortalConfigId = created.id;
    return created.id;
  } catch (err) {
    // If configuration management fails (e.g. permissions), fall back to the
    // account's default portal configuration so the portal still opens.
    console.warn("[stripe] Failed to ensure portal configuration:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook handler — verifies signature using req.rawBody captured globally
// in server/index.ts (express.json's `verify` callback).
// ---------------------------------------------------------------------------

// Module-level timestamp of the most recent successfully-verified Stripe
// webhook delivery. Surfaced through GET /api/admin/stripe/health so admins
// can confirm the webhook endpoint is wired up correctly in the Dashboard.
let lastWebhookReceivedAt: number | null = null;

// In-process cache for the public /api/billing/prices endpoint. Keeps the
// marketing pages snappy and avoids hitting Stripe on every page view.
const PRICES_CACHE_TTL_MS = 60_000;
let pricesCache: { fetchedAt: number; payload: unknown } | null = null;

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!isStripeConfigured()) {
    return res.status(503).send("Stripe is not configured");
  }
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  const raw = req.rawBody;
  if (!raw) {
    console.error("[stripe-webhook] Missing rawBody — cannot verify signature");
    return res.status(400).send("Missing raw body");
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig as string, getWebhookSecret());
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  lastWebhookReceivedAt = Date.now();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncLatestStripeSubscription((event.data.object as Stripe.Subscription).id);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await onInvoiceUpserted(event.data.object as Stripe.Invoice, "paid");
        break;
      case "invoice.payment_failed":
        await onInvoiceUpserted(event.data.object as Stripe.Invoice, "overdue");
        break;
      default:
        // Acknowledge unhandled events
        break;
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, err);
    res.status(500).json({ error: err.message });
  }
}

async function findUserIdForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const user = await storage.getUserByStripeCustomerId(customerId);
  return user?.id ?? null;
}

function intervalFromStripe(stripeInterval: string | undefined): "monthly" | "annual" {
  return stripeInterval === "year" ? "annual" : "monthly";
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription" || !session.subscription) return;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  await syncLatestStripeSubscription(subId);
}

async function syncLatestStripeSubscription(stripeSubscriptionId: string) {
  const initialStripeSub = await getStripe().subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  const customerId = typeof initialStripeSub.customer === "string"
    ? initialStripeSub.customer
    : initialStripeSub.customer.id;
  const userId = await findUserIdForCustomer(customerId);
  if (!userId) {
    console.warn(`[stripe-webhook] No user found for customer ${customerId}`);
    return;
  }

  await withStripeAccountLock(userId, async () => {
    // Re-fetch after waiting for the lock. A newer event may have changed the
    // Stripe object while this delivery was queued.
    const latestStripeSub = await getStripe().subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    await upsertStripeSubscription(latestStripeSub, userId);
  });
}

async function withStripeAccountLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    await lockClient.query(
      "SELECT pg_advisory_lock(hashtext('stripe-subscription'), hashtext($1))",
      [userId],
    );
    locked = true;
    return await action();
  } finally {
    try {
      if (locked) {
        await lockClient.query(
          "SELECT pg_advisory_unlock(hashtext('stripe-subscription'), hashtext($1))",
          [userId],
        );
      }
    } finally {
      lockClient.release();
    }
  }
}

async function upsertStripeSubscription(stripeSub: Stripe.Subscription, userId: string) {

  // Find the plan item (the one whose price has metadata.type=plan)
  let planKey: PlanKey = "starter";
  let planItem: Stripe.SubscriptionItem | undefined;
  let planInterval: "monthly" | "annual" = "monthly";
  const addonItems: Array<{ item: Stripe.SubscriptionItem; addon: AddonType; interval: "monthly" | "annual" }> = [];

  for (const item of stripeSub.items.data) {
    const price = item.price;
    const meta = price.metadata ?? {};
    const interval = intervalFromStripe(price.recurring?.interval);
    if (meta.type === "plan" && meta.plan) {
      planKey = meta.plan as PlanKey;
      planItem = item;
      planInterval = interval;
    } else if (meta.type === "addon" && meta.addon) {
      addonItems.push({ item, addon: meta.addon as AddonType, interval });
    }
  }

  const planConfig = getPlanConfig(planKey);
  // The 2025-01 Stripe API moved `current_period_start/end` onto subscription
  // items, but older API versions still expose them on the subscription. Read
  // both via a typed shim so we work across versions.
  const ss = stripeSub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const planItemTyped = planItem as (Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  }) | null;
  const periodStartUnix =
    ss.current_period_start ?? planItemTyped?.current_period_start ?? Math.floor(Date.now() / 1000);
  const periodEndUnix =
    ss.current_period_end ?? planItemTyped?.current_period_end ?? periodStartUnix;
  const periodStart = new Date(periodStartUnix * 1000);
  const periodEnd = new Date(periodEndUnix * 1000);

  const status =
    stripeSub.status === "active" || stripeSub.status === "trialing"
      ? "active"
      : stripeSub.status === "past_due"
        ? "past_due"
        : stripeSub.status === "canceled" || stripeSub.status === "incomplete_expired"
           ? "cancelled"
           : "suspended";

  const existing = await storage.getSubscriptionByUserId(userId);
  const policy = getStripeSubscriptionPolicy(stripeSub.status, {
    hasSubscription: !!existing,
    hasTrial: !!existing?.trialEndsAt,
  });
  if (!policy.shouldPersistLocally) return;

  const { activatesPaidAccess, preservesExistingTrial } = policy;
  const subData = {
    userId,
    plan: preservesExistingTrial ? existing!.plan : planKey,
    billingInterval: preservesExistingTrial ? existing!.billingInterval : planInterval,
    status: preservesExistingTrial ? "incomplete" : status,
    monthlyAmount: preservesExistingTrial ? existing!.monthlyAmount : (planConfig.monthlyAmount ?? 0),
    annualAmount: preservesExistingTrial ? existing!.annualAmount : (planConfig.annualAmount ?? 0),
    currency: preservesExistingTrial ? existing!.currency : "GBP",
    billingPeriodStart: preservesExistingTrial ? existing!.billingPeriodStart : periodStart,
    billingPeriodEnd: preservesExistingTrial ? existing!.billingPeriodEnd : periodEnd,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: planItem?.price.id ?? null,
    stripeSubscriptionItemId: planItem?.id ?? null,
    cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end,
    cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : (existing?.cancelledAt ?? null),
    trialStartedAt: activatesPaidAccess ? null : (existing?.trialStartedAt ?? null),
    trialEndsAt: activatesPaidAccess ? null : (existing?.trialEndsAt ?? null),
    trialUpdatedAt: activatesPaidAccess ? null : (existing?.trialUpdatedAt ?? null),
    trialUpdatedBy: activatesPaidAccess ? null : (existing?.trialUpdatedBy ?? null),
  };

  let dbSub;
  if (existing) {
    dbSub = await storage.updateSubscription(existing.id, subData);
  } else {
    dbSub = await storage.createSubscription(subData);
  }

  const user = await storage.getUser(userId);
  if (activatesPaidAccess && user?.accountType === "admin_provisioned") {
    await storage.updateUser(userId, { accountType: "standard" });
  }

  // Do not grant paid add-ons while Checkout is incomplete. Stripe will emit
  // an active subscription update after successful payment and reconcile them.
  if (!activatesPaidAccess) return;

  // Sync addons: mark missing ones cancelled, upsert present ones
  const existingAddons = await storage.getAddonsBySubscriptionId(dbSub.id);
  const seenItemIds = new Set<string>();
  for (const { item, addon, interval } of addonItems) {
    seenItemIds.add(item.id);
    const cfg = getAddonConfig(addon)!;
    const match = existingAddons.find((a) => a.stripeSubscriptionItemId === item.id);
    if (match) {
      await storage.updateAddon(match.id, {
        quantity: item.quantity ?? 1,
        billingInterval: interval,
        monthlyAmount: cfg.monthlyAmount,
        annualAmount: cfg.annualAmount,
        status: "active",
        stripePriceId: item.price.id,
        cancelledAt: null,
      });
    } else {
      await storage.createAddon({
        subscriptionId: dbSub.id,
        userId,
        addonType: addon,
        quantity: item.quantity ?? 1,
        billingInterval: interval,
        monthlyAmount: cfg.monthlyAmount,
        annualAmount: cfg.annualAmount,
        status: "active",
        stripeSubscriptionItemId: item.id,
        stripePriceId: item.price.id,
        cancelledAt: null,
      });
    }
  }
  for (const a of existingAddons) {
    if (a.stripeSubscriptionItemId && !seenItemIds.has(a.stripeSubscriptionItemId) && a.status === "active") {
      await storage.updateAddon(a.id, { status: "cancelled", cancelledAt: new Date() });
    }
  }
}

async function onSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const existing = await storage.getSubscriptionByStripeId(stripeSub.id);
  if (!existing) return;
  await withStripeAccountLock(existing.userId, async () => {
    const current = await storage.getSubscriptionByStripeId(stripeSub.id);
    if (!current) return;
    if (shouldRestoreTrialAfterStripeDeletion(current.trialEndsAt)) {
      await storage.updateSubscription(current.id, {
        status: "active",
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeSubscriptionItemId: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      });
      return;
    }
    await storage.updateSubscription(current.id, {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false,
    });
  });
}

async function onInvoiceUpserted(invoice: Stripe.Invoice, status: "paid" | "overdue") {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await findUserIdForCustomer(customerId);
  if (!userId) return;
  await withStripeAccountLock(userId, async () => {
    // Re-fetch after acquiring the lock so a delayed payment_failed delivery
    // cannot overwrite a newer paid invoice state.
    const latestInvoice = invoice.id
      ? await getStripe().invoices.retrieve(invoice.id, {
          expand: ["parent.subscription_details.subscription"],
        })
      : invoice;
    const stripeSubscription = latestInvoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId = typeof stripeSubscription === "string"
      ? stripeSubscription
      : stripeSubscription?.id;
    if (stripeSubscriptionId) {
      const latestStripeSub = await getStripe().subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["items.data.price"],
      });
      await upsertStripeSubscription(latestStripeSub, userId);
    }

    const sub = await storage.getSubscriptionByUserId(userId);
    if (!sub) return;
    const latestStatus = latestInvoice.status === "paid" ? "paid" : status;
    await upsertStripeInvoice(latestInvoice, latestStatus, userId, sub);
  });
}

async function upsertStripeInvoice(
  invoice: Stripe.Invoice,
  status: "paid" | "overdue",
  userId: string,
  sub: Subscription,
) {

  const existing = invoice.id ? await storage.getInvoiceByStripeId(invoice.id) : undefined;

  const description = invoice.lines?.data
    ?.map((l) => l.description)
    .filter(Boolean)
    .join("; ") || `Stripe invoice ${invoice.number ?? invoice.id}`;

  // Stripe re-delivers webhooks (network blips, manual replays, our own
  // 5xx responses). Gate the branded email on a per-(invoice, status)
  // timestamp so the customer only ever sees one receipt / one failure
  // notice for a given real-world payment.
  const alreadyEmailed =
    status === "paid"
      ? !!existing?.receiptEmailedAt
      : !!existing?.paymentFailedEmailedAt;

  let invoiceRow: Invoice;
  if (existing) {
    invoiceRow = await storage.updateInvoice(existing.id, {
      status,
      amount: invoice.amount_paid || invoice.amount_due || existing.amount,
      stripeHostedInvoiceUrl: invoice.hosted_invoice_url ?? existing.stripeHostedInvoiceUrl,
      stripeInvoicePdfUrl: invoice.invoice_pdf ?? existing.stripeInvoicePdfUrl,
      paidAt: status === "paid" ? (existing.paidAt ?? new Date()) : existing.paidAt,
    });
  } else {
    const invoiceNumber = invoice.number ?? (await storage.getNextInvoiceNumber());
    invoiceRow = await storage.createInvoice({
      subscriptionId: sub.id,
      userId,
      invoiceNumber,
      amount: invoice.amount_paid || invoice.amount_due || 0,
      currency: (invoice.currency || "gbp").toUpperCase(),
      status,
      description,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt: status === "paid" ? new Date() : null,
      stripeInvoiceId: invoice.id ?? null,
      stripeHostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      stripeInvoicePdfUrl: invoice.invoice_pdf ?? null,
    });
  }

  // If payment failed, flag subscription past_due
  if (status === "overdue" && sub.status === "active") {
    await storage.updateSubscription(sub.id, { status: "past_due" });
  }

  if (alreadyEmailed) {
    return;
  }

  // Mark the email as sent BEFORE invoking Resend so a concurrent
  // re-delivery of the same webhook can't slip through and trigger a
  // second send. If the email itself fails we log it; the customer
  // still has the in-app invoice list and Stripe's own emails.
  const emailedAt = new Date();
  await storage.updateInvoice(invoiceRow.id, {
    receiptEmailedAt: status === "paid" ? emailedAt : invoiceRow.receiptEmailedAt,
    paymentFailedEmailedAt:
      status === "overdue" ? emailedAt : invoiceRow.paymentFailedEmailedAt,
  });

  // Branded receipt / failure notification via Resend.
  await sendInvoiceEmailNotification(invoice, status, userId, sub.plan).catch((err) => {
    console.error("[stripe-webhook] Failed to send invoice email:", err);
  });
}

async function sendInvoiceEmailNotification(
  invoice: Stripe.Invoice,
  status: "paid" | "overdue",
  userId: string,
  planKey: string,
) {
  const user = await storage.getUser(userId);
  const billingEmail =
    invoice.customer_email ||
    (typeof invoice.customer === "object" ? (invoice.customer as Stripe.Customer)?.email ?? null : null) ||
    user?.email ||
    null;
  if (!billingEmail) {
    console.warn("[stripe-webhook] No billing email available for invoice", invoice.id);
    return;
  }

  const recipientName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;
  const planConfig = getPlanConfig(planKey);
  const planDisplayName = planConfig.displayName;
  const amountMinor =
    status === "paid"
      ? invoice.amount_paid || invoice.amount_due || 0
      : invoice.amount_due || invoice.amount_remaining || 0;
  const currency = invoice.currency || "gbp";

  // Period: prefer the first line item's period, fall back to invoice period.
  const firstLine = invoice.lines?.data?.[0];
  const periodStartUnix = firstLine?.period?.start ?? invoice.period_start ?? null;
  const periodEndUnix = firstLine?.period?.end ?? invoice.period_end ?? null;
  const periodStart = periodStartUnix ? new Date(periodStartUnix * 1000) : null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  const baseUrl = getBaseUrl();
  const billingPageUrl = `${baseUrl}/billing`;

  if (status === "paid") {
    await sendInvoicePaidEmail({
      to: billingEmail,
      recipientName,
      planDisplayName,
      amountMinor,
      currency,
      periodStart,
      periodEnd,
      invoiceNumber: invoice.number ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      billingPageUrl,
    });
  } else {
    await sendInvoicePaymentFailedEmail({
      to: billingEmail,
      recipientName,
      planDisplayName,
      amountMinor,
      currency,
      invoiceNumber: invoice.number ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      // Customer Portal is the canonical "update payment method" destination.
      // Users must be authenticated to open the portal, so direct them to the
      // billing page which has a "Manage in Stripe" button.
      updatePaymentUrl: billingPageUrl,
    });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerStripeRoutes(app: Express) {
  // Public: tells the frontend which Stripe mode is active
  app.get("/api/billing/stripe/config", (_req, res) => {
    res.json({
      configured: isStripeConfigured(),
      mode: isStripeConfigured() ? getStripeMode() : null,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    });
  });

  // Public: live price catalogue keyed by lookup_key. Used by the marketing
  // pricing page, /select-plan, and /checkout so displayed amounts always
  // match what Stripe will actually charge — no hardcoded £ in the UI.
  // Cached in-process for 60s to avoid hammering the Stripe API on every
  // page view.
  app.get("/api/billing/prices", async (_req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.json({ configured: false, mode: null, prices: {} });
      }

      const now = Date.now();
      if (pricesCache && now - pricesCache.fetchedAt < PRICES_CACHE_TTL_MS) {
        return res.json(pricesCache.payload);
      }

      const stripe = getStripe();
      const lookupKeys = buildSeedItems().map((i) => i.lookupKey);

      // Stripe caps `lookup_keys` at 10 per request, so batch in chunks.
      const prices: Record<
        string,
        {
          unitAmount: number | null;
          currency: string;
          interval: "month" | "year" | null;
          productName: string | null;
        }
      > = {};
      const CHUNK = 10;
      for (let i = 0; i < lookupKeys.length; i += CHUNK) {
        const batch = lookupKeys.slice(i, i + CHUNK);
        const list = await stripe.prices.list({
          lookup_keys: batch,
          active: true,
          limit: 100,
          expand: ["data.product"],
        });
        for (const p of list.data) {
          if (!p.lookup_key) continue;
          const product = typeof p.product === "string" ? null : (p.product as any);
          prices[p.lookup_key] = {
            unitAmount: p.unit_amount,
            currency: p.currency,
            interval: (p.recurring?.interval as "month" | "year" | undefined) ?? null,
            productName: product?.name ?? null,
          };
        }
      }

      const payload = {
        configured: true,
        mode: getStripeMode(),
        prices,
      };
      pricesCache = { fetchedAt: now, payload };
      res.json(payload);
    } catch (err: any) {
      console.error("[stripe] /api/billing/prices failed:", err);
      res.status(500).json({ message: err.message || "Failed to load prices" });
    }
  });

  // Admin-only: idempotent seed of Stripe Products + Prices
  app.post("/api/admin/stripe/seed", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Stripe is not configured for this environment." });
      }
      const result = await seedStripeProductsAndPrices();
      res.json(result);
    } catch (err: any) {
      console.error("[stripe] Seed failed:", err);
      res.status(500).json({ message: err.message || "Seed failed" });
    }
  });

  // Admin-only: at-a-glance Stripe health diagnostic. Reports the active
  // mode, whether all required env vars are set, the public webhook URL the
  // admin needs to register in the Stripe Dashboard, the timestamp of the
  // most recent verified webhook, presence of every expected lookup_key on
  // the Stripe side, and a count of "drifted" subscriptions (active/past_due
  // local subs without a Stripe subscription ID).
  app.get("/api/admin/stripe/health", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const configured = isStripeConfigured();
      const expectedWebhookUrl = `${appBaseUrl(req)}/api/stripe/webhook`;
      const driftCount = await storage.countDriftedSubscriptions();
      const lookupKeys = buildSeedItems().map((i) => i.lookupKey);

      let prices: Array<{ lookupKey: string; priceId: string | null; present: boolean }> = lookupKeys.map(
        (k) => ({ lookupKey: k, priceId: null, present: false }),
      );

      if (configured) {
        try {
          const stripe = getStripe();
          const list = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 });
          const byKey = new Map<string, string>();
          for (const p of list.data) {
            if (p.lookup_key) byKey.set(p.lookup_key, p.id);
          }
          prices = lookupKeys.map((k) => ({
            lookupKey: k,
            priceId: byKey.get(k) ?? null,
            present: byKey.has(k),
          }));
        } catch (err) {
          console.warn("[stripe] health: prices.list failed:", (err as Error).message);
        }
      }

      res.json({
        mode: configured ? getStripeMode() : null,
        configured,
        webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
        expectedWebhookUrl,
        lastWebhookReceivedAt: lastWebhookReceivedAt
          ? new Date(lastWebhookReceivedAt).toISOString()
          : null,
        prices,
        driftCount,
      });
    } catch (err: any) {
      console.error("[stripe] health failed:", err);
      res.status(500).json({ message: err.message || "Health check failed" });
    }
  });

  // Admin-only: reconcile already-drifted accounts. For every active /
  // past_due subscription with no Stripe subscription on file, ensure a
  // Stripe Customer exists, mark the local row as "incomplete", and email
  // the customer a checkout link to complete payment setup. Skips
  // complimentary users.
  app.post("/api/admin/stripe/reconcile", isAuthenticated, isAdmin, async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe is not configured for this environment." });
    }
    let scanned = 0;
    let reconciled = 0;
    let skipped = 0;
    const errors: Array<{ userId: string; message: string }> = [];
    try {
      const drifted = await storage.getDriftedSubscriptions();
      scanned = drifted.length;
      const base = appBaseUrl(req);
      for (const sub of drifted) {
        try {
          if (await isComplimentaryUser(sub.userId)) {
            skipped++;
            continue;
          }
          await ensureStripeCustomer(sub.userId);
          await storage.updateSubscription(sub.id, { status: "incomplete" });
          const user = await storage.getUser(sub.userId);
          const planConfig = getPlanConfig(sub.plan as PlanKey);
          const checkoutUrl = `${base}/checkout?plan=${sub.plan}&interval=${sub.billingInterval}&reconcile=1`;
          if (user?.email) {
            await sendPaymentSetupRequiredEmail({
              to: user.email,
              recipientName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
              planDisplayName: planConfig.displayName,
              checkoutUrl,
            });
          }
          reconciled++;
        } catch (err: any) {
          console.error(`[stripe] reconcile failed for user ${sub.userId}:`, err);
          errors.push({ userId: sub.userId, message: err.message ?? String(err) });
        }
      }
      res.json({ scanned, reconciled, skipped, errors });
    } catch (err: any) {
      console.error("[stripe] reconcile fatal:", err);
      res.status(500).json({ message: err.message || "Reconcile failed", scanned, reconciled, skipped, errors });
    }
  });

  // Create Checkout Session for a new (or replacement) paid subscription
  app.post("/api/billing/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const { plan, billingInterval = "annual", addons = [] } = req.body as {
        plan: PlanKey;
        billingInterval: "monthly" | "annual";
        addons?: Array<{ addonType: AddonType; quantity?: number }>;
      };
      if (!PLAN_KEYS.includes(plan)) {
        return res.status(400).json({ message: "Invalid plan (Enterprise must contact sales)." });
      }
      if (!["monthly", "annual"].includes(billingInterval)) {
        return res.status(400).json({ message: "Invalid billing interval" });
      }

      // Complimentary access for privileged organizations and allowlisted users.
      if (await isComplimentaryUser(userId)) {
        await grantComplimentaryEnterprise(userId, plan, billingInterval);
        const base = appBaseUrl(req);
        return res.json({
          url: `${base}/billing?complimentary=1`,
          complimentary: true,
          message: "Complimentary access granted — no payment required.",
        });
      }

      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payments are not configured. Please contact support." });
      }

      const stripe = getStripe();
      const normalizedAddons = addons
        .filter((addon) => ADDON_KEYS.includes(addon.addonType))
        .map((addon) => ({ addonType: addon.addonType, quantity: Math.max(1, addon.quantity ?? 1) }))
        .sort((a, b) => a.addonType.localeCompare(b.addonType));
      const lineItems: Array<{ price: string; quantity: number }> = [];
      lineItems.push({
        price: await resolvePriceId(priceKeyForPlan(plan, billingInterval)),
        quantity: 1,
      });
      for (const a of normalizedAddons) {
        lineItems.push({
          price: await resolvePriceId(priceKeyForAddon(a.addonType, billingInterval)),
          quantity: a.quantity,
        });
      }

      const base = appBaseUrl(req);
      const checkoutFingerprint = createHash("sha256")
        .update(JSON.stringify({ plan, billingInterval, addons: normalizedAddons }))
        .digest("hex");
      const session = await withStripeAccountLock(userId, async () => {
        const localSub = await storage.getSubscriptionByUserId(userId);
        if (localSub?.stripeSubscriptionId) {
          const stripeSub = await stripe.subscriptions.retrieve(localSub.stripeSubscriptionId);
          if (!['canceled', 'incomplete_expired'].includes(stripeSub.status)) {
            throw new StripeCheckoutConflictError("A Stripe subscription already exists for this account");
          }
        }

        // Customer creation is inside the same lock so two initial checkout
        // requests cannot create separate Stripe customers for one account.
        const customerId = await ensureStripeCustomer(userId);
        const stripeSubscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        });
        const existingStripeSubscription = stripeSubscriptions.data.find(
          (candidate) => !["canceled", "incomplete_expired"].includes(candidate.status),
        );
        if (existingStripeSubscription) {
          throw new StripeCheckoutConflictError("A Stripe subscription already exists for this account");
        }
        const openSessions = await stripe.checkout.sessions.list({
          customer: customerId,
          status: "open",
          limit: 100,
        });
        const matchingSession = openSessions.data.find(
          (candidate) =>
            candidate.mode === "subscription" &&
            candidate.metadata?.userId === userId &&
            candidate.metadata?.checkoutFingerprint === checkoutFingerprint,
        );
        if (matchingSession?.url) return matchingSession;

        // A changed plan/add-on selection supersedes older unfinished sessions.
        for (const candidate of openSessions.data) {
          if (candidate.mode === "subscription" && candidate.metadata?.userId === userId) {
            await stripe.checkout.sessions.expire(candidate.id);
          }
        }

        return stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: lineItems,
          // No trial_period_days — payment is collected immediately. The
          // in-app free trial is enforced separately and never touches Stripe.
          success_url: `${base}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/select-plan?checkout=cancelled`,
          allow_promotion_codes: true,
          billing_address_collection: "required",
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          customer_update: {
            address: "auto",
            name: "auto",
            shipping: "auto",
          },
          metadata: { userId, plan, billingInterval, checkoutFingerprint },
          subscription_data: {
            metadata: { userId, plan, billingInterval },
          },
        });
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("[stripe] checkout error:", err);
      const status = err instanceof StripeCheckoutConflictError ? 409 : 500;
      res.status(status).json({ message: err.message || "Failed to create checkout session" });
    }
  });

  // Stripe may redirect before its webhook reaches the app. Confirming the
  // completed session makes the return path self-healing; concurrent webhook
  // writes are serialized by the same per-account advisory lock.
  app.post("/api/billing/stripe/confirm-checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) {
        return res.status(400).json({ message: "sessionId is required" });
      }
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payments are not configured." });
      }

      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const user = await storage.getUser(userId);
      if (
        session.mode !== "subscription" ||
        session.status !== "complete" ||
        session.metadata?.userId !== userId ||
        !user?.stripeCustomerId ||
        customerId !== user.stripeCustomerId
      ) {
        return res.status(403).json({ message: "Checkout session does not belong to this account" });
      }
      if (!session.subscription) {
        return res.status(409).json({ message: "Stripe subscription is not ready yet" });
      }

      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
      await syncLatestStripeSubscription(subscriptionId);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] checkout confirmation error:", err);
      res.status(500).json({ message: err.message || "Failed to confirm checkout" });
    }
  });

  // Stripe Customer Portal — manage card, view invoices, resume/cancel
  app.post("/api/billing/portal", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      if (await isComplimentaryUser(userId)) {
        return res.status(400).json({
          message: "Complimentary access — no Stripe billing portal to open.",
          complimentary: true,
        });
      }
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payments are not configured." });
      }
      const customerId = await ensureStripeCustomer(userId);
      const base = appBaseUrl(req);
      const configurationId = await ensurePortalConfiguration();
      const session = await getStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: `${base}/billing`,
        ...(configurationId ? { configuration: configurationId } : {}),
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[stripe] portal error:", err);
      res.status(500).json({ message: err.message || "Failed to open billing portal" });
    }
  });

  // Stripe-backed plan/interval change (proration handled by Stripe)
  app.post("/api/billing/stripe/change-plan", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const { plan, billingInterval } = req.body as {
        plan: PlanKey;
        billingInterval?: "monthly" | "annual";
      };
      if (!PLAN_KEYS.includes(plan)) {
        return res.status(400).json({ message: "Invalid plan" });
      }
      if (await isComplimentaryUser(userId)) {
        const interval = billingInterval ?? "annual";
        await grantComplimentaryEnterprise(userId, plan, interval);
        return res.json({ ok: true, complimentary: true, intervalChanged: false });
      }
      const sub = await storage.getSubscriptionByUserId(userId);
      if (!sub?.stripeSubscriptionId || !sub?.stripeSubscriptionItemId) {
        return res.status(400).json({ message: "No Stripe subscription on file. Use checkout to subscribe." });
      }
      const interval = billingInterval ?? (sub.billingInterval as "monthly" | "annual");
      const newPriceId = await resolvePriceId(priceKeyForPlan(plan, interval));
      const stripe = getStripe();

      // Build the items list: change the plan item to the new price, AND if
      // the interval changed, migrate every active add-on subscription item to
      // the matching interval price so the whole subscription stays on a
      // single recurring cadence.
      type ItemUpdate = { id: string; price: string } | { price: string; quantity: number };
      const items: ItemUpdate[] = [
        { id: sub.stripeSubscriptionItemId, price: newPriceId },
      ];

      const intervalChanged = interval !== sub.billingInterval;
      if (intervalChanged) {
        const activeAddons = (await storage.getAddonsBySubscriptionId(sub.id)).filter(
          (a) => a.status === "active" && a.stripeSubscriptionItemId,
        );
        for (const a of activeAddons) {
          const addonPriceId = await resolvePriceId(
            priceKeyForAddon(a.addonType as AddonType, interval),
          );
          items.push({ id: a.stripeSubscriptionItemId!, price: addonPriceId });
        }
      }

      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        proration_behavior: "create_prorations",
        items,
        metadata: { userId, plan, billingInterval: interval },
      });
      res.json({ ok: true, intervalChanged });
    } catch (err: any) {
      console.error("[stripe] change-plan error:", err);
      res.status(500).json({ message: err.message || "Failed to change plan" });
    }
  });

  // Stripe-backed add-on add / change qty
  app.post("/api/billing/stripe/addons", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const { addonType, quantity = 1, billingInterval } = req.body as {
        addonType: AddonType;
        quantity?: number;
        billingInterval?: "monthly" | "annual";
      };
      if (!ADDON_KEYS.includes(addonType)) {
        return res.status(400).json({ message: "Invalid add-on type" });
      }
      if (await isComplimentaryUser(userId)) {
        // Super users already have unlimited limits — record the add-on
        // locally for visibility, but never call Stripe.
        let sub = await storage.getSubscriptionByUserId(userId);
        if (!sub) sub = await grantComplimentaryEnterprise(userId);
        const cfg = getAddonConfig(addonType)!;
        const interval = billingInterval ?? (sub.billingInterval as "monthly" | "annual");
        await storage.createAddon({
          subscriptionId: sub.id,
          userId,
          addonType,
          quantity: Math.max(1, quantity),
          billingInterval: interval,
          monthlyAmount: 0,
          annualAmount: 0,
          status: "active",
          stripeSubscriptionItemId: null,
          stripePriceId: null,
          cancelledAt: null,
        });
        return res.json({ ok: true, complimentary: true });
      }
      const sub = await storage.getSubscriptionByUserId(userId);
      if (!sub?.stripeSubscriptionId) {
        return res.status(400).json({ message: "Active Stripe subscription required" });
      }
      const interval = billingInterval ?? (sub.billingInterval as "monthly" | "annual");
      const priceId = await resolvePriceId(priceKeyForAddon(addonType, interval));
      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      const existingItem = stripeSub.items.data.find((i) => i.price.id === priceId);
      if (existingItem) {
        await stripe.subscriptionItems.update(existingItem.id, {
          quantity: (existingItem.quantity ?? 0) + Math.max(1, quantity),
          proration_behavior: "create_prorations",
        });
      } else {
        await stripe.subscriptionItems.create({
          subscription: sub.stripeSubscriptionId,
          price: priceId,
          quantity: Math.max(1, quantity),
          proration_behavior: "create_prorations",
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] addon add error:", err);
      res.status(500).json({ message: err.message || "Failed to update add-on" });
    }
  });

  // Stripe-backed add-on quantity update (absolute value, supports decrement).
  // Setting quantity to 0 deletes the subscription item.
  app.post("/api/billing/stripe/addons/:id/quantity", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const addonId = parseInt(req.params.id);
      const { quantity } = req.body as { quantity: number };
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: "quantity must be a non-negative integer" });
      }
      const addons = await storage.getAddonsByUserId(userId);
      const addon = addons.find((a) => a.id === addonId);
      if (!addon) return res.status(404).json({ message: "Add-on not found" });
      if (await isComplimentaryUser(userId) || !addon.stripeSubscriptionItemId) {
        if (quantity === 0) {
          await storage.updateAddon(addonId, { status: "cancelled", cancelledAt: new Date() });
        } else {
          await storage.updateAddon(addonId, { quantity });
        }
        return res.json({ ok: true });
      }
      const stripe = getStripe();
      if (quantity === 0) {
        await stripe.subscriptionItems.del(addon.stripeSubscriptionItemId, {
          proration_behavior: "create_prorations",
        });
      } else {
        await stripe.subscriptionItems.update(addon.stripeSubscriptionItemId, {
          quantity,
          proration_behavior: "create_prorations",
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] addon quantity error:", err);
      res.status(500).json({ message: err.message || "Failed to update add-on quantity" });
    }
  });

  // Stripe-backed add-on cancel (remove subscription item)
  app.post("/api/billing/stripe/addons/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      const addonId = parseInt(req.params.id);
      const addons = await storage.getAddonsByUserId(userId);
      const addon = addons.find((a) => a.id === addonId);
      if (!addon) return res.status(404).json({ message: "Add-on not found" });
      if (await isComplimentaryUser(userId) || !addon.stripeSubscriptionItemId) {
        await storage.updateAddon(addonId, { status: "cancelled", cancelledAt: new Date() });
        return res.json({ ok: true });
      }
      await getStripe().subscriptionItems.del(addon.stripeSubscriptionItemId, {
        proration_behavior: "create_prorations",
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] addon cancel error:", err);
      res.status(500).json({ message: err.message || "Failed to cancel add-on" });
    }
  });

  // Stripe-backed cancel: schedule at period end
  app.post("/api/billing/stripe/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      if (await isComplimentaryUser(userId)) {
        return res.status(400).json({
          message: "Complimentary access cannot be cancelled.",
          complimentary: true,
        });
      }
      const sub = await storage.getSubscriptionByUserId(userId);
      if (!sub?.stripeSubscriptionId) {
        return res.status(400).json({ message: "No Stripe subscription on file" });
      }
      await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await storage.updateSubscription(sub.id, { cancelAtPeriodEnd: true });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] cancel error:", err);
      res.status(500).json({ message: err.message || "Failed to cancel subscription" });
    }
  });

  // Resume a scheduled cancellation
  app.post("/api/billing/stripe/resume", isAuthenticated, async (req, res) => {
    try {
      const userId = getAccountOwnerId(req);
      if (await isComplimentaryUser(userId)) {
        return res.json({ ok: true, complimentary: true });
      }
      const sub = await storage.getSubscriptionByUserId(userId);
      if (!sub?.stripeSubscriptionId) {
        return res.status(400).json({ message: "No Stripe subscription on file" });
      }
      await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      await storage.updateSubscription(sub.id, { cancelAtPeriodEnd: false });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[stripe] resume error:", err);
      res.status(500).json({ message: err.message || "Failed to resume subscription" });
    }
  });
}

export const _internal = {
  PLAN_CONFIG,
  ADDON_CONFIG,
};
