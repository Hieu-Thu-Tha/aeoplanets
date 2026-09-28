import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { AiFeature } from "../../../../server/services/ai-usage";
import type { AiJob } from "@shared/schema";
import {
  attachAiJobAdmissionToResponse,
  ensureAiJobReservation,
  runScheduledAiJob,
  runWithAiJobAdmission,
} from "../../../../server/services/ai-jobs/admission";
import {
  evaluateAiJobAdmission,
  type AiJobQuotaPolicyContext,
} from "../../../../server/services/ai-jobs/reservation-policy";
import { AiUsageCapExceededError } from "../../../../server/services/ai-usage/cap";
import type { AiUsageCapStatus } from "../../../../server/services/ai-usage/cap-policy";

type AdmissionOptions = NonNullable<Parameters<typeof runWithAiJobAdmission>[2]>;
type Reserve = NonNullable<AdmissionOptions["reserve"]>;
type Finish = NonNullable<AdmissionOptions["finish"]>;

const OWNER_ID = "owner-1";
const RESERVATION_COST_MICRO_USD = 1_000_000;
const OVERSHOOT_COST_MICRO_USD = 3_000_000;
const CYCLE_END = new Date("2026-08-20T00:00:00.000Z");
const MONTH_END = new Date("2026-09-01T00:00:00.000Z");
const POLICY: AiJobQuotaPolicyContext = {
  plan: "accelerate",
  warningThreshold: 0.75,
  policy: { refreshGbp: 100, monthlyGbp: 100 },
  cadence: "daily",
  usdGbpRate: 1,
};

type LedgerOptions = {
  policy?: AiJobQuotaPolicyContext;
  refreshCostMicroUsd?: number;
  monthlyCostMicroUsd?: number;
};

type LedgerEntry = {
  job: AiJob;
  admissionStatus: AiUsageCapStatus;
};

class InMemoryReservationLedger {
  private readonly entries: LedgerEntry[] = [];
  private readonly reservationWaiters = new Set<() => void>();
  private readonly finalizationWaiters = new Set<() => void>();
  private readonly policy: AiJobQuotaPolicyContext;
  private readonly refreshCostMicroUsd: number;
  private readonly monthlyCostMicroUsd: number;
  readonly activeCountsSeen: number[] = [];
  readonly admissionStatuses: AiUsageCapStatus[] = [];
  reservationAttempts = 0;
  finalizationCount = 0;

  constructor(options: LedgerOptions = {}) {
    this.policy = options.policy ?? POLICY;
    this.refreshCostMicroUsd = options.refreshCostMicroUsd ?? 0;
    this.monthlyCostMicroUsd = options.monthlyCostMicroUsd ?? 0;
  }

  get jobs(): readonly AiJob[] {
    return this.entries.map((entry) => entry.job);
  }

  get activeCount(): number {
    return this.entries.filter((entry) => entry.job.status === "reserved").length;
  }

