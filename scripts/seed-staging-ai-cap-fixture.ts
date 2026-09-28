/**
 * Staging-only fixture for the Accelerate monthly AI usage cap.
 *
 * The fixture applies an account-specific GBP 80 weekly refresh cap, preserves
 * the plan-wide Accelerate policy, and seeds completed August 2026 usage so
 * the account sits at GBP 194.50 in its August 2026 UTC month. Existing real
 * monthly usage reduces the third fixture bucket instead of being overwritten.
 *
 * Seed dry run:
 *   npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts
 *
 * Apply using the confirmation value printed by the dry run:
 *   npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts \
 *     --apply --confirm-staging="<database>@<host>"
 *
 * Cleanup dry run / apply:
 *   npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts --cleanup
 *   npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts \
 *     --cleanup --apply --confirm-staging="<database>@<host>"
 */
import { type PoolClient } from "pg";
import { getPool } from "../server/utils/db-helper";
import { execFileSync } from "node:child_process";
import {
  aiUsageCapsSchema,
  type AiUsageCapsConfig as RegistryAiUsageCapsConfig,
} from "../server/config/system-config-defaults";

const TARGET_EMAIL = "tech-accelerate@alpon.xyz";
const FIXTURE_PREFIX = "aeostars-fixture/staging-ai-cap-2026-08/v1/";
const MANIFEST_KEY = "fixture_staging_ai_cap_2026_08_v1";
const MANIFEST_VERSION = 1;
const TARGET_MONTHLY_GBP = 194.5;
const MONTHLY_CAP_GBP = 195;
const WEEKLY_CAP_GBP = 80;
const TEST_WINDOW_START = new Date("2026-08-17T00:00:00.000Z");
const TEST_WINDOW_END = new Date("2026-08-24T00:00:00.000Z");

const WEEK_ONE_TIMESTAMPS = [
  "2026-08-03 12:00:00",
  "2026-08-04 12:00:00",
  "2026-08-05 12:00:00",
  "2026-08-06 12:00:00",
  "2026-08-07 12:00:00",
] as const;

const WEEK_TWO_TIMESTAMPS = [
  "2026-08-10 12:00:00",
  "2026-08-11 12:00:00",
  "2026-08-12 12:00:00",
  "2026-08-13 12:00:00",
  "2026-08-14 12:00:00",
] as const;

const WEEK_THREE_TIMESTAMPS = ["2026-08-17 12:00:00"] as const;

type FixtureMode = "seed" | "cleanup";

type CliOptions = {
  mode: FixtureMode;
  apply: boolean;
  confirmation?: string;
  help: boolean;
};

type AccountRow = {
  id: string;
  email: string;
  is_active: boolean;
  account_type: string;
  account_owner_id: string | null;
  subscription_id: number | null;
  plan: string | null;
  subscription_status: string | null;
};

type DatabaseIdentityRow = {
  database: string;
  db_user: string;
  utc_now: string;
};

type FixtureRow = {
  id: number;
  brand_id: number | null;
  feature: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cost_micro_usd: string;
  created_at_utc: string;
};

type AiUsageCapsConfig = RegistryAiUsageCapsConfig & Record<string, unknown>;

type FixtureInsert = {
  model: string;
  createdAt: string;
  costMicroUsd: number;
};

type ManifestFixtureRow = FixtureInsert & {
  id: number;
};

type FixtureManifest = {
  version: number;
  databaseId: string;
  targetEmail: string;
  userId: string;
  fixturePrefix: string;
  appliedAt: string;
  appliedUsdGbpRate: number;
  hadPreviousOverride: false;
  previousOverride: null;
  rows: ManifestFixtureRow[];
};

type SpendTotals = {
  monthlyMicroUsd: number;
  fixtureMonthlyMicroUsd: number;
  unrelatedMonthlyMicroUsd: number;
  currentWeekMicroUsd: number;
};

type FxRate = {
  rate: number;
  updatedAt: Date;
  maxAgeMs: number;
};

const DESIRED_OVERRIDE = {
  refreshGbp: WEEKLY_CAP_GBP,
  monthlyGbp: MONTHLY_CAP_GBP,
  cadence: "weekly",
} as const;

