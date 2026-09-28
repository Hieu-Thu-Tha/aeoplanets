import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";

const integrationTestDirectory = "test/integration/server/services";
const testArguments = [
  "--import",
  "tsx",
  "--import",
  "./test/setup/integration.ts",
  "--test",
  "--test-concurrency=1",
  ...readdirSync(integrationTestDirectory)
    .filter((file) => file.endsWith(".test.ts"))
    .sort()
    .map((file) => `${integrationTestDirectory}/${file}`),
];

type EphemeralDatabase = {
  dataDirectory: string;
  url: string;
};

function terminateProcess(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function stopEphemeralDatabase(dataDirectory: string): void {
  const postgresDirectory = readdirSync(dataDirectory, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && existsSync(
      join(dataDirectory, entry.name, "PG_VERSION"),
    ));
  if (!postgresDirectory) {
    throw new Error(`Could not locate ephemeral PostgreSQL data under ${dataDirectory}`);
  }
  const result = spawnSync("pg_ctl", [
    "-w",
    "-t",
    "10",
    "-D",
    join(dataDirectory, postgresDirectory.name),
    "-m",
    "fast",
    "stop",
  ], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`pg_ctl stop exited with status ${result.status}`);
  }

  const watchdogs = spawnSync("pgrep", ["-f", `pg_tmp -w 300 -d ${dataDirectory}`], {
    encoding: "utf8",
  });
  if (watchdogs.error || (watchdogs.status !== 0 && watchdogs.status !== 1)) {
    throw watchdogs.error ?? new Error(`pgrep exited with status ${watchdogs.status}`);
  }
  for (const pid of watchdogs.stdout.trim().split("\n").filter(Boolean)) {
    const children = spawnSync("pgrep", ["-P", pid], { encoding: "utf8" });
    if (children.error || (children.status !== 0 && children.status !== 1)) {
      throw children.error ?? new Error(`pgrep -P exited with status ${children.status}`);
    }
    for (const childPid of children.stdout.trim().split("\n").filter(Boolean)) {
      terminateProcess(Number(childPid));
    }
    terminateProcess(Number(pid));
  }
  rmSync(dataDirectory, { recursive: true, force: true });
}

async function createEphemeralTestDatabase(): Promise<EphemeralDatabase> {
  const dataDirectory = mkdtempSync(join(tmpdir(), "aeostars-ephemeralpg-"));
  const result = spawnSync("pg_tmp", [
    "-t",
    "-w",
    "300",
    "-d",
    dataDirectory,
    "-o",
    "-c listen_addresses=127.0.0.1",
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    rmSync(dataDirectory, { recursive: true, force: true });
    throw new Error(
      "TEST_DATABASE_URL is not set and pg_tmp could not start. "
        + "Install ephemeralpg or provide a local PostgreSQL test database.\n"
        + (result.error?.message ?? result.stderr),
    );
  }

  try {
    const maintenanceUrl = result.stdout.trim();
    const client = new pg.Client({ connectionString: maintenanceUrl });
    await client.connect();
    try {
      await client.query("CREATE DATABASE aeostars_test");
    } finally {
      await client.end();
    }

    const testUrl = new URL(maintenanceUrl);
    testUrl.pathname = "/aeostars_test";
    return { dataDirectory, url: testUrl.toString() };
  } catch (error) {
    stopEphemeralDatabase(dataDirectory);
    throw error;
  }
}

async function main(): Promise<number> {
  if (existsSync(".env.test")) loadEnvFile(".env.test");
  const ephemeral = process.env.TEST_DATABASE_URL
    ? undefined
    : await createEphemeralTestDatabase();
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? ephemeral!.url;

  try {
    const testProcess = spawnSync(process.execPath, testArguments, {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
      stdio: "inherit",
    });
    if (testProcess.error) throw testProcess.error;
    return testProcess.status ?? 1;
  } finally {
    if (ephemeral) stopEphemeralDatabase(ephemeral.dataDirectory);
  }
}

void main().then(
  (status) => {
    process.exitCode = status;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
