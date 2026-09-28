/**
 * Applies pending SQL migrations using the same Neon driver as the app.
 * Pass --backup to create, verify, encrypt, and upload a database dump before
 * applying migrations.
 */
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { getPool } from "../server/utils/db-helper";

const loadedEnv = loadEnv({ path: ".env", override: true, quiet: true });
const envError = loadedEnv.error as NodeJS.ErrnoException | undefined;
if (envError && envError.code !== "ENOENT") {
  throw envError;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; quietStdout?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["ignore", options.quietStdout ? "ignore" : "inherit", "inherit"],
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} was terminated by ${signal}`
            : `${command} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("error", reject);
    input.once("end", () => resolve(hash.digest("hex")));
  });
}

function containsSemver(value: string): boolean {
  return /(?<![0-9])(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![0-9])/.test(
    value,
  );
}

async function backupDatabase(databaseUrl: string): Promise<void> {
  const environment = requiredEnv("DEPLOY_ENVIRONMENT");
  const deployTag = requiredEnv("DEPLOY_TAG");

  if (!/^[a-zA-Z0-9_-]+$/.test(environment)) {
    throw new Error("DEPLOY_ENVIRONMENT contains unsupported characters");
  }
  if (!containsSemver(deployTag)) {
    throw new Error(
      `Invalid DEPLOY_TAG '${deployTag}'; must contain a semantic version like X.Y.Z`,
    );
  }

  const encryptionKey = requiredEnv("BACKUP_ENCRYPTION_KEY");
  const region = requiredEnv("BACKUP_S3_REGION");
  const bucket = requiredEnv("BACKUP_S3_BUCKET");
  const endpoint = process.env.BACKUP_S3_ENDPOINT || undefined;
  const prefix =
    process.env.BACKUP_S3_PREFIX || `aeostars-${environment}`;
  const postgresImage = process.env.POSTGRES_IMAGE || "postgres:17-alpine";

  if (
    !/^[a-zA-Z0-9._/-]+$/.test(prefix) ||
    prefix.startsWith("/") ||
    prefix.includes("..")
  ) {
    throw new Error("BACKUP_S3_PREFIX is invalid");
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const runSuffix = process.env.GITHUB_RUN_ID
    ? `-run-${process.env.GITHUB_RUN_ID}`
    : "";
  const backupName = `aeostars-${environment}-${deployTag}-${timestamp}${runSuffix}`;
  const backupDir = await mkdtemp(join(tmpdir(), "aeostars-db-backup-"));
  const dumpPath = join(backupDir, `${backupName}.dump`);
  const encryptedPath = `${dumpPath}.enc`;
  const checksumPath = `${encryptedPath}.sha256`;
  const objectKey = `${prefix.replace(/\/$/, "")}/${deployTag}/${basename(encryptedPath)}`;
  const objectUri = `s3://${bucket}/${objectKey}`;

  const dockerDatabaseUrl = new URL(databaseUrl);

  if (
    dockerDatabaseUrl.hostname === "127.0.0.1" ||
    dockerDatabaseUrl.hostname === "localhost"
  ) {
    dockerDatabaseUrl.hostname = "host.docker.internal";
  }

  try {
    console.log(`Creating database backup for ${environment} tag ${deployTag}`);
    await runCommand(
      "docker",
      [
        "run",
        "--rm",
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "-e",
        "DATABASE_URL",
        "-e",
        `BACKUP_NAME=${backupName}`,
        "-v",
        `${backupDir}:/backup`,
        postgresImage,
        "sh",
        "-euc",
        'pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file="/backup/${BACKUP_NAME}.dump"',
      ],
      { env: { ...process.env, DATABASE_URL: dockerDatabaseUrl.toString() } },
    );

    const dumpStats = await stat(dumpPath);
    if (dumpStats.size === 0) throw new Error("Database dump is empty");

    await runCommand(
      "docker",
      [
        "run",
        "--rm",
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "-v",
        `${backupDir}:/backup:ro`,
        postgresImage,
        "pg_restore",
        "--list",
        `/backup/${backupName}.dump`,
      ],
      { quietStdout: true },
    );

    console.log("Encrypting database backup");
    await runCommand(
      "openssl",
      [
        "enc",
        "-aes-256-cbc",
        "-salt",
        "-pbkdf2",
        "-iter",
        "200000",
        "-pass",
        "env:BACKUP_ENCRYPTION_KEY",
        "-in",
        dumpPath,
        "-out",
        encryptedPath,
      ],
      { env: { ...process.env, BACKUP_ENCRYPTION_KEY: encryptionKey } },
    );
    await rm(dumpPath, { force: true });

    const encryptedStats = await stat(encryptedPath);
    const checksum = await sha256File(encryptedPath);
    await writeFile(checksumPath, `${checksum}  ${basename(encryptedPath)}\n`, {
      mode: 0o600,
    });

    const s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === "true",
    });
    try {
      console.log(`Uploading database backup to ${objectUri}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: createReadStream(encryptedPath),
          ContentLength: encryptedStats.size,
          ContentType: "application/octet-stream",
          Metadata: { environment, deployTag, sha256: checksum },
        }),
      );
      const checksumStats = await stat(checksumPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${objectKey}.sha256`,
          Body: createReadStream(checksumPath),
          ContentLength: checksumStats.size,
          ContentType: "text/plain",
        }),
      );
      const uploaded = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (uploaded.ContentLength !== encryptedStats.size) {
        throw new Error("Uploaded backup size does not match the local archive");
      }
    } finally {
      s3.destroy();
    }

    console.log(`Backup verified at ${objectUri}`);
    if (process.env.GITHUB_OUTPUT) {
      const databaseUrlSha256 = createHash("sha256")
        .update(databaseUrl)
        .digest("hex");
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `object_uri=${objectUri}\ndatabase_url_sha256=${databaseUrlSha256}\n`,
      );
    }
  } finally {
    await rm(backupDir, { recursive: true, force: true });
  }
}

async function main() {
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--backup");
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
  }

  const databaseUrl = requiredEnv("DATABASE_URL");
  const target = new URL(databaseUrl);
  console.log("Database target:", {
    source: loadedEnv.parsed?.DATABASE_URL ? ".env" : "process environment",
    host: target.hostname,
    port: target.port || "5432",
    database: target.pathname.slice(1),
    user: target.username,
  });
  if (process.argv.includes("--backup")) await backupDatabase(databaseUrl);

  const pool = getPool(databaseUrl);
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./migrations" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
