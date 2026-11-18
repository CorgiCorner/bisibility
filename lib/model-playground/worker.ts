import "server-only";
import { readModelAttempts } from "./admission-storage";
import { modelColumnState, storedColumnPhase } from "./column-state";
import { executeModelPlayground } from "./execute";
import {
  finalizeModelPlaygroundExecution,
  type ModelRunIdentity,
  modelPlaygroundSqlNow,
  recoverModelPlayground,
} from "./recovery";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundStore } from "./store";
import { ModelPlaygroundStoreError } from "./store-db";

/** Activity retries reload custody; an old activity payload never authorizes another dispatch. */
export async function executeModelPlaygroundRun(
  runtime: ModelPlaygroundRuntime,
  input: ModelRunIdentity,
) {
  input = { projectId: input.projectId, runId: input.runId };
  const [progress] = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<
      { recoveryStoppedAt: Date | null; terminalAt: Date | null; workerRecoveryAttempts: number }[]
    >`
    UPDATE model_playground_runs SET "workerRecoveryAttempts"=LEAST("workerRecoveryAttempts"+1,101),
      "recoveryStoppedAt"=CASE WHEN "workerRecoveryAttempts">=100 THEN COALESCE("recoveryStoppedAt",clock_timestamp()) ELSE "recoveryStoppedAt" END
    WHERE id=${input.runId} AND "projectId"=${input.projectId} RETURNING "recoveryStoppedAt","terminalAt","workerRecoveryAttempts"`,
  );
  if (progress?.recoveryStoppedAt && !progress.terminalAt) {
    await recoverModelPlayground(runtime, input);
    return { terminal: await finalizeModelPlaygroundExecution(runtime, input), stopped: true };
  }
  const run = await createModelPlaygroundStore(runtime.db)
    .read(input.projectId, input.runId)
    .catch((error: unknown) => {
      if (error instanceof ModelPlaygroundStoreError && error.code === "not_found") return null;
      throw error;
    });
  if (!run) return { terminal: true };
  const now = await modelPlaygroundSqlNow(runtime.db);
  const attempts = await runtime.db.$transaction((tx) => readModelAttempts(tx, run.previewId, now));
  const runnable = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<{ columnId: string }[]>`
    SELECT "columnId" FROM model_playground_columns
    WHERE "projectId"=${input.projectId} AND "runId"=${input.runId} AND "dispatchStartedAt" IS NULL
      AND (state='queued' OR (state='claimed' AND "leaseExpiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')))`,
  );
  await executeModelPlayground(runtime, {
    ...input,
    delivery: "worker",
    attempts: attempts.filter((a) => {
      const column = run.columns.find((c) => c.columnId === a.rootColumnId);
      return (
        column &&
        modelColumnState(a.state, storedColumnPhase(column))?.worker === "execute" &&
        runnable.some((c) => c.columnId === column.columnId)
      );
    }),
  });
  const [current] = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<{ terminalAt: Date | null }[]>`
    SELECT "terminalAt" FROM model_playground_runs WHERE id=${input.runId} AND "projectId"=${input.projectId}`,
  );
  if (current?.terminalAt) return { terminal: true };
  return {
    terminal: false,
    retryAfterMs: Math.min(1_000 * 2 ** Math.min(progress?.workerRecoveryAttempts ?? 1, 5), 30_000),
  };
}