function usage(): string {
  return [
    "Usage:",
    "  npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts [--dry-run]",
    "  npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts --apply --confirm-staging=\"<database>@<host>\"",
    "  npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts --cleanup [--dry-run]",
    "  npx tsx --env-file=<staging-env> scripts/seed-staging-ai-cap-fixture.ts --cleanup --apply --confirm-staging=\"<database>@<host>\"",
    "",
    "Dry-run is the default. DATABASE_URL must point at the staging database.",
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions {
  let mode: FixtureMode = "seed";
  let apply = false;
  let dryRun = false;
  let confirmation: string | undefined;
  let help = false;

  for (const arg of args) {
    if (arg === "--cleanup") mode = "cleanup";
    else if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg.startsWith("--confirm-staging=")) confirmation = arg.slice("--confirm-staging=".length);
    else throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (apply && dryRun) throw new Error("Use either --apply or --dry-run, not both");
  return { mode, apply, confirmation, help };
}

function assertStagingCheckout(): void {
  let branch: string;
  try {
    branch = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("Apply mode must run from a Git checkout on the staging branch");
  }
  if (branch !== "staging") {
    throw new Error(`Apply mode is staging-only; current Git branch is ${branch || "detached HEAD"}`);
  }
}

function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseCapsConfig(value: unknown): AiUsageCapsConfig {
  aiUsageCapsSchema.parse(value);
  return parseJsonObject(value, "system_config.ai_usage_caps") as AiUsageCapsConfig;
}

function assertStandardAcceleratePolicy(config: AiUsageCapsConfig): void {
  const policy = config.plans.accelerate;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("ai_usage_caps.plans.accelerate must be configured");
  }
  const values = policy as Record<string, unknown>;
  if (
    values.refreshGbp !== 20 ||
    values.monthlyGbp !== MONTHLY_CAP_GBP ||
    values.cadence !== undefined
  ) {
    throw new Error(
      "Accelerate's plan-wide policy is not the expected daily GBP 20 / monthly GBP 195 policy; " +
      "refusing to claim that the fixture override is account-only",
    );
  }
}

function isDesiredOverride(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const override = value as Record<string, unknown>;
  return (
    Object.keys(override).length === 3 &&
    override.refreshGbp === DESIRED_OVERRIDE.refreshGbp &&
    override.monthlyGbp === DESIRED_OVERRIDE.monthlyGbp &&
    override.cadence === DESIRED_OVERRIDE.cadence
  );
}

function microUsdForGbp(gbp: number, usdGbpRate: number): number {
  return Math.round((gbp / usdGbpRate) * 1_000_000);
}

function gbpForMicroUsd(microUsd: number, usdGbpRate: number): number {
  return (microUsd / 1_000_000) * usdGbpRate;
}

function distribute(total: number, count: number): number[] {
  const quotient = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => quotient + (index < remainder ? 1 : 0));
}

function buildBucket(
  week: string,
  timestamps: readonly string[],
  totalMicroUsd: number,
): FixtureInsert[] {
  return distribute(totalMicroUsd, timestamps.length).map((costMicroUsd, index) => ({
    model: `${FIXTURE_PREFIX}${week}/d${index + 1}`,
    createdAt: timestamps[index],
    costMicroUsd,
  }));
}

function expectedTimestamp(timestamp: string): string {
  return `${timestamp.replace(" ", "T")}Z`;
}

function expectedFixtureSlots(): Array<{ model: string; createdAt: string }> {
  return [
    ...WEEK_ONE_TIMESTAMPS.map((createdAt, index) => ({ model: `${FIXTURE_PREFIX}w1/d${index + 1}`, createdAt })),
    ...WEEK_TWO_TIMESTAMPS.map((createdAt, index) => ({ model: `${FIXTURE_PREFIX}w2/d${index + 1}`, createdAt })),
    ...WEEK_THREE_TIMESTAMPS.map((createdAt, index) => ({ model: `${FIXTURE_PREFIX}w3/d${index + 1}`, createdAt })),
  ];
}

function validateExistingFixture(rows: FixtureRow[]): void {
  const expectedSlots = expectedFixtureSlots();

  if (rows.length !== expectedSlots.length) {
    throw new Error(
      `Partial or unexpected fixture found: expected ${expectedSlots.length} rows, found ${rows.length}. Run cleanup before reseeding.`,
    );
  }

  const byModel = new Map(rows.map((row) => [row.model, row]));
  for (const expected of expectedSlots) {
    const row = byModel.get(expected.model);
    if (!row) throw new Error(`Fixture row is missing: ${expected.model}`);
    if (
      row.created_at_utc !== expectedTimestamp(expected.createdAt) ||
      row.brand_id !== null ||
      row.feature !== "other" ||
      row.provider !== "openai" ||
      Number(row.input_tokens) !== 0 ||
      Number(row.output_tokens) !== 0 ||
      Number(row.thinking_tokens) !== 0 ||
      Number(row.cost_micro_usd) < 0
    ) {
      throw new Error(`Fixture row has unexpected values: ${expected.model}`);
    }
  }
}

