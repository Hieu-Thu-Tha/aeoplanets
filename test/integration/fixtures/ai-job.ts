import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { AiFeature } from "../../../server/services/ai-usage";
import {
  aiCostEstimations,
  aiJobs,
  aiUsageLogs,
  users,
  type AiEstimatedCallTokens,
  type AiJob,
  type AiJobModelCall,
} from "@shared/schema";
import { hashAiJobModelProfile } from "../../../server/services/ai-jobs/profile";
import type { PricedMeterUsage } from "@shared/ai-billing";

export type TestDatabase = ReturnType<typeof drizzle>;

export type SeededAiCall = AiEstimatedCallTokens & {
  costMicroUsd: number;
  feature?: AiFeature;
  meters?: PricedMeterUsage[];
};

export class AiJobDatabaseFixture {
  private readonly ownerIds = new Set<string>();
  private readonly estimationKeys = new Set<string>();

  constructor(readonly database: TestDatabase) {}

  async createOwner(): Promise<string> {
    const id = randomUUID();
    await this.database.insert(users).values({
      id,
      email: `${id}@example.test`,
    });
    this.ownerIds.add(id);
    return id;
  }

  async seedSettledUsage(input: {
    accountOwnerId: string;
    costMicroUsd: number;
    createdAt: Date;
    feature?: AiFeature;
  }): Promise<void> {
    await this.database.insert(aiUsageLogs).values({
      userId: input.accountOwnerId,
      feature: input.feature ?? "report",
      provider: "gemini",
      model: "gemini-2.5-flash",
      costMicroUsd: input.costMicroUsd,
      createdAt: input.createdAt,
    });
  }

  async seedReservedJob(input: {
    accountOwnerId: string;
    reservedCostMicroUsd: number;
    now: Date;
    feature?: AiFeature;
  }): Promise<AiJob> {
    const [job] = await this.database.insert(aiJobs).values({
      accountOwnerId: input.accountOwnerId,
      feature: input.feature ?? "report",
      reservedCostMicroUsd: input.reservedCostMicroUsd,
      expiresAt: new Date(input.now.getTime() + 60 * 60 * 1000),
      createdAt: input.now,
      updatedAt: input.now,
    }).returning();
    return job;
  }

  async seedCompletedJob(input: {
    accountOwnerId: string;
    feature: AiFeature;
    profile: AiJobModelCall[];
    calls: SeededAiCall[];
    finishedAt: Date;
    status?: "completed" | "failed";
  }): Promise<AiJob> {
    if (input.profile.length !== input.calls.length || input.profile.length === 0) {
      throw new RangeError("Completed AI job fixtures require one usage row per profile call");
    }
    const modelsHash = hashAiJobModelProfile(input.profile);
    const [job] = await this.database.insert(aiJobs).values({
      accountOwnerId: input.accountOwnerId,
      feature: input.feature,
      entryProvider: input.profile[0].provider,
      entryModel: input.profile[0].model,
      entryMeters: input.profile[0].meters,
      status: input.status ?? "completed",
      reservedCostMicroUsd: Math.max(
        1,
        input.calls.reduce((total, call) => total + call.costMicroUsd, 0),
      ),
      modelsHash,
      modelProfile: input.profile,
      expiresAt: input.finishedAt,
      finishedAt: input.finishedAt,
      createdAt: input.finishedAt,
      updatedAt: input.finishedAt,
    }).returning();
    await this.database.insert(aiUsageLogs).values(input.calls.map((call, callIndex) => ({
      userId: input.accountOwnerId,
      jobId: job.id,
      callIndex,
      feature: call.feature ?? input.feature,
      provider: call.provider,
      model: call.model,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      thinkingTokens: call.thinkingTokens,
      cacheReadTokens: call.cacheReadTokens,
      cacheWriteTokens: call.cacheWriteTokens,
      cacheWrite1hTokens: call.cacheWrite1hTokens,
      costMicroUsd: call.costMicroUsd,
      meters: call.meters ?? [],
      createdAt: input.finishedAt,
    })));
    this.estimationKeys.add(`${input.feature}\0${modelsHash}`);
    return job;
  }

  trackEstimation(feature: AiFeature, modelsHash: string): void {
    this.estimationKeys.add(`${feature}\0${modelsHash}`);
  }

  async cleanup(): Promise<void> {
    for (const key of Array.from(this.estimationKeys)) {
      const [feature, modelsHash] = key.split("\0");
      await this.database.delete(aiCostEstimations).where(and(
        eq(aiCostEstimations.feature, feature),
        eq(aiCostEstimations.modelsHash, modelsHash),
      ));
    }
    if (this.ownerIds.size > 0) {
      await this.database.delete(users).where(inArray(users.id, Array.from(this.ownerIds)));
    }
  }
}
