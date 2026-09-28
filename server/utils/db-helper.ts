import pg, { type Pool as PoolType } from "pg";

const { Pool } = pg;

function resolveSslConfig(connectionString: string): { rejectUnauthorized: false } | undefined {
  const url = new URL(connectionString);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.searchParams.get("sslmode") === "disable") return undefined;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "host.docker.internal" ||
    host === "host.containers.internal"
  ) return undefined;
  return { rejectUnauthorized: false };
}

export function getPool(connectionString: string, maxConnections?: number): PoolType {
  const sslConfig = resolveSslConfig(connectionString);
  return new Pool({
    connectionString,
    max: maxConnections,
    ...(sslConfig && { ssl: sslConfig })
  });
}