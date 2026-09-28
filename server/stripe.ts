import Stripe from "stripe";
import type { AddonType, PlanKey } from "./plans";

let cachedStripe: Stripe | null = null;
let cachedKeyEnv: string | null = null;

export function isStripeConfigured(): boolean {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    !!process.env.STRIPE_PUBLISHABLE_KEY
  );
}

export function getStripeMode(): "test" | "live" {
  return process.env.NODE_ENV === "production" ? "live" : "test";
}

/**
 * Whether Stripe key-prefix/mode enforcement is strict. Controlled by the
 * STRIPE_STRICT_MODE env var:
 *   - "true"  -> strict: production must use live keys (sk_live_/pk_live_),
 *                mismatches or partial config throw and abort startup.
 *   - "false" -> relaxed: mismatches/missing keys are logged as warnings,
 *                startup continues (billing routes still work with whatever
 *                keys are configured, e.g. test keys in production).
 * Defaults to relaxed ("false") when unset, so deployments aren't blocked
 * by strict live-key enforcement unless explicitly opted in.
 */
export function isStripeStrictMode(): boolean {
  return process.env.STRIPE_STRICT_MODE === "true";
}

/**
 * Validate Stripe env vars at boot. In strict mode + production, missing/
 * mismatched keys throw and abort startup. Otherwise, problems are logged
 * as warnings so the rest of the app can still run.
 */
