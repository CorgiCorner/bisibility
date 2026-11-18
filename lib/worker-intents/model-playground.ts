import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ModelPaymentDatabase } from "@/lib/model-playground/admission-storage";
import type { ModelRunIdentity } from "@/lib/model-playground/recovery";
import { modelPlaygroundRuntimeBindings } from "@/lib/model-playground/runtime-bindings";
import { recoverStoppedModelPlaygroundRuns } from "@/lib/model-playground/stopped-recovery";
import { recoverModelPlaygroundTerminalHooks } from "@/lib/model-playground/terminal";

export const MODEL_PLAYGROUND_PROBE_LIMIT = 50;
export const MODEL_PLAYGROUND_PENDING_PROBE = Prisma.sql`SELECT
  EXISTS (SELECT 1 FROM model_playground_runs WHERE "terminalAt" IS NULL
    AND ("workerRequestedAt" IS NOT NULL OR "recoveryStoppedAt" IS NOT NULL
      OR ("workerRequestedAt" IS NULL AND (
        EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=model_playground_runs.id
          AND c."projectId"=model_playground_runs."projectId"
          AND c.state='claimed' AND c."dispatchStartedAt" IS NOT NULL)
        OR (EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=model_playground_runs.id
            AND c."projectId"=model_playground_runs."projectId")
          AND NOT EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=model_playground_runs.id
            AND c."projectId"=model_playground_runs."projectId" AND c.state IN ('queued','claimed'))))))
    AND ("workerProbeAt" IS NULL OR "workerProbeAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))) AS pending`;
export async function hasPendingModelPlaygroundIntent(db: ModelPaymentDatabase) {
  return db.$transaction(async (tx) => {
    const [active] = await tx.$queryRaw<{ pending: boolean }[]>(MODEL_PLAYGROUND_PENDING_PROBE);
    if (active?.pending) return true;
    if (!modelPlaygroundRuntimeBindings.onTerminal) return false;
    const [hook] = await tx.$queryRaw<{ pending: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM model_playground_runs WHERE "terminalAt" IS NOT NULL
        AND ("terminalHookStoppedAt" IS NULL OR "terminalRevision">"terminalHookStoppedRevision")
        AND "terminalHookDeliveredRevision"<"terminalRevision"
        AND ("terminalHookNextAt" IS NULL OR "terminalHookNextAt"<=clock_timestamp())) AS pending`;
    return hook?.pending ?? false;
  });
}

/** Rotate bounded batches, including failed starts, so a lost wake cannot starve newer runs. */
export async function pendingModelPlaygroundRuns(
  db: ModelPaymentDatabase,
): Promise<ModelRunIdentity[]> {
  return db.$transaction(
    (tx) => tx.$queryRaw<ModelRunIdentity[]>`WITH pending AS (
    SELECT id FROM model_playground_runs
    WHERE "workerRequestedAt" IS NOT NULL AND "terminalAt" IS NULL AND "recoveryStoppedAt" IS NULL
      AND "workerProbeAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
    ORDER BY "workerProbeAt",id LIMIT ${MODEL_PLAYGROUND_PROBE_LIMIT} FOR UPDATE SKIP LOCKED
  ) UPDATE model_playground_runs r SET "workerProbeAt"=(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '30 seconds'
    FROM pending p WHERE r.id=p.id RETURNING r.id AS "runId",r."projectId"`,
  );
}

export async function dispatchModelPlaygroundIntents(
  db: ModelPaymentDatabase,
  start: (input: ModelRunIdentity) => Promise<void>,
) {
  await recoverStoppedModelPlaygroundRuns(db);
  if (modelPlaygroundRuntimeBindings.onTerminal) {
    const { createModelPlaygroundRuntime } = await import("@/lib/model-playground/runtime-factory");
    await recoverModelPlaygroundTerminalHooks(createModelPlaygroundRuntime(db));
  }
  const runs = await pendingModelPlaygroundRuns(db);
  let started = 0;
  for (const run of runs) {
    try {
      await start(run);
      started++;
    } catch {
      // Persisted intent remains due after the bounded probe delay.
    }
  }
  return { started };
}
