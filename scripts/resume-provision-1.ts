import { storage } from "../server/storage";
import { assessmentEngine } from "../server/assessment-engine";
import { sendTrialInviteEmail, getBaseUrl } from "../server/services/email-service";

async function main() {
  const accountId = 1;
  const all = await storage.getAllProvisionedAccounts();
  const account = all.find((a) => a.id === accountId);
  if (!account) {
    console.error(`Provisioned account ${accountId} not found`);
    process.exit(1);
  }
  if (!account.brandId) {
    console.error(`Provisioned account ${accountId} has no brandId`);
    process.exit(1);
  }
  const brandId = account.brandId;
  console.log(`[Resume] Account ${accountId} email=${account.email} brand=${brandId} status=${account.scanStatus}`);

  await storage.updateBrand(brandId, { scanStatus: "idle" });
  await storage.updateProvisionedAccount(accountId, { scanStatus: "scanning" });

  console.log(`[Resume] Running full scan for brand ${brandId}...`);
  let scanSucceeded = false;
  try {
    await assessmentEngine.runFullScan(brandId);
    scanSucceeded = true;
  } catch (err) {
    console.error(`[Resume] Scan failed:`, err);
    await storage.updateBrand(brandId, { scanStatus: "idle" });
  }

  if (!scanSucceeded) {
    await storage.updateProvisionedAccount(accountId, { scanStatus: "failed" });
    console.error(`[Resume] Pipeline failed — invite NOT sent`);
    process.exit(1);
  }

  await storage.updateProvisionedAccount(accountId, { scanStatus: "completed" });
  console.log(`[Resume] Scan complete. Sending invite email to ${account.email}...`);

  const baseUrl = getBaseUrl();
  const signupUrl = `${baseUrl}/signup?token=${account.inviteToken}`;
  await sendTrialInviteEmail({
    to: account.email,
    brandName: account.brandName || "your brand",
    signupUrl,
    trialDurationDays: account.trialDurationDays,
  });

  await storage.updateProvisionedAccount(accountId, {
    emailSent: true,
    emailSentAt: new Date(),
  });

  console.log(`[Resume] Done — invite email sent to ${account.email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
