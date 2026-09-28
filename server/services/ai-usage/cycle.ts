export type AiUsageRefreshCadence = "daily" | "weekly" | "monthly";

export interface UtcCycleWindow {
  start: Date;
  end: Date;
}

export interface AiUsageCycleSpendCacheEntry extends UtcCycleWindow {
  costMicroUsd: number;
}

export function sumAiUsageCostMicroUsd(
  rows: ReadonlyArray<{ costMicroUsd: number }>,
): number {
  return rows.reduce((total, row) => total + Number(row.costMicroUsd), 0);
}

/**
 * Return the system-wide UTC window containing `now`.
 * Weekly windows follow ISO convention and begin Monday at 00:00 UTC.
 */
export function getUtcCycleWindow(
  cadence: AiUsageRefreshCadence,
  now: Date = new Date(),
): UtcCycleWindow {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("Cannot calculate an AI usage cycle for an invalid date");
  }

  if (cadence === "daily") {
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  if (cadence === "weekly") {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
    ));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

type CycleSpendLoader = (now: Date) => Promise<AiUsageCycleSpendCacheEntry>;

/**
 * Process-local, invalidation-driven cache for current-cycle spend.
 *
 * It has no duration-based TTL. Entries are refreshed after a successful
 * usage-log insert, after a subscription mutation, or when their UTC cycle
 * ends. Promises are cached too, so concurrent cold reads share one DB query.
 */
export class AiUsageCycleSpendCache {
  private readonly entries = new Map<string, Promise<AiUsageCycleSpendCacheEntry>>();

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  invalidateNamespace(namespace: string): void {
    const prefix = `${namespace}\0`;
    for (const key of this.entries.keys()) {
      if (key === namespace || key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  async getOrLoad(
    userId: string,
    loader: CycleSpendLoader,
    getNow: () => Date = () => new Date(),
  ): Promise<AiUsageCycleSpendCacheEntry> {
    for (;;) {
      const now = getNow();
      let pending = this.entries.get(userId);

      if (!pending) {
        pending = Promise.resolve().then(() => loader(now));
        this.entries.set(userId, pending);
      }

      let entry: AiUsageCycleSpendCacheEntry;
      try {
        entry = await pending;
      } catch (error) {
        if (this.entries.get(userId) === pending) this.entries.delete(userId);
        throw error;
      }

      // An insert or plan change happened while the aggregate was loading.
      // Discard that result and query again instead of serving a stale value.
      if (this.entries.get(userId) !== pending) continue;

      const currentTime = getNow().getTime();
      const startTime = entry.start.getTime();
      const endTime = entry.end.getTime();
      if (
        !Number.isFinite(entry.costMicroUsd) ||
        entry.costMicroUsd < 0 ||
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime) ||
        startTime >= endTime
      ) {
        this.entries.delete(userId);
        throw new RangeError("AI usage cycle loader returned an invalid cache entry");
      }

      if (startTime <= currentTime && currentTime < endTime) {
        return entry;
      }

      this.entries.delete(userId);
    }
  }
}

export const aiUsageCycleSpendCache = new AiUsageCycleSpendCache();
export const aiUsageMonthlySpendCache = new AiUsageCycleSpendCache();

export function invalidateAiUsageCycleSpend(userId: string): void {
  aiUsageCycleSpendCache.invalidateNamespace(userId);
  aiUsageMonthlySpendCache.invalidate(userId);
}
