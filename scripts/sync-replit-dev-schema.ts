/**
 * Replit keeps a disposable development Postgres database alongside the
 * deployment database. Before publishing, keep only its schema aligned with
 * shared/schema.ts so Replit cannot sync an older development schema down to
 * production.
 *
 * The `helium` hostname is available inside Replit. Outside Replit, the
 * connection probe fails and this script intentionally does nothing.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const REPLIT_DEV_DATABASE_URL =
  "postgresql://postgres:password@helium/heliumdb?sslmode=disable";
const CONNECTION_TIMEOUT_MS = 2_000;

function isDatabaseReachable(connectionString: string): Promise<boolean> {
  const url = new URL(connectionString);
  const port = Number(url.port || 5432);

  return new Promise((resolveReachability) => {
    const socket = createConnection({ host: url.hostname, port });

    const finish = (reachable: boolean) => {
      socket.destroy();
      resolveReachability(reachable);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function pushCanonicalSchema(): Promise<void> {
  const drizzleKit = resolve(
    "node_modules/.bin",
    process.platform === "win32" ? "drizzle-kit.cmd" : "drizzle-kit",
  );

  return new Promise((resolvePush, rejectPush) => {
    const child = spawn(drizzleKit, ["push", "--force"], {
      env: {
        ...process.env,
        DATABASE_URL: REPLIT_DEV_DATABASE_URL,
      },
      stdio: "inherit",
    });

    child.once("error", rejectPush);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePush();
        return;
      }

      rejectPush(
        new Error(
          signal
            ? `drizzle-kit push was terminated by ${signal}`
            : `drizzle-kit push exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function main() {
  if (!(await isDatabaseReachable(REPLIT_DEV_DATABASE_URL))) {
    console.log(
      "Replit-local Postgres is not reachable; skipping development schema sync.",
    );
    return;
  }

  console.log(
    "Replit-local Postgres is reachable; force-pushing the canonical schema.",
  );
  await pushCanonicalSchema();
  console.log("Replit-local database schema is up to date.");
}

main().catch((error) => {
  console.error("Failed to sync the Replit-local database schema:", error);
  process.exit(1);
});
