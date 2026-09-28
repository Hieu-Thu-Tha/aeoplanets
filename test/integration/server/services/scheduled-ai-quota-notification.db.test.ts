import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  notifications,
  users,
} from "@shared/schema";
import { claimScheduledAiQuotaNotification } from "../../../../server/services/scheduled-ai-quota-notification";
import { claimNotificationDelivery } from "../../../../server/services/notification-delivery";
import {
  createTestDatabasePool,
  getTestDatabaseUrl,
  resetTestDatabase,
} from "../../helpers/postgres";

before(resetTestDatabase);

test("database reset validation rejects effective connection-string overrides", () => {
  const original = process.env.TEST_DATABASE_URL;
  try {
    process.env.TEST_DATABASE_URL = "postgresql://postgres@localhost/aeostars_test?host=remote.example";
    assert.throws(() => getTestDatabaseUrl(), /local PostgreSQL host/);

    process.env.TEST_DATABASE_URL = "postgresql://postgres@localhost/production";
    assert.throws(() => getTestDatabaseUrl(), /database name must end in _test/);

    process.env.TEST_DATABASE_URL = "postgresql://postgres@localhost/aeostars_test?host=%2Ftmp";
    assert.throws(() => getTestDatabaseUrl(), /local PostgreSQL host/);
  } finally {
    process.env.TEST_DATABASE_URL = original;
  }
});

test("concurrent database claims allow two attempts per rolling 128-hour window", async () => {
  const pools = [createTestDatabasePool(), createTestDatabasePool()];
  const databases = pools.map((pool) => drizzle(pool));
  const database = databases[0];
  const accountOwnerId = randomUUID();
  const now = new Date("2026-09-01T00:00:00.000Z");
  const afterLookback = new Date("2026-09-06T08:00:00.001Z");

  try {
    await database.insert(users).values({
      id: accountOwnerId,
      email: `${accountOwnerId}@example.test`,
    });
    const claims = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      claimScheduledAiQuotaNotification(
        accountOwnerId,
        now,
        databases[index % databases.length],
      ),
    ));
    assert.equal(claims.filter(Boolean).length, 2);

    const firstWindow = await database.select()
      .from(notifications)
      .where(eq(notifications.userId, accountOwnerId));
    assert.equal(firstWindow.length, 2);
    assert.equal(firstWindow[0].type, "quota_reached_schedule_stopped");
    assert.equal(firstWindow[0].deliveryMethod, "email");
    assert.equal(
      await claimScheduledAiQuotaNotification(accountOwnerId, now, database),
      false,
    );
    assert.equal(await claimNotificationDelivery({
      userId: accountOwnerId,
      type: "quota_reached_schedule_stopped",
      deliveryMethod: "push_noti",
      since: new Date(now.getTime() - 128 * 60 * 60 * 1000),
      now,
    }, database), true);
    assert.equal(
      await claimScheduledAiQuotaNotification(accountOwnerId, afterLookback, database),
      true,
    );
  } finally {
    await database.delete(users).where(eq(users.id, accountOwnerId));
    await Promise.all(pools.map((pool) => pool.end()));
  }
});
