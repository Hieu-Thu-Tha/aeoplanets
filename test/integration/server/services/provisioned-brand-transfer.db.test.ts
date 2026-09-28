import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  actionTickets,
  aiJobs,
  aiUsageLogs,
  brands,
  trackedTerms,
  userQuestions,
  users,
} from "@shared/schema";
import { transferProvisionedBrandOwnership } from "../../../../server/services/provisioned-brand-transfer";
import { createTestDatabasePool, resetTestDatabase } from "../../helpers/postgres";

before(resetTestDatabase);

test("provisioned brand transfer preserves brand-scoped AI attribution", async () => {
  const pool = createTestDatabasePool();
  const database = drizzle(pool);
  const previousOwnerId = randomUUID();
  const newOwnerId = randomUUID();
  const unrelatedOwnerId = randomUUID();

  try {
    await database.insert(users).values([
      { id: previousOwnerId, email: `${previousOwnerId}@example.test` },
      { id: newOwnerId, email: `${newOwnerId}@example.test` },
      { id: unrelatedOwnerId, email: `${unrelatedOwnerId}@example.test` },
    ]);
    const [brand] = await database.insert(brands).values({
      userId: previousOwnerId,
      domain: "https://provisioned.example",
    }).returning();
    const [term] = await database.insert(trackedTerms).values({
      brandId: brand.id,
      userId: previousOwnerId,
      term: "provisioned example",
    }).returning();
    await database.insert(userQuestions).values({
      trackedTermId: term.id,
      userId: previousOwnerId,
      question: "What is the provisioned example?",
    });
    await database.insert(actionTickets).values({
      brandId: brand.id,
      userId: previousOwnerId,
      title: "Provisioned finding",
      source: "perception",
    });
    const [job] = await database.insert(aiJobs).values({
      accountOwnerId: previousOwnerId,
      brandId: brand.id,
      feature: "visibility_scan",
      status: "completed",
      reservedCostMicroUsd: 100,
      expiresAt: new Date("2026-08-09T21:05:00.000Z"),
      finishedAt: new Date("2026-08-09T21:05:00.000Z"),
    }).returning();
    await database.insert(aiUsageLogs).values([
      {
        userId: previousOwnerId,
        brandId: brand.id,
        jobId: job.id,
        callIndex: 0,
        feature: "visibility_scan",
        provider: "gemini",
        model: "gemini-2.5-flash",
        costMicroUsd: 100,
      },
      {
        userId: unrelatedOwnerId,
        brandId: brand.id,
        feature: "other",
        provider: "openai",
        model: "gpt-4o-mini",
        costMicroUsd: 1,
      },
      {
        userId: previousOwnerId,
        brandId: null,
        feature: "provisioning_research",
        provider: "gemini",
        model: "gemini-3.1-pro-preview",
        costMicroUsd: 25,
      },
    ]);

    const transferred = await transferProvisionedBrandOwnership(database, brand.id, newOwnerId);
    assert.equal(transferred.brand.userId, newOwnerId);

    assert.equal((await database.select().from(trackedTerms).where(eq(trackedTerms.id, term.id)))[0].userId, newOwnerId);
    assert.equal((await database.select().from(userQuestions).where(eq(userQuestions.trackedTermId, term.id)))[0].userId, newOwnerId);
    assert.equal((await database.select().from(actionTickets).where(eq(actionTickets.brandId, brand.id)))[0].userId, newOwnerId);
    assert.equal((await database.select().from(aiJobs).where(eq(aiJobs.id, job.id)))[0].accountOwnerId, newOwnerId);

    const usage = await database.select().from(aiUsageLogs).orderBy(aiUsageLogs.id);
    assert.equal(usage[0].userId, newOwnerId);
    assert.equal(usage[1].userId, unrelatedOwnerId);
    assert.equal(usage[2].userId, previousOwnerId);
  } finally {
    await database.delete(users).where(eq(users.id, previousOwnerId));
    await database.delete(users).where(eq(users.id, newOwnerId));
    await database.delete(users).where(eq(users.id, unrelatedOwnerId));
    await pool.end();
  }
});
