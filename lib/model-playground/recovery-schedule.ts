import "server-only";
import type { ModelPaymentDatabase } from "./admission-storage";
import { REPORT_STORAGE_BACKOFF_MS } from "./report-bookkeeping";
import { recoverModelPlaygroundReports } from "./report-recovery";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { recoverStoppedModelPlaygroundRuns } from "./stopped-recovery";
import type { ModelPlaygroundDatabase } from "./store-db";
import { recoverModelPlaygroundTerminalHooks } from "./terminal";

let started = false;

function sweepStepError(error: unknown) {
  console.error("[model-playground] recovery sweep step failed", {
    name: error instanceof Error ? error.name : "Error",
  });
}

async function repairSavedModelPlaygroundReports(db: ModelPaymentDatabase) {
  const database = db as unknown as ModelPlaygroundDatabase;
  let after: { createdAt: string; id: string } | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await recoverModelPlaygroundReports(database, after ? { after } : {});
    if (!result.ok) throw new Error("Report repair storage");
    if (!result.next) return;
    after = result.next;
  }
}

/** Recovery only. This does not read the worker flag and never starts a run. */
export async function sweepModelPlaygroundRecovery(db?: ModelPaymentDatabase) {
  const database = db ?? (await import("../db/prisma")).prisma;
  // Each step's selection implies a branch here; column and project gates stay in the steps.
  try {
    const [work] = await database.$transaction(
      (tx) => tx.$queryRaw<{ pending: boolean }[]>`SELECT
      EXISTS (SELECT 1 FROM model_playground_runs r
        WHERE r."terminalAt" IS NULL
          AND (r."workerProbeAt" IS NULL OR r."workerProbeAt"<=(clock_timestamp() AT TIME ZONE 'UTC'))
          AND (r."recoveryStoppedAt" IS NOT NULL OR r."workerRequestedAt" IS NULL))
      OR EXISTS (SELECT 1 FROM model_playground_runs r
        WHERE r."terminalAt" IS NOT NULL
          AND (r."terminalHookStoppedAt" IS NULL OR r."terminalRevision">r."terminalHookStoppedRevision")
          AND r."terminalHookDeliveredRevision"<r."terminalRevision"
          AND (r."terminalHookNextAt" IS NULL OR r."terminalHookNextAt"<=clock_timestamp()))
      OR EXISTS (SELECT 1 FROM model_playground_runs r
        WHERE r."reportState" IN ('saved_stale','failed') AND r."reportFailure"='storage'
          AND r."reportAttemptedAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
            - (${REPORT_STORAGE_BACKOFF_MS} * INTERVAL '1 millisecond')) AS pending`,
    );
    if (work?.pending === false) return;
  } catch (error) {
    sweepStepError(error);
  }
  const runtime: ModelPlaygroundRuntime = {
    db: database,
    authorize: async () => {
      throw new Error("recovery_only");
    },
    resolve: async () => {
      throw new Error("recovery_only");
    },
    get onTerminal() {
      return modelPlaygroundRuntimeBindings.onTerminal;
    },
  };
  const steps = [
    () => recoverStoppedModelPlaygroundRuns(database),
    () => recoverModelPlaygroundTerminalHooks(runtime),
    () => repairSavedModelPlaygroundReports(database),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      sweepStepError(error);
    }
  }
}

/** Both process entries call this. Inline fences expire while the worker flag is off. */
export function startModelPlaygroundRecoverySweep() {
  // A local review of a live database must not become another recovery owner.
  if (process.env.NODE_ENV === "development" && process.env.SCHEDULED_MAINTENANCE_ENABLED === "0")
    return { close() {} };
  if (started) return { close() {} };
  started = true;
  const timer = setInterval(() => {
    void sweepModelPlaygroundRecovery().catch((error: unknown) => {
      console.error("[model-playground] recovery sweep failed", {
        name: error instanceof Error ? error.name : "Error",
      });
    });
  }, 30_000);
  timer.unref();
  void sweepModelPlaygroundRecovery().catch(() => undefined);
  return {
    close() {
      clearInterval(timer);
      started = false;
    },
  };
}
