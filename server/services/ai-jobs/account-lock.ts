import { sql } from "drizzle-orm";

export function aiJobAccountLockQuery(accountOwnerId: string) {
  return sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`ai-job-account:${accountOwnerId}`}, 0)
    )
  `;
}