function validateFixtureAgainstManifest(
  rows: FixtureRow[],
  manifest: FixtureManifest,
  allowMissing: boolean,
): void {
  const expectedById = new Map(manifest.rows.map((row) => [row.id, row]));
  if (!allowMissing && rows.length !== manifest.rows.length) {
    throw new Error(
      `Fixture manifest expects ${manifest.rows.length} rows, found ${rows.length}`,
    );
  }
  if (rows.length > manifest.rows.length) {
    throw new Error("More fixture-prefix rows exist than the manifest owns");
  }
  for (const row of rows) {
    const expected = expectedById.get(Number(row.id));
    if (
      !expected ||
      row.created_at_utc !== expectedTimestamp(expected.createdAt) ||
      Number(row.cost_micro_usd) !== expected.costMicroUsd ||
      row.brand_id !== null ||
      row.feature !== "other" ||
      row.provider !== "openai" ||
      Number(row.input_tokens) !== 0 ||
      Number(row.output_tokens) !== 0 ||
      Number(row.thinking_tokens) !== 0
    ) {
      throw new Error(`Fixture row does not match its manifest: ${row.model}`);
    }
  }
}

async function getAccount(client: PoolClient): Promise<AccountRow> {
  const result = await client.query<AccountRow>(
    `SELECT
       u.id,
       u.email,
       u.is_active,
       u.account_type,
       tm.account_owner_id,
       s.id AS subscription_id,
       s.plan,
       s.status AS subscription_status
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE lower(u.email) = lower($1)`,
    [TARGET_EMAIL],
  );

  if (result.rows.length !== 1) {
    throw new Error(`Expected exactly one ${TARGET_EMAIL} user, found ${result.rows.length}`);
  }
  const account = result.rows[0];
  if (account.account_owner_id) {
    throw new Error(`${TARGET_EMAIL} is a team member; enforcement belongs to owner ${account.account_owner_id}`);
  }
  if (!account.is_active) throw new Error(`${TARGET_EMAIL} is not an active user`);
  if (account.plan !== "accelerate") {
    throw new Error(`${TARGET_EMAIL} must have plan=accelerate, found ${account.plan ?? "none"}`);
  }
  if (account.subscription_status !== "active") {
    throw new Error(
      `${TARGET_EMAIL} must have an active subscription, found ${account.subscription_status ?? "none"}`,
    );
  }
  return account;
}

async function getOptionalAccount(client: PoolClient): Promise<AccountRow | undefined> {
  const result = await client.query<AccountRow>(
    `SELECT
       u.id,
       u.email,
       u.is_active,
       u.account_type,
       tm.account_owner_id,
       s.id AS subscription_id,
       s.plan,
       s.status AS subscription_status
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE lower(u.email) = lower($1)`,
    [TARGET_EMAIL],
  );
  if (result.rows.length > 1) {
    throw new Error(`Expected at most one ${TARGET_EMAIL} user, found ${result.rows.length}`);
  }
  return result.rows[0];
}

async function getCapsConfig(client: PoolClient, lock: boolean): Promise<AiUsageCapsConfig> {
  const result = await client.query<{ value: unknown }>(
    `SELECT value FROM system_config WHERE key = 'ai_usage_caps'${lock ? " FOR UPDATE" : ""}`,
  );
  if (result.rows.length !== 1) throw new Error("system_config.ai_usage_caps is missing");
  return parseCapsConfig(result.rows[0].value);
}

