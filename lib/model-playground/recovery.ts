import { readModelObservation } from "./interruption";
import "server-only";
import { lockResourceOwners } from "@/lib/capacity/resource-lock";
import {
  recordModelDispatchEvidence,
  retainModelDispatchEvidence,
} from "@/lib/provider-usage/model-accounting";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { readModelAttempt, readModelAttempts } from "./admission-storage";
import { modelColumnState, requireModelColumnTransition, storedColumnPhase } from "./column-state";
import { persistedModelResult, refuseUnstartedModelColumn } from "./execution-storage";
import type { ModelPlaygroundRuntime, ModelRunIdentity } from "./runtime-contract";

export { finalizeModelPlaygroundExecution } from "./terminal";

import { modelPlaygroundSqlNow } from "./sql-clock";
import { createModelPlaygroundStore } from "./store";
import { completeObservedModelColumn } from "./store-observed";
import type { ModelColumnResult } from "./types";

export type { ModelRunIdentity } from "./runtime-contract";
export { modelPlaygroundSqlNow } from "./sql-clock";

/** Recovery consumes retained facts only; it cannot grant paid I/O. */
export async function recoverModelPlayground(
  runtime: ModelPlaygroundRuntime,
  input: ModelRunIdentity,
) {
  const run = await createModelPlaygroundStore(runtime.db).read(input.projectId, input.runId);
  const now = await modelPlaygroundSqlNow(runtime.db);
  const attempts = await runtime.db.$transaction((tx) => readModelAttempts(tx, run.previewId, now));
  const [progress] = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<{ stopped: boolean }[]>`
    SELECT "recoveryStoppedAt" IS NOT NULL AS stopped FROM model_playground_runs
    WHERE id=${input.runId} AND "projectId"=${input.projectId}`,
  );
  for (const column of run.columns) {
    try {
      const attempt = attempts.find((a) => a.rootColumnId === column.columnId);
      if (!attempt) continue;
      const identity = { ...input, columnId: column.columnId };
      if (attempt.dispatched) {
        const pending = await runtime.db.$transaction(
          (tx) => tx.$queryRaw<{ response: unknown }[]>`
            SELECT response FROM model_playground_payment_observations
            WHERE attempt_id=${attempt.id} AND accounting_status='pending'
              AND response->>'kind'='interrupted'
            ORDER BY created_at,id LIMIT 1`,
        );
        if (pending[0]) {
          const retained = readModelObservation(pending[0].response);
          if (retained.interruption)
            await recordModelDispatchEvidence(
              runtime.db,
              attempt.id,
              retained.response as ModelColumnResult,
              undefined,
              retained.interruption,
            );
        }
      }
      if (progress?.stopped && !attempt.dispatched && !column.dispatchStartedAt) {
        await refuseUnstartedModelColumn(runtime.db, identity, attempt, "reservation_unavailable");
        continue;
      }
      const phase = storedColumnPhase(column);
      const action = modelColumnState(attempt.state, phase)?.worker;
      if (column.result && attempt.dispatched && !attempt.observed) {
        // A crash can follow answer retention but precede the journal acknowledgement.
        requireModelColumnTransition(attempt.state, storedColumnPhase(column), "observe");
        await recordModelDispatchEvidence(runtime.db, attempt.id, {
          ...column.result,
          column: attempt.binding.column,
        }).catch(() => undefined);
      }
      if (phase === "expired" && attempt.dispatched && !attempt.observedAt) {
        // A prior worker may have committed expiry before journaling the outcome.
        requireModelColumnTransition(attempt.state, phase, "observe");
        await recordModelDispatchEvidence(runtime.db, attempt.id, null);
      } else if (action === "expire") {
        // The in-flight window ends before the execution lease. A live lease stays claimed.
        const expired = await runtime.db.$transaction(async (tx) => {
          await lockResourceOwners(tx, [attempt.principal]);
          await tx.$queryRaw`SELECT id FROM model_playground_columns WHERE "runId"=${input.runId}
          AND "projectId"=${input.projectId} AND "columnId"=${column.columnId} FOR UPDATE`;
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const current = await readModelAttempt(tx, attempt.id, clock.now);
          if (current.state !== "stale_unknown" && current.state !== "acknowledged_unknown") return;
          requireModelColumnTransition(current.state, storedColumnPhase(column), "expire");
          const changed =
            await tx.$executeRaw`UPDATE model_playground_columns SET state='unknown',"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
          WHERE "runId"=${input.runId} AND "projectId"=${input.projectId} AND "columnId"=${column.columnId}
            AND state='claimed' AND "dispatchStartedAt" IS NOT NULL AND result IS NULL
            AND COALESCE("leaseExpiresAt",'-infinity')<=(clock_timestamp() AT TIME ZONE 'UTC')`;
          if (changed && !current.observed) await retainModelDispatchEvidence(tx, current, null);
          return changed;
        });
        if (expired) await recordModelDispatchEvidence(runtime.db, attempt.id, null);
      } else if (action === "observe") {
        const observations = await runtime.db.$transaction(
          (tx) => tx.$queryRaw<{ response: unknown }[]>`
        SELECT response FROM model_playground_payment_observations WHERE attempt_id=${attempt.id}
        ORDER BY created_at,id`,
        );
        const observed = observations.flatMap((o) => {
          try {
            return [
              persistedModelResult(readModelObservation(o.response).response as ModelColumnResult),
            ];
          } catch {
            return [];
          }
        })[0];
        const result = observed
          ? { ...observed, column: column.config }
          : {
              ...transportEvidence(column.config, +now, null),
              state: "unknown" as const,
              failure: "accounting_unknown" as const,
            };
        await completeObservedModelColumn(
          runtime.db,
          { ...identity, attemptId: attempt.id },
          persistedModelResult(result),
        );
      } else if (action === "refuse") {
        await refuseUnstartedModelColumn(
          runtime.db,
          identity,
          attempt,
          attempt.refusalReason ?? "reservation_unavailable",
        );
      }
    } catch {
      // Poison retained evidence cannot prevent siblings from recovering.
    }
  }
}
