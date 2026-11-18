import "server-only";
import { z } from "zod";
import { readModelAttempt } from "./admission-storage";
import { requireModelColumnTransition, storedColumnPhase } from "./column-state";
import { fitsModelResult } from "./result-budget";
import {
  type ModelPlaygroundDatabase,
  ModelPlaygroundStoreError,
  queryRows,
  requireRow,
  storeTransaction,
} from "./store-db";
import { completeModelRunColumn } from "./store-terminal";
import { columnIdentitySchema, type StoredColumn, storedValue } from "./store-validation";
import { modelColumnResultSchema } from "./types";

const observedIdentitySchema = columnIdentitySchema.extend({
  attemptId: z.string().min(1).max(256),
});

/** The observation edge is consulted while the attempt is still in flight. */
export async function requirePaidObservation(db: ModelPlaygroundDatabase, value: unknown) {
  const input = storedValue(observedIdentitySchema, value);
  await storeTransaction(db, async (tx) => {
    const current = requireRow(
      await queryRows<StoredColumn>(
        tx,
        `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3`,
        input.projectId,
        input.runId,
        input.columnId,
      ),
      "stale_lease",
    );
    const attempt = await readModelAttempt(
      tx as Parameters<typeof readModelAttempt>[0],
      input.attemptId,
    );
    if (attempt.state !== "observed")
      requireModelColumnTransition(attempt.state, storedColumnPhase(current), "observe");
  });
}

/** A paid result belongs to the durable attempt, including after local lease custody is lost. */
export async function completeObservedModelColumn(
  db: ModelPlaygroundDatabase,
  value: unknown,
  evidence: unknown,
) {
  const input = storedValue(observedIdentitySchema, value);
  const result = storedValue(modelColumnResultSchema, evidence);
  if (!fitsModelResult(result)) throw new ModelPlaygroundStoreError("invalid_snapshot");
  return completeModelRunColumn(db, input, async (tx) => {
    const current = requireRow(
      await queryRows<StoredColumn>(
        tx,
        `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 FOR UPDATE`,
        input.projectId,
        input.runId,
        input.columnId,
      ),
      "stale_lease",
    );
    if (current.result) return false;
    const attempt = await readModelAttempt(
      tx as Parameters<typeof readModelAttempt>[0],
      input.attemptId,
    );
    const phase = storedColumnPhase(current);
    if (attempt.state !== "observed") requireModelColumnTransition(attempt.state, phase, "observe");
    requireModelColumnTransition(
      "observed",
      phase,
      ["completed", "partial"].includes(result.state) ? "complete" : "fail",
    );
    const rows = await queryRows(
      tx,
      `UPDATE model_playground_columns c
      SET state=$5,result=$6::jsonb,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
      FROM model_playground_runs r,model_playground_payment_attempts a
      WHERE c."projectId"=$1 AND c."runId"=$2 AND c."columnId"=$3
        AND r.id=c."runId" AND r."projectId"=c."projectId" AND a.id=$4
        AND (a.binding->>'projectId')=c."projectId" AND COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
        AND COALESCE(a.root_column_id,a.column_id)=c."columnId"
        AND a.dispatched_at IS NOT NULL AND a.superseded_at IS NULL
        AND c.state IN ('claimed','unknown') AND c.result IS NULL AND c.config=$7::jsonb
      RETURNING c."columnId"`,
      input.projectId,
      input.runId,
      input.columnId,
      input.attemptId,
      result.state,
      JSON.stringify(result),
      JSON.stringify(result.column),
    );
    if (rows.length) {
      await queryRows(
        tx,
        `UPDATE model_playground_runs
        SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL
        WHERE "projectId"=$1 AND id=$2 AND "terminalAt" IS NOT NULL RETURNING id`,
        input.projectId,
        input.runId,
      );
      return true;
    }
    // Completion replay is harmless, but it may never replace the first answer.
    requireRow(
      await queryRows(
        tx,
        `SELECT "columnId" FROM model_playground_columns
      WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND result IS NOT NULL`,
        input.projectId,
        input.runId,
        input.columnId,
      ),
      "stale_lease",
    );
    return false;
  });
}
