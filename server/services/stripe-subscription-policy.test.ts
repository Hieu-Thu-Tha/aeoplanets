import assert from "node:assert/strict";
import test from "node:test";
import {
  getStripeSubscriptionPolicy,
  shouldRestoreTrialAfterStripeDeletion,
} from "./stripe-subscription-policy";

test("ordinary signup does not gain a local subscription from incomplete Stripe checkout", () => {
  const policy = getStripeSubscriptionPolicy("incomplete", {
    hasSubscription: false,
    hasTrial: false,
  });

  assert.equal(policy.activatesPaidAccess, false);
  assert.equal(policy.preservesExistingTrial, false);
  assert.equal(policy.shouldPersistLocally, false);
});

test("ordinary signup gains a local subscription when Stripe activates", () => {
  const policy = getStripeSubscriptionPolicy("active", {
    hasSubscription: false,
    hasTrial: false,
  });

  assert.equal(policy.activatesPaidAccess, true);
  assert.equal(policy.shouldPersistLocally, true);
});

test("incomplete Stripe checkout preserves an existing provisioned trial", () => {
  const policy = getStripeSubscriptionPolicy("incomplete", {
    hasSubscription: true,
    hasTrial: true,
  });

  assert.equal(policy.activatesPaidAccess, false);
  assert.equal(policy.preservesExistingTrial, true);
  assert.equal(policy.shouldPersistLocally, true);
});

test("only a row with a trial entitlement is restored after Stripe deletion", () => {
  assert.equal(shouldRestoreTrialAfterStripeDeletion(new Date("2026-10-01T00:00:00Z")), true);
  assert.equal(shouldRestoreTrialAfterStripeDeletion(null), false);
});
