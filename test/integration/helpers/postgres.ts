import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { Pool as PgPool, PoolClient } from "pg";

const { Client, Pool } = pg;

const migrationsFolder = fileURLToPath(new URL("../../../migrations", import.meta.url));
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function getTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL must be set");

  const client = new Client({ connectionString });
  if (!localHosts.has(client.host)) {
    throw new Error("TEST_DATABASE_URL must use a local PostgreSQL host");
  }
  if (!client.database?.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL database name must end in _test");
  }
  return connectionString;
}

export function createTestDatabasePool(): PgPool {
  return new Pool({ connectionString: getTestDatabaseUrl() });
}

export async function waitForBlockedSessions(
  client: PoolClient,
  expected: number,
  options: { blockerPid?: number; lockType?: string } = {},
): Promise<number[]> {
  const blocker = options.blockerPid == null
    ? await client.query<{ pid: number }>("SELECT pg_backend_pid()::int AS pid")
    : undefined;
  const blockerPid = options.blockerPid ?? blocker!.rows[0].pid;
  const lockType = options.lockType ?? "advisory";
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const result = await client.query<{ pid: number }>(
      "SELECT DISTINCT waiting_lock.pid::int AS pid "
        + "FROM pg_locks AS waiting_lock "
        + "JOIN pg_locks AS blocker_lock ON "
        + "waiting_lock.locktype = blocker_lock.locktype "
        + "AND waiting_lock.database IS NOT DISTINCT FROM blocker_lock.database "
        + "AND waiting_lock.relation IS NOT DISTINCT FROM blocker_lock.relation "
        + "AND waiting_lock.classid IS NOT DISTINCT FROM blocker_lock.classid "
        + "AND waiting_lock.objid IS NOT DISTINCT FROM blocker_lock.objid "
        + "AND waiting_lock.objsubid IS NOT DISTINCT FROM blocker_lock.objsubid "
        + "WHERE waiting_lock.locktype = $2 "
        + "AND NOT waiting_lock.granted "
        + "AND blocker_lock.granted "
        + "AND blocker_lock.pid = $1",
      [blockerPid, lockType],
    );
    if (result.rows.length >= expected) return result.rows.map((row) => row.pid);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${expected} sessions blocked by the control transaction`);
}

export async function resetTestDatabase(): Promise<void> {
  const pool = createTestDatabasePool();
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool), { migrationsFolder });

    const result = await pool.query<{
      users: string | null;
      notifications: string | null;
      legacy_notifications: string | null;
    }>(
      "SELECT to_regclass('public.users')::text AS users, "
        + "to_regclass('public.notifications')::text AS notifications, "
        + "to_regclass('public.ai_scheduled_quota_notifications')::text AS legacy_notifications",
    );
    if (
      !result.rows[0]?.users
      || !result.rows[0]?.notifications
      || result.rows[0]?.legacy_notifications
    ) {
      throw new Error("Test database migrations did not create the expected tables");
    }
  } finally {
    await pool.end();
  }
}
