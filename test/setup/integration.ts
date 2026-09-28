import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env.test")) loadEnvFile(".env.test");
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}

process.env.DATABASE_URL = testDatabaseUrl;