function parseManifest(value: unknown): FixtureManifest {
  const manifest = parseJsonObject(value, `system_config.${MANIFEST_KEY}`);
  const rows = manifest.rows;
  if (
    manifest.version !== MANIFEST_VERSION ||
    typeof manifest.databaseId !== "string" ||
    manifest.targetEmail !== TARGET_EMAIL ||
    typeof manifest.userId !== "string" ||
    manifest.fixturePrefix !== FIXTURE_PREFIX ||
    typeof manifest.appliedAt !== "string" ||
    !(Number(manifest.appliedUsdGbpRate) > 0) ||
    manifest.hadPreviousOverride !== false ||
    manifest.previousOverride !== null ||
    !Array.isArray(rows)
  ) {
    throw new Error(`${MANIFEST_KEY} is malformed or belongs to another fixture version`);
  }
  const expectedSlots = expectedFixtureSlots();
  if (rows.length !== expectedSlots.length) {
    throw new Error(`${MANIFEST_KEY} must own exactly ${expectedSlots.length} fixture rows`);
  }
  const expectedByModel = new Map(expectedSlots.map((slot) => [slot.model, slot.createdAt]));
  const ids = new Set<number>();
  const models = new Set<string>();
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      typeof row.model !== "string" ||
      !row.model.startsWith(FIXTURE_PREFIX) ||
      typeof row.createdAt !== "string" ||
      !Number.isSafeInteger(row.costMicroUsd) ||
      row.costMicroUsd < 0 ||
      expectedByModel.get(row.model) !== row.createdAt ||
      ids.has(row.id) ||
      models.has(row.model)
    ) {
      throw new Error(`${MANIFEST_KEY} contains an invalid usage row`);
    }
    ids.add(row.id);
    models.add(row.model);
  }
  return manifest as unknown as FixtureManifest;
}

async function getManifest(client: PoolClient, lock: boolean): Promise<FixtureManifest | undefined> {
  const result = await client.query<{ value: unknown }>(
    `SELECT value FROM system_config WHERE key = $1${lock ? " FOR UPDATE" : ""}`,
    [MANIFEST_KEY],
  );
  return result.rows[0] ? parseManifest(result.rows[0].value) : undefined;
}

async function insertManifest(client: PoolClient, manifest: FixtureManifest): Promise<void> {
  await client.query(
    `INSERT INTO system_config (key, value, cache_max_duration_secs, updated_at)
     VALUES ($1, $2::jsonb, NULL, now())`,
    [MANIFEST_KEY, JSON.stringify(manifest)],
  );
}

async function deleteManifest(client: PoolClient): Promise<void> {
  await client.query(`DELETE FROM system_config WHERE key = $1`, [MANIFEST_KEY]);
}

async function getUsdGbpRate(client: PoolClient, lock: boolean): Promise<FxRate> {
  const result = await client.query<{
    rate: string;
    updated_at_utc: string;
    cache_max_duration_secs: number | null;
  }>(
    `SELECT
       value #>> '{}' AS rate,
       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at_utc,
       cache_max_duration_secs
     FROM system_config
     WHERE key = 'usd_gbp_rate'${lock ? " FOR UPDATE" : ""}`,
  );
  const rate = Number(result.rows[0]?.rate);
  if (!(rate > 0)) throw new Error("system_config.usd_gbp_rate is missing or invalid");
  const updatedAt = new Date(result.rows[0]?.updated_at_utc);
  if (!Number.isFinite(updatedAt.getTime())) {
    throw new Error("system_config.usd_gbp_rate has an invalid updated_at timestamp");
  }
  const cacheMaxDurationSecs = Number(result.rows[0]?.cache_max_duration_secs);
  if (!(cacheMaxDurationSecs > 0)) {
    throw new Error("system_config.usd_gbp_rate has an invalid cache_max_duration_secs value");
  }
  return { rate, updatedAt, maxAgeMs: cacheMaxDurationSecs * 1000 };
}

async function getFixtureRows(client: PoolClient, userId: string): Promise<FixtureRow[]> {
  const result = await client.query<FixtureRow>(
    `SELECT
       id,
       brand_id,
       feature,
       provider,
       model,
       input_tokens,
       output_tokens,
       thinking_tokens,
       cost_micro_usd::text,
       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at_utc
     FROM ai_usage_logs
     WHERE user_id = $1 AND model LIKE $2
     ORDER BY model`,
    [userId, `${FIXTURE_PREFIX}%`],
  );
  return result.rows;
}

