# Stripe Billing — Setup & Test Checklist

This document covers the live Stripe integration that powers self-serve
subscriptions and add-on packs (GBP-only) for AEOSTARS Starter and Growth
plans. Enterprise remains "contact sales" and admin-provisioned manual
invoicing (Task #13) keeps working in parallel.

---

## 1. Environment variables

The server validates Stripe configuration at boot. Mode is selected by
`NODE_ENV`:

- `NODE_ENV=production` → live mode (`sk_live_…`, `pk_live_…`)
- anything else → test mode (`sk_test_…`, `pk_test_…`)

Required env vars (matched against the expected prefix per environment):

| Variable                  | Dev prefix    | Prod prefix   |
| ------------------------- | ------------- | ------------- |
| `STRIPE_SECRET_KEY`       | `sk_test_`    | `sk_live_`    |
| `STRIPE_PUBLISHABLE_KEY`  | `pk_test_`    | `pk_live_`    |
| `STRIPE_WEBHOOK_SECRET`   | `whsec_`      | `whsec_`      |

Behavior:

- All three set + correct prefix → server logs `[stripe] Configured in test|live mode.`
- Any subset set with another missing **or** wrong prefix → server **throws** at boot
- All three unset (dev only) → warns and runs with billing routes returning 503

`STRIPE_WEBHOOK_SECRET` must come from the Stripe Dashboard webhook endpoint
that points at `POST /api/billing/stripe/webhook` (or `stripe listen` for
local dev — see §3).

---

## 2. One-time product/price seed

All Plan and Add-on prices live in Stripe and are resolved by `lookup_key`,
not by hard-coded IDs. Run the seed once per Stripe environment (test and
live). Re-running is idempotent: existing prices that match are reused;
mismatched prices are deactivated and replaced (Stripe transfers the
`lookup_key` automatically via `transfer_lookup_key: true`).

Endpoint: `POST /api/admin/stripe/seed` (admin-only).

```bash
curl -X POST https://<your-host>/api/admin/stripe/seed \
  -H "Cookie: <admin session cookie>"
```

The response lists every `{ lookupKey, priceId, productId, created }` tuple.

The seeded `lookup_key`s are:

```
plan_starter_monthly      plan_starter_annual
plan_growth_monthly       plan_growth_annual
addon_extra_brand_monthly addon_extra_brand_annual
addon_competitor_pack_monthly addon_competitor_pack_annual
addon_key_terms_pack_monthly  addon_key_terms_pack_annual
```

All prices are GBP, recurring (`month` or `year`).

---

## 3. Webhook setup

### Production

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://<your-host>/api/stripe/webhook`
3. Subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and restart.

### Local dev (Stripe CLI)

```bash
stripe login
stripe listen --forward-to http://localhost:5000/api/stripe/webhook
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET, then restart the server
```

Replay events with: `stripe trigger checkout.session.completed`, etc.

---

## 4. Manual test checklist

Use Stripe test cards: `4242 4242 4242 4242` (success),
`4000 0000 0000 9995` (insufficient funds), `4000 0027 6000 3184` (3DS).

### Subscription lifecycle

- [ ] New user → `/select-plan` → "Start Free Trial" / "Select <Plan>" →
      Stripe Checkout completes → returns to `/billing` → subscription row
      created with `stripeSubscriptionId`, `stripePriceId`, `stripeSubscriptionItemId`.
- [ ] `invoice.paid` webhook creates a local `invoices` row with
      `stripeInvoiceId`, `stripeHostedInvoiceUrl`, `stripeInvoicePdfUrl`.
- [ ] `/billing` invoice table renders **View** + **PDF** links pointing at
      Stripe-hosted URLs.

### Plan changes (subscription items + proration)

- [ ] Existing Stripe sub on Starter monthly → `/select-plan` → "Change to
      Growth" → server calls `POST /api/billing/stripe/change-plan` →
      Stripe `subscriptions.update` runs with
      `proration_behavior: "create_prorations"`.
- [ ] Switching billing interval (monthly ↔ annual) also migrates **every
      active add-on subscription item** to the matching interval price so the
      whole subscription stays on a single cadence.
- [ ] `customer.subscription.updated` webhook syncs the new plan/interval
      back into the local DB.

### Add-on packs

- [ ] `/select-plan` → "Add" on a pack with an existing Stripe sub →
      `POST /api/billing/stripe/addons` → if matching price item exists,
      quantity is incremented; otherwise a new `subscription_items.create`
      runs with proration.
- [ ] `/billing` → addon card `+` / `−` buttons → `POST /api/billing/stripe/addons/:id/quantity`
      with absolute quantity. Setting quantity to 0 deletes the item;
      otherwise the item quantity is updated with proration.
- [ ] `/billing` → addon card "Cancel" → `POST /api/billing/stripe/addons/:id/cancel`
      removes the subscription item with proration.

### Cancel / resume

- [ ] `/billing` → "Cancel Subscription" → `POST /api/billing/stripe/cancel`
      sets `cancel_at_period_end: true` on Stripe and locally; sub stays
      `active` until period end.
- [ ] `/billing` → "Resume" → `POST /api/billing/stripe/resume` clears the
      scheduled cancellation.
- [ ] After period end, `customer.subscription.deleted` fires and local sub
      flips to `cancelled`.

### Failed payment

- [ ] Trigger with `4000 0000 0000 9995` (or `stripe trigger
      invoice.payment_failed`) → local invoice marked `overdue` and sub
      flagged `past_due`.
- [ ] Payment retry succeeds → sub returns to `active`.

### Customer Portal

- [ ] `/billing` → "Manage Billing" → `POST /api/billing/portal` returns the
      Stripe-hosted portal URL → opens portal → updating payment method
      updates Stripe (no local mirroring required).

### Legacy / admin paths

- [ ] Subscriptions **without** `stripeSubscriptionId` continue to use the
      legacy renewal path (`checkAndRenewMonthlySubscription`). Subs **with**
      a Stripe ID skip that path entirely (Stripe is the source of truth).
- [ ] Admin-provisioned manual invoicing (Task #13) still works for
      Enterprise customers.

---

## 5. Implementation map

| Concern                                | File                        |
| -------------------------------------- | --------------------------- |
| SDK init, env validation, seeding      | `server/stripe.ts`          |
| HTTP routes + webhook handler          | `server/stripe-routes.ts`   |
| Boot-time env fail-fast                | `server/index.ts`           |
| Storage helpers (lookup by Stripe IDs) | `server/storage.ts`         |
| DB columns (stripe_* fields)           | `shared/schema.ts`          |
| Plan picker + Stripe routing           | `client/src/pages/select-plan.tsx` |
| Billing page (portal, cancel, invoices)| `client/src/pages/billing.tsx`     |
| Checkout redirect                      | `client/src/pages/checkout.tsx`    |
| Upgrade entry points                   | `client/src/components/ui/UpgradeGate.tsx`, `client/src/components/ui/UpgradeModal.tsx` |
