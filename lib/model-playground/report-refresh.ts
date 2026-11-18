import {
  buildModelPlaygroundReport,
  ModelPlaygroundReportBudgetError,
  modelPlaygroundReportSchema,
} from "./report-body";
import { readStoredRun } from "./store";
import { type ModelPlaygroundTransaction, queryRows } from "./store-db";

/** Caller holds the run lock and isolates optional work in a savepoint after answer retention. */
async function refreshBody(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  const [runLink] = await queryRows<{ reportId: string | null }>(
    tx,
    `SELECT "reportId" FROM model_playground_runs WHERE "projectId"=$1 AND id=$2`,
    identity.projectId,
    identity.runId,
  );
  if (!runLink?.reportId) return;
  const [report] = await queryRows<{ body: unknown }>(
    tx,
    `SELECT body FROM agent_reports WHERE "projectId"=$1 AND id=$2 FOR UPDATE NOWAIT`,
    identity.projectId,
    runLink.reportId,
  );
  const frozen = modelPlaygroundReportSchema.parse(report?.body);
  if (frozen.runId !== identity.runId) throw new Error("Report binding mismatch");
  const run = await readStoredRun(tx, identity.projectId, identity.runId);
  const body = buildModelPlaygroundReport(
    run.id,
    run.snapshot.input,
    run.columns.map(
      (column) =>
        column.result ?? { column: column.config, state: "unknown" as const, answer: null },
    ),
    frozen.entities,
    frozen.brandsCapturedAt,
  );
  if (frozen.brandsCapturedAt === undefined) delete body.brandsCapturedAt;
  if (frozen.brandsBasis === undefined) delete body.brandsBasis;
  if (JSON.stringify(body) !== JSON.stringify(frozen))
    await queryRows(
      tx,
      `UPDATE agent_reports SET body=$3::jsonb WHERE "projectId"=$1 AND id=$2`,
      identity.projectId,
      runLink.reportId,
      JSON.stringify(body),
    );
  await queryRows(
    tx,
    `UPDATE model_playground_runs SET "reportState"='saved',"reportFailure"=NULL,
    "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "projectId"=$1 AND id=$2`,
    identity.projectId,
    identity.runId,
  );
}

/** Caller holds the run lock; reverse-order project/report locks must never wait. */
export async function refreshSavedModelReport(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  const [link] = await queryRows<{ reportId: string | null }>(
    tx,
    `SELECT "reportId" FROM model_playground_runs WHERE "projectId"=$1 AND id=$2`,
    identity.projectId,
    identity.runId,
  );
  if (!link?.reportId) return;
  await queryRows(tx, "SAVEPOINT model_report_refresh");
  let failure: "storage" | "too_large" | "conflict" = "storage";
  try {
    const [project] = await queryRows<{ writeMode: string }>(
      tx,
      `SELECT "writeMode" FROM projects WHERE id=$1 FOR SHARE NOWAIT`,
      identity.projectId,
    );
    if (project?.writeMode === "active") {
      await refreshBody(tx, identity);
      await queryRows(tx, "RELEASE SAVEPOINT model_report_refresh");
      return;
    }
  } catch (error) {
    if (error instanceof ModelPlaygroundReportBudgetError) failure = "too_large";
    else if (
      error instanceof Error &&
      (error.name === "ZodError" || error.message === "Report binding mismatch")
    )
      failure = "conflict";
  }
  await queryRows(tx, "ROLLBACK TO SAVEPOINT model_report_refresh");
  await queryRows(tx, "RELEASE SAVEPOINT model_report_refresh");
  await queryRows(
    tx,
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"=$3,
    "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "projectId"=$1 AND id=$2
      AND "reportId" IS NOT NULL AND "reportState" IN ('saved','saved_stale')
      AND ($3<>'storage' OR "reportFailure" IS NULL OR "reportFailure"='storage')`,
    identity.projectId,
    identity.runId,
    failure,
  );
}
