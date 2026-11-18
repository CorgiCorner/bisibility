import { z } from "zod";
import {
  type ModelPlaygroundDatabase,
  type ModelPlaygroundTransaction,
  queryRows,
  storeTransaction,
} from "./store-db";

export const REPORT_STORAGE_BACKOFF_MS = 300_000;
export const reportBookkeepingSchema = z
  .object({
    reportState: z.enum(["none", "saved", "saved_stale", "dismissed", "failed", "unclassified"]),
    reportAttemptedAt: z.date().nullable(),
    reportFailure: z.enum(["too_large", "conflict", "storage"]).nullable(),
    reportId: z.string().nullable(),
  })
  .strict()
  .refine((row) => {
    if (row.reportState === "saved")
      return row.reportId !== null && row.reportAttemptedAt !== null && row.reportFailure === null;
    if (row.reportState === "saved_stale")
      return row.reportId !== null && row.reportAttemptedAt !== null && row.reportFailure !== null;
    if (row.reportId !== null) return false;
    if (row.reportState === "failed")
      return row.reportFailure !== null && row.reportAttemptedAt !== null;
    return (
      row.reportFailure === null &&
      (row.reportState === "dismissed" || row.reportAttemptedAt === null)
    );
  });

export const reportRecoveryEligibleSql = `(r."reportState"='none' OR
  (r."reportState" IN ('failed','saved_stale') AND r."reportFailure"='storage'
    AND r."reportAttemptedAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      - (${REPORT_STORAGE_BACKOFF_MS} * INTERVAL '1 millisecond')))`;

/** The caller holds the run lock, or the UPDATE acquires it after an aborted save. */
export async function recordReportFailure(
  tx: ModelPlaygroundTransaction,
  input: { projectId: string; runId: string },
  failure: "too_large" | "conflict" | "storage",
) {
  await queryRows(
    tx,
    `UPDATE model_playground_runs SET "reportState"='failed',"reportFailure"=$3,
      "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
    WHERE "projectId"=$1 AND id=$2 AND "reportId" IS NULL AND "reportState"<>'dismissed'
      AND ($3<>'storage' OR "reportState"='none' OR "reportFailure"='storage')`,
    input.projectId,
    input.runId,
    failure,
  );
}

/** Moves a repair-eligible storage row off the sweep head for one backoff. */
export async function recordReportRepairBackoff(db: ModelPlaygroundDatabase, runId: string) {
  await storeTransaction(db, async (tx) => {
    const [run] = await queryRows<{ projectId: string }>(
      tx,
      `SELECT "projectId" FROM model_playground_runs WHERE id=$1`,
      runId,
    );
    if (!run) return;
    const [project] = await queryRows<{ writeMode: string }>(
      tx,
      `SELECT "writeMode" FROM projects WHERE id=$1 FOR SHARE`,
      run.projectId,
    );
    if (project?.writeMode !== "active") return;
    await queryRows(
      tx,
      `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
       WHERE id=$1 AND "reportFailure"='storage'
         AND (("reportState"='saved_stale' AND "reportId" IS NOT NULL)
           OR ("reportState"='failed' AND "reportId" IS NULL))`,
      runId,
    );
  }).catch(() => undefined);
}

export async function recordReportStorageFailure(
  db: ModelPlaygroundDatabase,
  input: { projectId: string; runId: string },
) {
  await storeTransaction(db, async (tx) => {
    const [project] = await queryRows<{ writeMode: string }>(
      tx,
      `SELECT "writeMode" FROM projects WHERE id=$1 FOR SHARE`,
      input.projectId,
    );
    if (project?.writeMode === "active") await recordReportFailure(tx, input, "storage");
  }).catch(() => {});
}
