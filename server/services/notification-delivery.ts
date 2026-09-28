import { and, eq, gte, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  notifications,
  type NotificationDeliveryMethod,
  type NotificationType,
} from "@shared/schema";
import { db } from "../db";

export type NotificationDatabase = PgDatabase<any, any, any>;

export type ClaimNotificationDeliveryInput = {
  userId: string;
  type: NotificationType;
  deliveryMethod: NotificationDeliveryMethod;
  since: Date;
  now?: Date;
  maximumDeliveries?: number;
};

export async function claimNotificationDelivery(
  input: ClaimNotificationDeliveryInput,
  database: NotificationDatabase = db,
): Promise<boolean> {
  const now = input.now ?? new Date();
  const maximumDeliveries = input.maximumDeliveries ?? 1;
  if (!input.userId) throw new TypeError("userId is required");
  if (!Number.isFinite(input.since.getTime()) || !Number.isFinite(now.getTime())) {
    throw new RangeError("since and now must be valid dates");
  }
  if (!Number.isInteger(maximumDeliveries) || maximumDeliveries < 1) {
    throw new RangeError("maximumDeliveries must be a positive integer");
  }

  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`notification:${input.userId}:${input.type}:${input.deliveryMethod}`},
          0
        )
      )
    `);
    const [recent] = await transaction.select({
      count: sql<number>`count(*)::int`,
    }).from(notifications).where(and(
      eq(notifications.userId, input.userId),
      eq(notifications.type, input.type),
      eq(notifications.deliveryMethod, input.deliveryMethod),
      gte(notifications.attemptedAt, input.since),
    ));
    if ((recent?.count ?? 0) >= maximumDeliveries) return false;

    await transaction.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      deliveryMethod: input.deliveryMethod,
      attemptedAt: now,
      createdAt: now,
    });
    return true;
  });
}