  reserve: Reserve = async (input) => {
    this.reservationAttempts += 1;
    const activeEntries = this.entries.filter((entry) => entry.job.status === "reserved");
    const activeReservedCostMicroUsd = activeEntries.reduce(
      (total, entry) => total + entry.job.reservedCostMicroUsd,
      0,
    );
    this.activeCountsSeen.push(activeEntries.length);

    const admissionStatus = evaluateAiJobAdmission({
      context: this.policy,
      refreshCostMicroUsd: this.refreshCostMicroUsd,
      monthlyCostMicroUsd: this.monthlyCostMicroUsd,
      activeReservedCostMicroUsd,
      activeReservationCount: activeEntries.length,
      requestedCostMicroUsd: input.reservedCostMicroUsd,
      maxOvershootCostMicroUsd: input.maxOvershootCostMicroUsd,
      cycleEndsAt: CYCLE_END,
      monthlyEndsAt: MONTH_END,
    });
    this.admissionStatuses.push(admissionStatus);
    if (admissionStatus.status === "blocked") {
      throw new AiUsageCapExceededError(admissionStatus);
    }

    const now = new Date("2026-08-19T12:00:00.000Z");
    const job: AiJob = {
      id: `job-${this.entries.length + 1}`,
      accountOwnerId: input.accountOwnerId,
      brandId: input.brandId ?? null,
      feature: input.feature,
      entryProvider: input.entryProvider ?? null,
      entryModel: input.entryModel ?? null,
      entryMeters: input.entryMeters ?? [],
      status: "reserved",
      reservedCostMicroUsd: input.reservedCostMicroUsd,
      modelsHash: null,
      modelProfile: null,
      expiresAt: new Date("2026-08-19T13:00:00.000Z"),
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push({ job, admissionStatus });
    this.notify(this.reservationWaiters);
    return { job, aiUsageStatus: admissionStatus };
  };

  finish: Finish = async (jobId, accountOwnerId, status) => {
    const entry = this.entries.find(
      (candidate) => candidate.job.id === jobId
        && candidate.job.accountOwnerId === accountOwnerId,
    );
    if (!entry) throw new Error(`Unknown test reservation ${jobId}`);

    if (entry.job.status === "reserved") {
      const now = new Date("2026-08-19T12:05:00.000Z");
      entry.job = { ...entry.job, status, finishedAt: now, updatedAt: now };
      this.finalizationCount += 1;
      this.notify(this.finalizationWaiters);
    }
    return entry.job;
  };

  waitForReservations(count: number): Promise<void> {
    return this.waitForCount(() => this.entries.length, count, this.reservationWaiters);
  }

  waitForFinalizations(count: number): Promise<void> {
    return this.waitForCount(() => this.finalizationCount, count, this.finalizationWaiters);
  }

  private notify(waiters: Set<() => void>): void {
    waiters.forEach((waiter) => waiter());
  }

  private waitForCount(
    readCount: () => number,
    target: number,
    waiters: Set<() => void>,
  ): Promise<void> {
    if (readCount() >= target) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`Timed out waiting for count ${target}; received ${readCount()}`));
      }, 1_000);
      const check = () => {
        if (readCount() < target) return;
        clearTimeout(timeout);
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function responseMock(): Response & EventEmitter & { headers: Map<string, unknown> } {
  const response = new EventEmitter() as Response & EventEmitter & {
    headers: Map<string, unknown>;
  };
  response.statusCode = 200;
  response.headersSent = false;
  response.headers = new Map();
  response.setHeader = ((name: string, value: string | number | readonly string[]) => {
    response.headers.set(name, value);
    return response;
  }) as typeof response.setHeader;
  return response;
}

async function runManualJob(input: {
  ledger: InMemoryReservationLedger;
  brandId: number;
  jobFeature: AiFeature;
  callFeatures: AiFeature[];
  holdBeforeResponse?: Promise<void>;
  reservationCostMicroUsd?: number;
  overshootCostMicroUsd?: number;
}): Promise<{ statuses: AiUsageCapStatus[]; response: ReturnType<typeof responseMock> }> {
  const response = responseMock();
  const statuses = await runWithAiJobAdmission(OWNER_ID, async () => {
    attachAiJobAdmissionToResponse(response);
    const results = await Promise.all(input.callFeatures.map(async (feature) => {
      const { aiUsageStatus: status } = await ensureAiJobReservation({
        userId: OWNER_ID,
        brandId: input.brandId,
        feature,
      });
      return status;
    }));
    if (input.holdBeforeResponse) await input.holdBeforeResponse;
    response.emit("finish");
    return results;
  }, {
    feature: input.jobFeature,
    reserve: input.ledger.reserve,
    finish: input.ledger.finish,
    getReservationCost: async () => input.reservationCostMicroUsd ?? RESERVATION_COST_MICRO_USD,
    getMaxOvershootCost: async () => input.overshootCostMicroUsd ?? OVERSHOOT_COST_MICRO_USD,
  });
  return { statuses, response };
}

async function runScheduledJob(input: {
  ledger: InMemoryReservationLedger;
  brandId: number;
  jobFeature: AiFeature;
  holdBeforeFinish?: Promise<void>;
}): Promise<AiUsageCapStatus> {
  return runScheduledAiJob({
    userId: OWNER_ID,
    brandId: input.brandId,
    feature: input.jobFeature,
  }, async () => {
    const { aiUsageStatus: status } = await ensureAiJobReservation({
      userId: OWNER_ID,
      brandId: input.brandId,
      feature: input.jobFeature,
    });
    if (input.holdBeforeFinish) await input.holdBeforeFinish;
    return status;
  }, {
    admission: {
      reserve: input.ledger.reserve,
      finish: input.ledger.finish,
      getReservationCost: async () => RESERVATION_COST_MICRO_USD,
      getMaxOvershootCost: async () => OVERSHOOT_COST_MICRO_USD,
    },
  });
}

function assertCompletedJobs(ledger: InMemoryReservationLedger, expected: number): void {
  assert.equal(ledger.jobs.length, expected);
  assert.equal(ledger.finalizationCount, expected);
  assert.equal(new Set(ledger.jobs.map((job) => job.id)).size, expected);
  assert.equal(ledger.jobs.every((job) => job.status === "completed"), true);
  assert.equal(ledger.activeCount, 0);
}

test("one job with one call creates and finalizes one reservation", async () => {
  const ledger = new InMemoryReservationLedger();
  const result = await runManualJob({
    ledger,
    brandId: 10,
    jobFeature: "report",
    callFeatures: ["report"],
  });
  await ledger.waitForFinalizations(1);

  assert.equal(result.statuses.length, 1);
  assert.equal(result.statuses[0].status, "ok");
  assert.equal(result.response.headers.get("X-AI-Usage-Status"), "ok");
  assert.deepEqual(ledger.activeCountsSeen, [0]);
  assertCompletedJobs(ledger, 1);
});

test("one job with multiple calls shares one reservation and finalization", async () => {
  const ledger = new InMemoryReservationLedger();
  const result = await runManualJob({
    ledger,
    brandId: 11,
    jobFeature: "visibility_scan",
    callFeatures: ["visibility_scan", "perception", "coverage", "readability_audit"],
  });
  await ledger.waitForFinalizations(1);

  assert.equal(result.statuses.length, 4);
  assert.equal(result.statuses.every((status) => status === result.statuses[0]), true);
  assert.equal(ledger.jobs[0].feature, "visibility_scan");
  assert.deepEqual(ledger.activeCountsSeen, [0]);
  assertCompletedJobs(ledger, 1);
});

test("multiple jobs with one call each reserve and finalize independently", async () => {
  const ledger = new InMemoryReservationLedger();
  const hold = deferred();
  const jobs = [
    runManualJob({
      ledger,
      brandId: 20,
      jobFeature: "report",
      callFeatures: ["report"],
      holdBeforeResponse: hold.promise,
    }),
    runManualJob({
      ledger,
      brandId: 21,
      jobFeature: "perception",
      callFeatures: ["perception"],
      holdBeforeResponse: hold.promise,
    }),
  ];

  await ledger.waitForReservations(2);
  assert.equal(ledger.activeCount, 2);
  assert.deepEqual(ledger.activeCountsSeen, [0, 1]);
  hold.resolve();
  const results = await Promise.all(jobs);
  await ledger.waitForFinalizations(2);

  assert.equal(results.flatMap((result) => result.statuses).length, 2);
  assertCompletedJobs(ledger, 2);
});

test("multiple jobs with multiple calls each share only their own reservation", async () => {
  const ledger = new InMemoryReservationLedger();
  const hold = deferred();
  const jobs = [
    runManualJob({
      ledger,
      brandId: 30,
      jobFeature: "visibility_scan",
      callFeatures: ["visibility_scan", "perception", "coverage"],
      holdBeforeResponse: hold.promise,
    }),
    runManualJob({
      ledger,
      brandId: 31,
      jobFeature: "report",
      callFeatures: ["report", "report"],
      holdBeforeResponse: hold.promise,
    }),
    runManualJob({
      ledger,
      brandId: 32,
      jobFeature: "readability_audit",
      callFeatures: ["readability_audit", "readability_audit", "readability_audit", "readability_audit"],
      holdBeforeResponse: hold.promise,
    }),
  ];

  await ledger.waitForReservations(3);
  assert.equal(ledger.activeCount, 3);
  assert.deepEqual(ledger.activeCountsSeen, [0, 1, 2]);
  hold.resolve();
  const results = await Promise.all(jobs);
  await ledger.waitForFinalizations(3);

  assert.deepEqual(results.map((result) => result.statuses.length), [3, 2, 4]);
  for (const result of results) {
    assert.equal(result.statuses.every((status) => status === result.statuses[0]), true);
  }
  assert.equal(new Set(results.map((result) => result.statuses[0])).size, 3);
  assertCompletedJobs(ledger, 3);
});

test("one job well under both money limits is admitted and accounted once", async () => {
  const ledger = new InMemoryReservationLedger({
    policy: {
      ...POLICY,
      policy: { refreshGbp: 10, monthlyGbp: 10 },
    },
    refreshCostMicroUsd: 2_000_000,
    monthlyCostMicroUsd: 3_000_000,
  });
  const result = await runManualJob({
    ledger,
    brandId: 40,
    jobFeature: "report",
    callFeatures: ["report"],
    reservationCostMicroUsd: 1_000_000,
    overshootCostMicroUsd: 1_000_000,
  });
  await ledger.waitForFinalizations(1);

  assert.equal(result.statuses[0].status, "ok");
  assert.equal(result.statuses[0].refresh?.spendGbp, 3);
  assert.equal(result.statuses[0].monthly?.spendGbp, 4);
  assert.deepEqual(result.statuses[0].blockedBy, []);
  assert.equal(ledger.reservationAttempts, 1);
  assertCompletedJobs(ledger, 1);
});

test("one job crossing cap remains admitted within its overshoot grace", async () => {
  const ledger = new InMemoryReservationLedger({
    policy: {
      ...POLICY,
      policy: { refreshGbp: 10, monthlyGbp: 10 },
    },
    refreshCostMicroUsd: 9_500_000,
    monthlyCostMicroUsd: 9_500_000,
  });
  const result = await runManualJob({
    ledger,
    brandId: 41,
    jobFeature: "report",
    callFeatures: ["report"],
    reservationCostMicroUsd: 1_000_000,
    overshootCostMicroUsd: 1_000_000,
  });
  await ledger.waitForFinalizations(1);

  assert.equal(result.statuses[0].status, "warning");
  assert.equal(result.statuses[0].refresh?.spendGbp, 10.5);
  assert.equal(result.statuses[0].monthly?.spendGbp, 10.5);
  assert.deepEqual(result.statuses[0].blockedBy, []);
  assert.deepEqual(ledger.activeCountsSeen, [0]);
  assert.equal(ledger.reservationAttempts, 1);
  assertCompletedJobs(ledger, 1);
});

test("one job beyond cap plus overshoot is rejected without durable accounting", async () => {
  const ledger = new InMemoryReservationLedger({
    policy: {
      ...POLICY,
      policy: { refreshGbp: 10, monthlyGbp: 10 },
    },
    refreshCostMicroUsd: 9_500_000,
    monthlyCostMicroUsd: 9_500_000,
  });

  await assert.rejects(
    runManualJob({
      ledger,
      brandId: 42,
      jobFeature: "report",
      callFeatures: ["report"],
      reservationCostMicroUsd: 2_000_000,
      overshootCostMicroUsd: 1_000_000,
    }),
    (error) => {
      assert.equal(error instanceof AiUsageCapExceededError, true);
      assert.deepEqual((error as AiUsageCapExceededError).capStatus.blockedBy, ["refresh", "monthly"]);
      return true;
    },
  );

  assert.equal(ledger.reservationAttempts, 1);
  assert.equal(ledger.admissionStatuses[0].refresh?.spendGbp, 11.5);
  assert.equal(ledger.jobs.length, 0);
  assert.equal(ledger.finalizationCount, 0);
  assert.equal(ledger.activeCount, 0);
});

test("multiple concurrent jobs are admitted when every projection fits the hard cap", async () => {
  const ledger = new InMemoryReservationLedger({
    policy: {
      ...POLICY,
      policy: { refreshGbp: 10, monthlyGbp: 10 },
    },
    refreshCostMicroUsd: 6_000_000,
    monthlyCostMicroUsd: 6_000_000,
  });
  const hold = deferred();
  const jobs = [43, 44, 45].map((brandId) => runManualJob({
    ledger,
    brandId,
    jobFeature: "report",
    callFeatures: ["report"],
    holdBeforeResponse: hold.promise,
    reservationCostMicroUsd: 1_000_000,
    overshootCostMicroUsd: 1_000_000,
  }));

  await ledger.waitForReservations(3);
  assert.deepEqual(ledger.activeCountsSeen, [0, 1, 2]);
  assert.deepEqual(
    ledger.admissionStatuses.map((status) => status.refresh?.spendGbp),
    [7, 8, 9],
  );
  assert.equal(ledger.admissionStatuses.every((status) => status.status !== "blocked"), true);
  hold.resolve();
  await Promise.all(jobs);
  await ledger.waitForFinalizations(3);

  assert.equal(ledger.reservationAttempts, 3);
  assertCompletedJobs(ledger, 3);
});

test("first job may use overshoot grace while a concurrent job is rejected at the hard cap", async () => {
  const ledger = new InMemoryReservationLedger({
    policy: {
      ...POLICY,
      policy: { refreshGbp: 10, monthlyGbp: 10 },
    },
    refreshCostMicroUsd: 9_500_000,
    monthlyCostMicroUsd: 9_500_000,
  });
  const holdFirst = deferred();
  const firstJob = runManualJob({
    ledger,
    brandId: 46,
    jobFeature: "report",
    callFeatures: ["report"],
    holdBeforeResponse: holdFirst.promise,
    reservationCostMicroUsd: 1_000_000,
    overshootCostMicroUsd: 1_000_000,
  });

  await ledger.waitForReservations(1);
  assert.equal(ledger.activeCount, 1);
  assert.equal(ledger.admissionStatuses[0].status, "warning");
  assert.equal(ledger.admissionStatuses[0].refresh?.spendGbp, 10.5);
  assert.deepEqual(ledger.admissionStatuses[0].blockedBy, []);

  await assert.rejects(
    runManualJob({
      ledger,
      brandId: 47,
      jobFeature: "report",
      callFeatures: ["report"],
      reservationCostMicroUsd: 1_000_000,
      overshootCostMicroUsd: 1_000_000,
    }),
    (error) => {
      assert.equal(error instanceof AiUsageCapExceededError, true);
      assert.deepEqual((error as AiUsageCapExceededError).capStatus.blockedBy, ["refresh", "monthly"]);
      return true;
    },
  );

  assert.deepEqual(ledger.activeCountsSeen, [0, 1]);
  assert.equal(ledger.reservationAttempts, 2);
  assert.equal(ledger.jobs.length, 1);
  assert.equal(ledger.finalizationCount, 0);
  assert.equal(ledger.activeCount, 1);

  holdFirst.resolve();
  const admitted = await firstJob;
  await ledger.waitForFinalizations(1);

  assert.equal(admitted.statuses[0].status, "warning");
  assertCompletedJobs(ledger, 1);
});

test("scheduled and manual jobs share concurrent account reservation accounting", async () => {
  const ledger = new InMemoryReservationLedger();
  const hold = deferred();
  const manual = runManualJob({
    ledger,
    brandId: 50,
    jobFeature: "report",
    callFeatures: ["report"],
    holdBeforeResponse: hold.promise,
  });
  const scheduled = runScheduledJob({
    ledger,
    brandId: 51,
    jobFeature: "visibility_scan",
    holdBeforeFinish: hold.promise,
  });

  await ledger.waitForReservations(2);
  assert.equal(ledger.activeCount, 2);
  assert.deepEqual(ledger.activeCountsSeen, [0, 1]);
  hold.resolve();

  const [manualResult, scheduledStatus] = await Promise.all([manual, scheduled]);
  await ledger.waitForFinalizations(2);
  assert.equal(manualResult.statuses[0].status, "ok");
  assert.equal(scheduledStatus.status, "ok");
  assertCompletedJobs(ledger, 2);
});
