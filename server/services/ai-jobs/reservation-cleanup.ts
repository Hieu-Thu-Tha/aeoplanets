import { expireStaleAiJobReservations } from "./reservation";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export function startAiJobReservationCleanup(): void {
  const run = async (): Promise<void> => {
    const cutoff = new Date();
    const startedAt = Date.now();
    try {
      const count = await expireStaleAiJobReservations(cutoff);
      if (count > 0) {
        console.log("[ai-job-reservation] expired stale reservations", {
          count,
          cutoff: cutoff.toISOString(),
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      console.error("[ai-job-reservation] FAILED to expire stale reservations", error);
    } finally {
      setTimeout(run, CLEANUP_INTERVAL_MS).unref();
    }
  };

  console.log("[ai-job-reservation] stale cleanup started", {
    intervalMinutes: CLEANUP_INTERVAL_MS / 60_000,
  });
  void run();
}
