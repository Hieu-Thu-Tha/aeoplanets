import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env.test")) loadEnvFile(".env.test");
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/aeostars_unit_test";
