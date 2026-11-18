import "server-only";
import type { ModelPaymentDatabase } from "./admission-storage";
import { recoverModelPlayground } from "./recovery";
import type { ModelRunIdentity } from "./runtime-contract";
import { createModelPlaygroundRuntime } from "./runtime-factory";
import { finalizeModelPlaygroundExecution } from "./terminal";

/** A stopped workflow has no execution authority; retained evidence and expiry still advance. */
export async function recoverStoppedModelPlaygroundRuns(db: ModelPaymentDatabase) {
  const runs = await db.$transaction(
    (tx) => tx.$queryRaw<ModelRunIdentity[]>`WITH due AS (
    SELECT r.id FROM model_playground_runs r WHERE r."terminalAt" IS NULL
      AND (r."workerProbeAt" IS NULL OR r."workerProbeAt"<=(clock_timestamp() AT TIME ZONE 'UTC'))
      AND (r."recoveryStoppedAt" IS NOT NULL OR (r."workerRequestedAt" IS NULL AND (
        EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id AND c."projectId"=r."projectId"
          AND c.state='claimed' AND c."dispatchStartedAt" IS NOT NULL)
        OR (EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id AND c."projectId"=r."projectId")
          AND NOT EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id
            AND c."projectId"=r."projectId" AND c.state IN ('queued','claimed'))))))
    ORDER BY r."workerProbeAt" NULLS FIRST,r.id LIMIT 50 FOR UPDATE OF r SKIP LOCKED
  ) UPDATE model_playground_runs r SET "workerProbeAt"=(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '30 seconds'
    FROM due WHERE r.id=due.id RETURNING r."projectId",r.id AS "runId"`,
  );
  const runtime = createModelPlaygroundRuntime(db);
  for (const input of runs) {
    try {
      await recoverModelPlayground(runtime, input);
      await finalizeModelPlaygroundExecution(runtime, input);
    } catch {
      // A failed transaction retains stopped work for the next bounded sweep.
    }
  }
}
