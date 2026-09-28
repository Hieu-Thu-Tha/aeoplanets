import type { AiUsageCapStatus } from "./ai-usage/cap-policy";
import { db } from "../db";
import { storage } from "../storage";
import { sendScheduledAiQuotaExhaustedEmail } from "./email-service";
import {
  claimNotificationDelivery,
  type NotificationDatabase,
} from "./notification-delivery";

const MAX_NOTIFICATION_ATTEMPTS = 2;
const NOTIFICATION_LOOKBACK_MS = 128 * 60 * 60 * 1000;

export function getScheduledAiQuotaResetAt(status: AiUsageCapStatus): Date | undefined {
  const resetTimes = status.blockedBy.flatMap((window) => {
    const resetsAt = window === "monthly" ? status.monthly?.resetsAt : status.refresh?.resetsAt;
    if (!resetsAt) return [];
    const timestamp = new Date(resetsAt);
    return Number.isFinite(timestamp.getTime()) ? [timestamp] : [];
  });
  if (resetTimes.length === 0) return undefined;
  return new Date(Math.max(...resetTimes.map((timestamp) => timestamp.getTime())));
}

export async function claimScheduledAiQuotaNotification(
  accountOwnerId: string,
  now: Date = new Date(),
  database: NotificationDatabase = db,
): Promise<boolean> {
  if (!accountOwnerId) throw new TypeError("accountOwnerId is required");
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date");
  return claimNotificationDelivery({
    userId: accountOwnerId,
    type: "quota_reached_schedule_stopped",
    deliveryMethod: "email",
    since: new Date(now.getTime() - NOTIFICATION_LOOKBACK_MS),
    now,
    maximumDeliveries: MAX_NOTIFICATION_ATTEMPTS,
  }, database);
}

export async function notifyScheduledAiQuotaBlocked(
  accountOwnerId: string,
  status: AiUsageCapStatus,
): Promise<void> {
  const resetsAt = getScheduledAiQuotaResetAt(status);
  if (!resetsAt) {
    console.warn("[scheduled-ai-quota] blocked status has no reset boundary", {
      accountOwnerId,
      blockedBy: status.blockedBy,
    });
    return;
  }
  const user = await storage.getUser(accountOwnerId);
  if (!user?.email) {
    console.warn("[scheduled-ai-quota] no account email available", { accountOwnerId });
    return;
  }
  if (!await claimScheduledAiQuotaNotification(accountOwnerId)) return;
  await sendScheduledAiQuotaExhaustedEmail({
    to: user.email,
    firstName: user.firstName,
    resetsAt,
  });
}
