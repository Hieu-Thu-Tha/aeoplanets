import {
  actionTickets,
  aiJobs,
  aiUsageLogs,
  brands,
  trackedTerms,
  userQuestions,
  type Brand,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

type TransactionalDatabase = {
  transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
};

export async function transferProvisionedBrandOwnership(
  database: TransactionalDatabase,
  brandId: number,
  newOwnerId: string,
): Promise<{ brand: Brand; previousOwnerId: string }> {
  return database.transaction(async (tx) => {
    const [currentBrand] = await tx.select().from(brands)
      .where(eq(brands.id, brandId))
      .for("update");
    if (!currentBrand) throw new Error("Provisioned brand not found");

    const previousOwnerId = currentBrand.userId;
    await tx.update(userQuestions)
      .set({ userId: newOwnerId })
      .where(and(
        eq(userQuestions.userId, previousOwnerId),
        inArray(
          userQuestions.trackedTermId,
          tx.select({ id: trackedTerms.id }).from(trackedTerms).where(eq(trackedTerms.brandId, brandId)),
        ),
      ));
    await tx.update(trackedTerms)
      .set({ userId: newOwnerId })
      .where(and(eq(trackedTerms.brandId, brandId), eq(trackedTerms.userId, previousOwnerId)));
    await tx.update(actionTickets)
      .set({ userId: newOwnerId, updatedAt: new Date() })
      .where(and(eq(actionTickets.brandId, brandId), eq(actionTickets.userId, previousOwnerId)));
    await tx.update(aiJobs)
      .set({ accountOwnerId: newOwnerId, updatedAt: new Date() })
      .where(and(eq(aiJobs.brandId, brandId), eq(aiJobs.accountOwnerId, previousOwnerId)));
    await tx.update(aiUsageLogs)
      .set({ userId: newOwnerId })
      .where(and(eq(aiUsageLogs.brandId, brandId), eq(aiUsageLogs.userId, previousOwnerId)));

    const [brand] = await tx.update(brands)
      .set({ userId: newOwnerId, updatedAt: new Date() })
      .where(eq(brands.id, brandId))
      .returning();
    return { brand, previousOwnerId };
  });
}
