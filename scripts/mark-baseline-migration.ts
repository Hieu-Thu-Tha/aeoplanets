/**
 * One-time script: mark migration 0000_baseline as already applied on a
 * database that predates the migrations workflow (the project was
 * `drizzle-kit push`-only until now, so the live schema already matches the
 * baseline — running its CREATE statements would fail/duplicate).
 *
 * Inserts the baseline entry into drizzle.__drizzle_migrations exactly the
 * way `drizzle-kit migrate` would record it (sha256 of the SQL file, journal
 * `when` as created_at), so subsequent `npm run db:migrate` skips 0000 and
 * applies only newer migrations.
 *
 * Run with: tsx scripts/mark-baseline-migration.ts
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { getPool } from "../server/utils/db-helper";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Run with: npx tsx --env-file=.env scripts/mark-baseline-migration.ts",
    );
  }
  const journal = JSON.parse(readFileSync("migrations/meta/_journal.json", "utf8"));
  const baseline = journal.entries.find((e: any) => e.tag === "0000_baseline");
  if (!baseline) throw new Error("0000_baseline not found in journal");

  const sql = readFileSync(`migrations/${baseline.tag}.sql`, "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");

  const pool = getPool(process.env.DATABASE_URL);
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    const existing = await pool.query(
      `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`, [hash],
    );
    if (existing.rows.length > 0) {
      console.log("Baseline already marked as applied — nothing to do.");
      return;
    }
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, baseline.when],
    );
    console.log(`Marked 0000_baseline as applied (hash ${hash.slice(0, 12)}…, when ${baseline.when}).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