async function getSpendTotals(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<SpendTotals> {
  const result = await client.query<{
    monthly_micro_usd: string;
    fixture_monthly_micro_usd: string;
    unrelated_monthly_micro_usd: string;
    current_week_micro_usd: string;
  }>(
    `SELECT
       coalesce(sum(cost_micro_usd), 0)::text AS monthly_micro_usd,
       coalesce(sum(cost_micro_usd) FILTER (WHERE model LIKE $2), 0)::text AS fixture_monthly_micro_usd,
       coalesce(sum(cost_micro_usd) FILTER (WHERE model NOT LIKE $2), 0)::text AS unrelated_monthly_micro_usd,
       coalesce(sum(cost_micro_usd) FILTER (
          WHERE created_at >= date_trunc('week', $3::timestamp)
        ), 0)::text AS current_week_micro_usd
     FROM ai_usage_logs
     WHERE user_id = $1
        AND created_at >= date_trunc('month', $3::timestamp)
        AND created_at < date_trunc('month', $3::timestamp) + interval '1 month'`,
    [userId, `${FIXTURE_PREFIX}%`, now.toISOString()],
  );
  const row = result.rows[0];
  return {
    monthlyMicroUsd: Number(row.monthly_micro_usd),
    fixtureMonthlyMicroUsd: Number(row.fixture_monthly_micro_usd),
    unrelatedMonthlyMicroUsd: Number(row.unrelated_monthly_micro_usd),
    currentWeekMicroUsd: Number(row.current_week_micro_usd),
  };
}

function printTotals(label: string, totals: SpendTotals, rate: number): void {
  const monthlyGbp = gbpForMicroUsd(totals.monthlyMicroUsd, rate);
  const currentWeekGbp = gbpForMicroUsd(totals.currentWeekMicroUsd, rate);
  console.log(`\n${label}`);
  console.log(`  UTC monthly total: GBP ${monthlyGbp.toFixed(6)} (${totals.monthlyMicroUsd} micro-USD)`);
  console.log(`  fixture contribution: GBP ${gbpForMicroUsd(totals.fixtureMonthlyMicroUsd, rate).toFixed(6)}`);
  console.log(`  unrelated contribution: GBP ${gbpForMicroUsd(totals.unrelatedMonthlyMicroUsd, rate).toFixed(6)}`);
  console.log(`  current UTC week total: GBP ${currentWeekGbp.toFixed(6)}`);
  console.log(`  weekly cap status: ${currentWeekGbp >= WEEKLY_CAP_GBP ? "BLOCKED" : "below cap"}`);
  console.log(`  monthly cap status: ${monthlyGbp >= MONTHLY_CAP_GBP ? "BLOCKED" : "below cap"}`);
}

function fixtureBucketMicroUsd(rows: FixtureRow[], week: string): number {
  return rows
    .filter((row) => row.model.startsWith(`${FIXTURE_PREFIX}${week}/`))
    .reduce((total, row) => total + Number(row.cost_micro_usd), 0);
}

async function updateCapsConfig(
  client: PoolClient,
  config: AiUsageCapsConfig,
): Promise<void> {
  await client.query(
    `UPDATE system_config SET value = $1::jsonb, updated_at = now() WHERE key = 'ai_usage_caps'`,
    [JSON.stringify(config)],
  );
}

async function insertFixtureRows(
  client: PoolClient,
  userId: string,
  inserts: FixtureInsert[],
): Promise<ManifestFixtureRow[]> {
  const inserted: ManifestFixtureRow[] = [];
  for (const row of inserts) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO ai_usage_logs (
         user_id, brand_id, feature, provider, model,
         input_tokens, output_tokens, thinking_tokens, cost_micro_usd, created_at
       ) VALUES ($1, NULL, 'other', 'openai', $2, 0, 0, 0, $3, $4::timestamp)
       RETURNING id`,
      [userId, row.model, row.costMicroUsd, row.createdAt],
    );
    inserted.push({ ...row, id: result.rows[0].id });
  }
  return inserted;
}

function assertTestWindow(utcNow: Date): void {
  if (utcNow < TEST_WINDOW_START || utcNow >= TEST_WINDOW_END) {
    throw new Error(
      `Seed mode is restricted to the intended August test week ` +
      `(${TEST_WINDOW_START.toISOString()} through ${TEST_WINDOW_END.toISOString()}); database time is ${utcNow.toISOString()}`,
    );
  }
}

async function runSeed(
  client: PoolClient,
  account: AccountRow,
  config: AiUsageCapsConfig,
  manifest: FixtureManifest | undefined,
  databaseId: string,
  rate: number,
  apply: boolean,
  utcNow: Date,
): Promise<boolean> {
  assertTestWindow(utcNow);
  assertStandardAcceleratePolicy(config);
  const existingOverride = config.accountOverrides[account.id];
  const fixtureRows = await getFixtureRows(client, account.id);
  const before = await getSpendTotals(client, account.id, utcNow);
  printTotals("Current database state", before, rate);

  if (fixtureRows.length > 0) {
    if (!manifest) throw new Error("Fixture rows exist without the required ownership manifest");
    if (manifest.databaseId !== databaseId || manifest.userId !== account.id) {
      throw new Error("Fixture manifest belongs to another database or account");
    }
    validateExistingFixture(fixtureRows);
    validateFixtureAgainstManifest(fixtureRows, manifest, false);
    if (!isDesiredOverride(existingOverride)) {
      throw new Error("Fixture rows exist but the account-specific weekly override is missing or changed");
    }
    const monthlyGbp = gbpForMicroUsd(before.monthlyMicroUsd, rate);
    const weekOneGbp = gbpForMicroUsd(fixtureBucketMicroUsd(fixtureRows, "w1"), rate);
    const weekTwoGbp = gbpForMicroUsd(fixtureBucketMicroUsd(fixtureRows, "w2"), rate);
    if (
      Math.round(weekOneGbp * 100) !== WEEKLY_CAP_GBP * 100 ||
      Math.round(weekTwoGbp * 100) !== WEEKLY_CAP_GBP * 100
    ) {
      throw new Error(
        `Fixture weekly buckets no longer equal GBP ${WEEKLY_CAP_GBP.toFixed(2)} ` +
        `(week 1: GBP ${weekOneGbp.toFixed(6)}, week 2: GBP ${weekTwoGbp.toFixed(6)})`,
      );
    }
    if (Math.round(monthlyGbp * 100) !== Math.round(TARGET_MONTHLY_GBP * 100)) {
      throw new Error(
        `Fixture is intact, but current monthly usage is GBP ${monthlyGbp.toFixed(6)}, not ` +
        `GBP ${TARGET_MONTHLY_GBP.toFixed(2)}. FX or subsequent real usage changed the total.`,
      );
    }
    console.log("\nFixture already applied; no rows or config will be changed.");
    console.log(`Verified UTC monthly total: GBP ${monthlyGbp.toFixed(6)}.`);
    return false;
  }

  if (manifest) {
    throw new Error("Fixture ownership manifest exists without its usage rows; run cleanup before reseeding");
  }

  if (existingOverride !== undefined) {
    throw new Error(
      `Account already has an override that this fixture did not create: ${JSON.stringify(existingOverride)}`,
    );
  }

  const targetMicroUsd = microUsdForGbp(TARGET_MONTHLY_GBP, rate);
  const weekOneMicroUsd = microUsdForGbp(WEEKLY_CAP_GBP, rate);
  const weekTwoMicroUsd = microUsdForGbp(WEEKLY_CAP_GBP, rate);
  const weekThreeMicroUsd =
    targetMicroUsd - before.unrelatedMonthlyMicroUsd - weekOneMicroUsd - weekTwoMicroUsd;
  const nominalWeekThreeMicroUsd = microUsdForGbp(34.5, rate);

  if (weekThreeMicroUsd < 0) {
    throw new Error(
      `Existing monthly usage is too high to preserve GBP 80 + GBP 80 and finish at GBP ${TARGET_MONTHLY_GBP.toFixed(2)}`,
    );
  }
  if (weekThreeMicroUsd > nominalWeekThreeMicroUsd + 1) {
    throw new Error("Calculated week-three fixture exceeds its nominal GBP 34.50 budget");
  }

  const inserts = [
    ...buildBucket("w1", WEEK_ONE_TIMESTAMPS, weekOneMicroUsd),
    ...buildBucket("w2", WEEK_TWO_TIMESTAMPS, weekTwoMicroUsd),
    ...buildBucket("w3", WEEK_THREE_TIMESTAMPS, weekThreeMicroUsd),
  ];
  const projected: SpendTotals = {
    monthlyMicroUsd: before.unrelatedMonthlyMicroUsd + inserts.reduce((sum, row) => sum + row.costMicroUsd, 0),
    fixtureMonthlyMicroUsd: inserts.reduce((sum, row) => sum + row.costMicroUsd, 0),
    unrelatedMonthlyMicroUsd: before.unrelatedMonthlyMicroUsd,
    currentWeekMicroUsd: before.currentWeekMicroUsd + weekThreeMicroUsd,
  };

  console.log("\nPlanned account override:", JSON.stringify(DESIRED_OVERRIDE));
  console.log(`Planned fixture week 1 (3-7 Aug): GBP ${gbpForMicroUsd(weekOneMicroUsd, rate).toFixed(6)}`);
  console.log(`Planned fixture week 2 (10-14 Aug): GBP ${gbpForMicroUsd(weekTwoMicroUsd, rate).toFixed(6)}`);
  console.log(
    `Planned fixture week 3 (17 Aug): GBP ${gbpForMicroUsd(weekThreeMicroUsd, rate).toFixed(6)}` +
    (before.unrelatedMonthlyMicroUsd > 0 ? " (adjusted for unrelated monthly usage)" : ""),
  );
  printTotals("Projected database state", projected, rate);

  const projectedGbp = gbpForMicroUsd(projected.monthlyMicroUsd, rate);
  if (Math.round(projectedGbp * 100) !== Math.round(TARGET_MONTHLY_GBP * 100)) {
    throw new Error(`Projected monthly total is not GBP ${TARGET_MONTHLY_GBP.toFixed(2)}`);
  }
  if (projectedGbp >= MONTHLY_CAP_GBP) {
    throw new Error("Projected monthly total would already trigger the hard cap");
  }
  if (gbpForMicroUsd(projected.currentWeekMicroUsd, rate) >= WEEKLY_CAP_GBP) {
    throw new Error("Projected current-week total would already trigger the weekly cap");
  }

  if (!apply) {
    console.log("\nDry run only; no data changed.");
    return false;
  }

  const nextConfig: AiUsageCapsConfig = {
    ...config,
    accountOverrides: {
      ...config.accountOverrides,
      [account.id]: DESIRED_OVERRIDE,
    },
  };
  await updateCapsConfig(client, nextConfig);
  const insertedRows = await insertFixtureRows(client, account.id, inserts);
  await insertManifest(client, {
    version: MANIFEST_VERSION,
    databaseId,
    targetEmail: TARGET_EMAIL,
    userId: account.id,
    fixturePrefix: FIXTURE_PREFIX,
    appliedAt: utcNow.toISOString(),
    appliedUsdGbpRate: rate,
    hadPreviousOverride: false,
    previousOverride: null,
    rows: insertedRows,
  });

  const after = await getSpendTotals(client, account.id, utcNow);
  if (after.monthlyMicroUsd !== targetMicroUsd) {
    throw new Error(
      `Transactional verification failed: expected ${targetMicroUsd} monthly micro-USD, found ${after.monthlyMicroUsd}`,
    );
  }
  printTotals("Verified transactional state", after, rate);
  return true;
}

async function runCleanup(
  client: PoolClient,
  account: AccountRow | undefined,
  config: AiUsageCapsConfig,
  manifest: FixtureManifest | undefined,
  databaseId: string,
  rate: number,
  apply: boolean,
  utcNow: Date,
): Promise<boolean> {
  if (!manifest) {
    if (!account) {
      console.log("No fixture manifest or target account exists; cleanup has nothing to do.");
      return false;
    }
    const unownedRows = await getFixtureRows(client, account.id);
    if (unownedRows.length > 0) {
      throw new Error("Fixture-prefix rows exist without an ownership manifest; refusing cleanup");
    }
    console.log("No fixture manifest or fixture rows exist; cleanup has nothing to do.");
    return false;
  }
  if (manifest.databaseId !== databaseId) {
    throw new Error(`Fixture manifest belongs to ${manifest.databaseId}, not ${databaseId}`);
  }
  if (account && account.id !== manifest.userId) {
    console.log(
      `Current target-email user ${account.id} differs from fixture owner ${manifest.userId}; ` +
      "cleanup will use the manifest owner.",
    );
  }

  const fixtureRows = await getFixtureRows(client, manifest.userId);
  validateFixtureAgainstManifest(fixtureRows, manifest, true);
  const existingOverride = config.accountOverrides[manifest.userId];
  const restoreOverride = isDesiredOverride(existingOverride);
  const before = await getSpendTotals(client, manifest.userId, utcNow);
  printTotals("Current database state", before, rate);

  console.log(`\nFixture rows to delete: ${fixtureRows.length}`);
  if (restoreOverride) console.log("Fixture account override will be removed.");
  else if (existingOverride === undefined) console.log("No account override exists.");
  else console.log(`Account override has changed and will be preserved: ${JSON.stringify(existingOverride)}`);

  if (!apply) {
    console.log("\nCleanup dry run only; no data changed.");
    return false;
  }

  if (fixtureRows.length > 0) {
    await client.query(
      `DELETE FROM ai_usage_logs WHERE user_id = $1 AND id = ANY($2::int[])`,
      [manifest.userId, manifest.rows.map((row) => row.id)],
    );
  }
  if (restoreOverride) {
    const nextOverrides = { ...config.accountOverrides };
    delete nextOverrides[manifest.userId];
    await updateCapsConfig(client, { ...config, accountOverrides: nextOverrides });
  }

  const afterRows = await getFixtureRows(client, manifest.userId);
  if (afterRows.length !== 0) throw new Error("Transactional cleanup verification found remaining fixture rows");
  await deleteManifest(client);
  printTotals("Verified transactional cleanup state", await getSpendTotals(client, manifest.userId, utcNow), rate);
  return true;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.apply) assertStagingCheckout();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must point at the staging database");
  const databaseUrl = new URL(connectionString);
  const pool = getPool(connectionString);
  const client = await pool.connect();
  const advisoryLockKey = `${TARGET_EMAIL}:${FIXTURE_PREFIX}`;
  let advisoryLockHeld = false;

  try {
    const preflight = await client.query<Pick<DatabaseIdentityRow, "database" | "db_user">>(
      `SELECT current_database() AS database, current_user AS db_user`,
    );
    const databaseId = `${preflight.rows[0].database}@${databaseUrl.hostname}`;
    console.log(`Mode: ${options.mode} ${options.apply ? "APPLY" : "DRY RUN"}`);
    console.log(`Target account: ${TARGET_EMAIL}`);
    console.log(`Database: ${preflight.rows[0].database}`);
    console.log(`Host: ${databaseUrl.hostname}`);
    console.log(`Database user: ${preflight.rows[0].db_user}`);

    if (options.apply && options.confirmation !== databaseId) {
      throw new Error(
        `Staging confirmation mismatch. Re-run the dry run, then pass ` +
        `--confirm-staging=${JSON.stringify(databaseId)}`,
      );
    }

    if (options.apply) {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [advisoryLockKey]);
      advisoryLockHeld = true;
    }

    await client.query(options.apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      if (options.apply) {
        // Wait for existing writers, then block provider logging and config
        // updates until the fixture is verified and committed.
        await client.query("LOCK TABLE ai_usage_logs IN SHARE ROW EXCLUSIVE MODE");
        await client.query("LOCK TABLE system_config IN SHARE ROW EXCLUSIVE MODE");
      }

      const identityResult = await client.query<DatabaseIdentityRow>(
        `SELECT
           current_database() AS database,
           current_user AS db_user,
           to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS utc_now`,
      );
      const identity = identityResult.rows[0];
      const utcNow = new Date(identity.utc_now);
      console.log(`Database UTC time: ${identity.utc_now}`);

      const account = options.mode === "seed"
        ? await getAccount(client)
        : await getOptionalAccount(client);
      const config = await getCapsConfig(client, options.apply);
      const manifest = await getManifest(client, options.apply);
      const fx = await getUsdGbpRate(client, options.apply);
      const fxAgeMs = utcNow.getTime() - fx.updatedAt.getTime();
      if (account) {
        console.log(`Account ID: ${account.id}`);
        console.log(`Subscription: ${account.plan}/${account.subscription_status ?? "unknown"}`);
      } else {
        console.log("Target account no longer exists; cleanup will rely on the fixture manifest.");
      }
      console.log(`USD/GBP rate: ${fx.rate} (updated ${fx.updatedAt.toISOString()})`);

      if (options.mode === "seed" && options.apply && (fxAgeMs < 0 || fxAgeMs > fx.maxAgeMs)) {
        throw new Error(
          "The stored USD/GBP rate is stale according to its configured TTL. Request /api/ai-usage/status " +
          "through the staging app to trigger an FX refresh, then rerun the dry run and apply.",
        );
      }

      const changed = options.mode === "cleanup"
        ? await runCleanup(client, account, config, manifest, databaseId, fx.rate, options.apply, utcNow)
        : await runSeed(client, account!, config, manifest, databaseId, fx.rate, options.apply, utcNow);

      await client.query(options.apply ? "COMMIT" : "ROLLBACK");
      if (options.apply) {
        console.log(changed ? "\nChanges committed." : "\nNo changes needed.");
        console.log("Restart every staging app instance before testing so config and spend caches reload.");
      } else {
        console.log(`To apply against this exact database, add --apply --confirm-staging=${JSON.stringify(databaseId)}`);
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    if (advisoryLockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [advisoryLockKey]);
      } catch (error) {
        console.error("Failed to release fixture advisory lock:", error);
      }
    }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
