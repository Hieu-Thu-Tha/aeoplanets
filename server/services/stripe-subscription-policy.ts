export function getStripeSubscriptionPolicy(
  stripeStatus: string,
  existing: { hasSubscription: boolean; hasTrial: boolean },
) {
  const activatesPaidAccess = stripeStatus === "active" || stripeStatus === "trialing";
  return {
    activatesPaidAccess,
    preservesExistingTrial: !activatesPaidAccess && existing.hasTrial,
    shouldPersistLocally: activatesPaidAccess || existing.hasSubscription,
  };
}

export function shouldRestoreTrialAfterStripeDeletion(trialEndsAt: Date | null): boolean {
  return trialEndsAt !== null;
}