export function validateStripeEnvAtBoot(): void {
  const isProd = process.env.NODE_ENV === "production";
  const strict = isStripeStrictMode();
  const expectedSecretPrefix = isProd ? "sk_live_" : "sk_test_";
  const expectedPublishablePrefix = isProd ? "pk_live_" : "pk_test_";
  const required: Array<{ name: string; value: string | undefined; prefix?: string }> = [
    { name: "STRIPE_SECRET_KEY", value: process.env.STRIPE_SECRET_KEY, prefix: expectedSecretPrefix },
    { name: "STRIPE_PUBLISHABLE_KEY", value: process.env.STRIPE_PUBLISHABLE_KEY, prefix: expectedPublishablePrefix },
    { name: "STRIPE_WEBHOOK_SECRET", value: process.env.STRIPE_WEBHOOK_SECRET, prefix: "whsec_" },
  ];
  const errors: string[] = [];
  const setCount = required.filter((r) => !!r.value).length;
  for (const r of required) {
    if (!r.value) {
      errors.push(`${r.name} is not set (expected ${r.prefix ?? "value"} for NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
      continue;
    }
    if (r.prefix && !strict && isProd) {
      // In relaxed mode we don't enforce the live-key prefix at all, but we
      // still want visibility into which mode Stripe is effectively running.
      continue;
    }
    if (r.prefix && !r.value.startsWith(r.prefix)) {
      errors.push(`${r.name} does not start with "${r.prefix}" (NODE_ENV=${process.env.NODE_ENV ?? "development"})`);
    }
  }
  if (errors.length === 0) {
    console.log(`[stripe] Configured in ${getStripeMode()} mode${strict ? "" : " (strict mode off)"}.`);
    return;
  }
  // Fail fast only in strict mode, when in production OR when Stripe is
  // partially configured (any key set without the others). In relaxed mode,
  // we log and continue regardless of environment.
  if (strict && (isProd || setCount > 0)) {
    throw new Error(`[stripe] Invalid configuration:\n  - ${errors.join("\n  - ")}`);
  }
  if (setCount === 0) {
    console.warn(
      `[stripe] No Stripe keys set — billing routes will return 503 until configured.`,
    );
  } else {
    console.warn(
      `[stripe] Configuration warnings (STRIPE_STRICT_MODE is off, continuing):\n  - ${errors.join("\n  - ")}`,
    );
  }
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. In development set the test-mode key (sk_test_...); in production set the live-mode key (sk_live_...).",
    );
  }
  const expectedPrefix = getStripeMode() === "live" ? "sk_live_" : "sk_test_";
  if (!key.startsWith(expectedPrefix)) {
    console.warn(
      `[stripe] STRIPE_SECRET_KEY does not start with ${expectedPrefix} for NODE_ENV=${process.env.NODE_ENV}. Check your environment configuration.`,
    );
  }
  if (!cachedStripe || cachedKeyEnv !== key) {
    // Intentionally omit `apiVersion` so the SDK uses the API version pinned
    // on the Stripe account itself. This avoids drift between hard-coded
    // strings and the SDK's bundled types, and lets ops upgrade the API
    // version centrally from the Stripe Dashboard.
    cachedStripe = new Stripe(key, {
      typescript: true,
      appInfo: { name: "AEOSTARS", version: "1.0.0" },
    });
    cachedKeyEnv = key;
  }
  return cachedStripe;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

// Stripe lookup_key strings.
//
// Internal plan/addon keys do NOT map 1:1 to Stripe lookup_keys. The May 2026
// pricing brief requires the public lookup_key contract to stay stable
// (`plan_starter_*`, `plan_growth_*`, `addon_extra_brand_*`, `addon_competitor_pack_*`)
// while we add new ones (`plan_accelerate_*`, `addon_extra_user_*`,
// `addon_topic_prompt_*`, `addon_change_alerts_*`). We slug-map internally so
// `starter_v2`/`growth_v2` resolve to the existing `plan_starter_*`/`plan_growth_*`
// lookup keys (Stripe will `transfer_lookup_key` from old £-amounts onto new
// £75/£150 Prices when seeded).
export type PriceLookupKey = string;

const PLAN_LOOKUP_SLUG: Record<PlanKey, string | null> = {
  starter: "starter",
  growth: "growth",
  enterprise: null, // Custom — no Stripe Price.
  starter_v2: "starter",
  growth_v2: "growth",
  accelerate: "accelerate",
};

const ADDON_LOOKUP_SLUG: Record<AddonType, string> = {
  extra_user: "extra_user",
  extra_brand: "extra_brand",
  topic_prompt_pack: "topic_prompt",
  change_alerts_pack: "change_alerts",
  competitor_pack: "competitor_pack",
  key_terms_pack: "key_terms_pack",
};

export function planLookupKey(plan: PlanKey, interval: "monthly" | "annual"): PriceLookupKey {
  const slug = PLAN_LOOKUP_SLUG[plan];
  if (!slug) {
    throw new Error(`Plan "${plan}" has no Stripe lookup_key (contact-sales tier).`);
  }
  return `plan_${slug}_${interval}`;
}

export function addonLookupKey(addon: AddonType, interval: "monthly" | "annual"): PriceLookupKey {
  return `addon_${ADDON_LOOKUP_SLUG[addon]}_${interval}`;
}

// Authoritative list of every lookup_key the app expects to resolve at
// runtime. Used for the boot-time existence warning so ops know exactly
// which Prices Adam must create in the Stripe Dashboard before go-live.
export const EXPECTED_LOOKUP_KEYS: PriceLookupKey[] = [
  "plan_starter_monthly",
  "plan_starter_annual",
  "plan_growth_monthly",
  "plan_growth_annual",
  "plan_accelerate_monthly",
  "plan_accelerate_annual",
  "addon_extra_user_monthly",
  "addon_extra_brand_monthly",
  "addon_topic_prompt_monthly",
  "addon_change_alerts_monthly",
  "addon_competitor_pack_monthly",
];

// In-memory cache of resolved Price IDs per process. Resolved lazily by
// lookup_key so the seeding script + admin endpoint can re-run without
// hardcoding IDs. Keys come from Stripe Product + Price `lookup_key`.
const priceIdCache = new Map<string, string>();

// Guard against concurrent seed runs (boot-time, lazy-on-miss, and admin
// triggered). The first caller kicks off seeding; every other in-flight
// caller awaits the same promise rather than each firing its own seed.
let seedRunPromise: Promise<SeedResult> | null = null;

/**
 * Single-flight wrapper around seedStripeProductsAndPrices(). Always use
 * this — never call seedStripeProductsAndPrices() directly outside of
 * tests. Coalesces concurrent boot-time and lazy-seed calls into one
 * Stripe round-trip.
 */
export function runStripeSeedSingleFlight(): Promise<SeedResult> {
  if (!seedRunPromise) {
    seedRunPromise = seedStripeProductsAndPrices().finally(() => {
      seedRunPromise = null;
    });
  }
  return seedRunPromise;
}

async function lookupPriceFromStripe(lookupKey: PriceLookupKey): Promise<string | null> {
  const stripe = getStripe();
  const list = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
    expand: ["data.product"],
  });
  return list.data[0]?.id ?? null;
}

export async function resolvePriceId(lookupKey: PriceLookupKey): Promise<string> {
  if (priceIdCache.has(lookupKey)) {
    return priceIdCache.get(lookupKey)!;
  }
  const directHit = await lookupPriceFromStripe(lookupKey);
  if (directHit) {
    priceIdCache.set(lookupKey, directHit);
    return directHit;
  }

  // Cache miss + Stripe doesn't know this lookup_key — auto-seed once.
  console.warn(
    `[stripe] lookup_key="${lookupKey}" missing in Stripe; running runStripeSeedSingleFlight() to backfill.`,
  );
  try {
    await runStripeSeedSingleFlight();
  } catch (err) {
    throw new Error(
      `Stripe seed failed while resolving lookup_key="${lookupKey}": ${(err as Error).message}`,
    );
  }
  if (priceIdCache.has(lookupKey)) {
    return priceIdCache.get(lookupKey)!;
  }
  const postSeed = await lookupPriceFromStripe(lookupKey);
  if (postSeed) {
    priceIdCache.set(lookupKey, postSeed);
    return postSeed;
  }
  throw new Error(
    `No active Stripe price found for lookup_key="${lookupKey}" even after seeding. Check Stripe Dashboard or POST /api/admin/stripe/seed manually.`,
  );
}

export function clearPriceCache() {
  priceIdCache.clear();
}

type SeedItem = {
  lookupKey: PriceLookupKey;
  productName: string;
  productDescription: string;
  amountPence: number;
  interval: "month" | "year";
  metadata: Record<string, string>;
};

// All AEOSTARS prices are quoted exclusive of VAT (B2B SaaS convention).
// Stripe Tax requires every Price used with `automatic_tax` to declare a
// `tax_behavior` — once set on a Price it is immutable, so changing this
// will force the seed to create new Prices and deactivate the old ones.
const TAX_BEHAVIOR: Stripe.PriceCreateParams.TaxBehavior = "exclusive";

export function buildSeedItems(): SeedItem[] {
  const items: SeedItem[] = [];

  // Plan seed items.
  //
  // Lookup keys follow the public contract in the May 2026 brief:
  // `plan_starter_*`, `plan_growth_*`, `plan_accelerate_*`. The Starter and
  // Growth lookup_key NAMES are unchanged from the legacy seed so the
  // checkout/change-plan code paths keep working; what changes is the Price
  // they resolve to (£75 / £650 for Starter, £150 / £1300 for Growth). When
  // re-seeded, Stripe will `transfer_lookup_key=true` from the legacy
  // £38.99 / £103.99 Prices onto the new ones. Legacy customers continue
  // billing on their original Stripe Price IDs (immutable on the
  // subscription) so they are not affected.
  const plans: Array<{ slug: string; metaKey: string; name: string; desc: string; monthly: number; annual: number }> = [
    { slug: "starter", metaKey: "starter_v2", name: "AEOSTARS Starter", desc: "Starter plan — AI brand visibility monitoring", monthly: 7500, annual: 65000 },
    { slug: "growth", metaKey: "growth_v2", name: "AEOSTARS Growth", desc: "Growth plan — AI brand visibility monitoring", monthly: 15000, annual: 130000 },
    { slug: "accelerate", metaKey: "accelerate", name: "AEOSTARS Accelerate", desc: "Accelerate plan — AI brand visibility & competitive intelligence", monthly: 30000, annual: 260000 },
  ];
  for (const p of plans) {
    items.push({
      lookupKey: `plan_${p.slug}_monthly`,
      productName: p.name,
      productDescription: p.desc,
      amountPence: p.monthly,
      interval: "month",
      metadata: { plan: p.metaKey, type: "plan" },
    });
    items.push({
      lookupKey: `plan_${p.slug}_annual`,
      productName: p.name,
      productDescription: p.desc,
      amountPence: p.annual,
      interval: "year",
      metadata: { plan: p.metaKey, type: "plan" },
    });
  }

  // Add-on seed items.
  //
  // Lookup keys: existing `addon_extra_brand_*` and `addon_competitor_pack_*`
  // names are preserved verbatim. New keys: `addon_extra_user_*`,
  // `addon_topic_prompt_*`, `addon_change_alerts_*` (note: NO `_pack` suffix —
  // matches the brief's lookup_key contract). Annual-interval prices are
  // still emitted so legacy annual subscribers and interval flips continue to
  // resolve, even though new packs are sold monthly-only in the UI.
  const addons: Array<{ slug: string; metaKey: string; name: string; desc: string; monthly: number; annual: number }> = [
    { slug: "extra_user", metaKey: "extra_user", name: "AEOSTARS Extra User", desc: "+1 user seat add-on", monthly: 1500, annual: 18000 },
    { slug: "extra_brand", metaKey: "extra_brand", name: "AEOSTARS Extra Brand Pack", desc: "Complete extra brand: +1 brand, +3 competitors, +10 topics, +75 prompts, +1 audit, +50 alerts, +1 PDF", monthly: 5000, annual: 60000 },
    { slug: "topic_prompt", metaKey: "topic_prompt_pack", name: "AEOSTARS Topic & Prompt Pack", desc: "+10 topics and +100 prompts of additional capacity", monthly: 2500, annual: 30000 },
    { slug: "change_alerts", metaKey: "change_alerts_pack", name: "AEOSTARS Change Alerts Pack", desc: "+50 change alerts and +1 weekly refresh", monthly: 2500, annual: 30000 },
    { slug: "competitor_pack", metaKey: "competitor_pack", name: "AEOSTARS Competitor Pack", desc: "+5 competitor slots add-on", monthly: 1500, annual: 13860 },
    { slug: "key_terms_pack", metaKey: "key_terms_pack", name: "AEOSTARS Key Terms Pack (legacy)", desc: "Legacy +10 tracked terms add-on", monthly: 1000, annual: 9240 },
  ];
  for (const a of addons) {
    items.push({
      lookupKey: `addon_${a.slug}_monthly`,
      productName: a.name,
      productDescription: a.desc,
      amountPence: a.monthly,
      interval: "month",
      metadata: { addon: a.metaKey, type: "addon" },
    });
    items.push({
      lookupKey: `addon_${a.slug}_annual`,
      productName: a.name,
      productDescription: a.desc,
      amountPence: a.annual,
      interval: "year",
      metadata: { addon: a.metaKey, type: "addon" },
    });
  }

  return items;
}

/**
 * Boot-time existence check for the public lookup_key contract. Logs a
 * warning listing any keys that are not yet present in Stripe so ops can
 * see at startup which Prices Adam still needs to create. Never throws —
 * `resolvePriceId` will auto-seed on miss as a fallback.
 */
export async function warnOnMissingLookupKeys(): Promise<void> {
  if (!isStripeConfigured()) return;
  const missing: string[] = [];
  for (const key of EXPECTED_LOOKUP_KEYS) {
    try {
      const hit = await lookupPriceFromStripe(key);
      if (!hit) missing.push(key);
    } catch {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.warn(
      `[stripe] Missing lookup_keys (${missing.length}/${EXPECTED_LOOKUP_KEYS.length}): ${missing.join(", ")}\n` +
      `         Re-run the boot seed or POST /api/admin/stripe/seed to backfill.`,
    );
  }
}

export type SeedResult = {
  mode: "test" | "live";
  items: Array<{ lookupKey: string; priceId: string; productId: string; created: boolean }>;
};

/**
 * Idempotently create/update Stripe Products and recurring Prices for all
 * AEOSTARS plans + add-ons. Re-running is safe: existing prices are reused
 * if their amount/interval/lookup_key match; otherwise a new price is
 * created with the same lookup_key (Stripe transfers the lookup_key to the
 * new price automatically).
 */
export async function seedStripeProductsAndPrices(): Promise<SeedResult> {
  const stripe = getStripe();
  const seeds = buildSeedItems();
  const result: SeedResult = { mode: getStripeMode(), items: [] };

  // Group by product name so we share one Product across monthly + annual prices
  const productByName = new Map<string, Stripe.Product>();

  for (const item of seeds) {
    let product = productByName.get(item.productName);
    if (!product) {
      const existing = await stripe.products.search({
        query: `name:"${item.productName}" AND active:"true"`,
      });
      if (existing.data.length > 0) {
        product = existing.data[0];
      } else {
        product = await stripe.products.create({
          name: item.productName,
          description: item.productDescription,
          metadata: item.metadata,
        });
      }
      productByName.set(item.productName, product);
    }

    const existingPrices = await stripe.prices.list({
      lookup_keys: [item.lookupKey],
      active: true,
      limit: 1,
    });

    let priceId: string;
    let created = false;
    const matching = existingPrices.data[0];
    // Soft-seed semantics: once a Price exists for a given lookup_key with
    // compatible currency / billing interval / tax behaviour, treat the
    // Stripe Dashboard as the source of truth for the AMOUNT. We only
    // recreate the Price if the fundamentals (currency, interval,
    // tax_behavior) drift — those are immutable on Stripe Prices and would
    // break checkout. This lets ops change £75 → £79 in the Dashboard
    // without the boot seeder reverting it on next deploy.
    if (
      matching &&
      matching.currency === "gbp" &&
      matching.recurring?.interval === item.interval &&
      matching.tax_behavior === TAX_BEHAVIOR
    ) {
      priceId = matching.id;
    } else {
      // Either no price exists for this lookup_key, or its currency/
      // interval/tax_behavior are incompatible. Create a new Price from the
      // code defaults — Stripe will move the lookup_key onto the new Price
      // when transfer_lookup_key=true is set.
      const newPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: item.amountPence,
        currency: "gbp",
        recurring: { interval: item.interval },
        lookup_key: item.lookupKey,
        transfer_lookup_key: true,
        // Required by Stripe Tax. Immutable once set on a Price.
        tax_behavior: TAX_BEHAVIOR,
        metadata: item.metadata,
      });
      if (matching && matching.id !== newPrice.id) {
        try {
          await stripe.prices.update(matching.id, { active: false });
        } catch (e) {
          console.warn(`[stripe-seed] Failed to deactivate old price ${matching.id}:`, e);
        }
      }
      priceId = newPrice.id;
      created = true;
    }

    priceIdCache.set(item.lookupKey, priceId);
    result.items.push({
      lookupKey: item.lookupKey,
      priceId,
      productId: product.id,
      created,
    });
  }

  return result;
}
