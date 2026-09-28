// Generic PostgreSQL connection (works with Neon, local Postgres, RDS,
// Supabase, Docker, etc). Previously used @neondatabase/serverless which
// tunnels over WebSocket and only works against Neon — hence the ws shim.
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { getPool } from "./utils/db-helper";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DEFAULT_MAX_CONNECTIONS = 10;
export const pool = getPool(process.env.DATABASE_URL, DEFAULT_MAX_CONNECTIONS);
export const db = drizzle(pool, { schema });