import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import { type ModelPlaygroundTransaction, queryRows } from "./store-db";

const databaseClockSql = "(clock_timestamp() AT TIME ZONE 'UTC')";

// Aliases c/r belong to the scoped column/run queries below and in report-recovery.
const lastDispatchSql = `GREATEST(c."dispatchStartedAt",(
  SELECT MAX(a.dispatched_at AT TIME ZONE 'UTC') FROM model_playground_payment_attempts a
  WHERE COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
    AND COALESCE(a.root_column_id,a.column_id)=c."columnId" AND a.superseded_at IS NULL))`;
export const reportColumnPendingSql = `(c.state NOT IN ('completed','partial','cancelled','failed','unknown')
  OR (c.state='unknown' AND c.result IS NULL AND
    (${lastDispatchSql} IS NULL OR NOT isfinite(${lastDispatchSql}) OR ${lastDispatchSql} + (${MODEL_IN_FLIGHT_MS} * INTERVAL '1 millisecond')
      > (clock_timestamp() AT TIME ZONE 'UTC'))))`;

export async function isStoredReportRunTerminal(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  return (await readStoredReportReadiness(tx, identity)).terminal;
}

export async function readStoredReportReadiness(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  const columns = await queryRows<{
    state: unknown;
    result: unknown;
    dispatchStartedAt: Date | null;
    now: Date;
    pending: boolean;
    readyAtMs: number | null;
    readyInMs: number | null;
  }>(
    tx,
    `WITH report_clock AS MATERIALIZED (SELECT ${databaseClockSql} AS now)
    SELECT c.state,c.result,${lastDispatchSql} AS "dispatchStartedAt",
      report_clock.now AS now,
      ${reportColumnPendingSql.replaceAll(databaseClockSql, "report_clock.now")} AS pending,
      CASE WHEN readiness."delayMs" IS NULL THEN NULL
        ELSE (CEIL(EXTRACT(EPOCH FROM latest.dispatch) * 1000) + ${MODEL_IN_FLIGHT_MS})::double precision
      END AS "readyAtMs",
      readiness."delayMs" AS "readyInMs"
    FROM model_playground_columns c JOIN model_playground_runs r ON r.id=c."runId" AND r."projectId"=c."projectId"
    CROSS JOIN report_clock
    CROSS JOIN LATERAL (SELECT ${lastDispatchSql} AS dispatch) latest
    CROSS JOIN LATERAL (SELECT CASE
      WHEN latest.dispatch IS NULL OR NOT isfinite(latest.dispatch) OR latest.dispatch > report_clock.now THEN NULL
      ELSE LEAST(${MODEL_IN_FLIGHT_MS}::double precision, GREATEST(0::double precision,
        CEIL(EXTRACT(EPOCH FROM (latest.dispatch + (${MODEL_IN_FLIGHT_MS} * INTERVAL '1 millisecond')
          - report_clock.now)) * 1000)::double precision))
    END AS "delayMs") readiness
    WHERE c."projectId"=$1 AND c."runId"=$2`,
    identity.projectId,
    identity.runId,
  );
  const terminal = columns.length > 0 && columns.every((c) => c.pending === false);
  const waiting = columns.filter((c) => c.pending);
  const timed =
    waiting.length > 0 &&
    waiting.every(
      (c) =>
        c.state === "unknown" &&
        c.result === null &&
        c.readyAtMs !== null &&
        Number.isFinite(c.readyAtMs) &&
        c.readyInMs !== null &&
        Number.isFinite(c.readyInMs),
    );
  return {
    terminal,
    readyInMs:
      !terminal && timed ? Math.max(0, ...waiting.map((c) => c.readyInMs as number)) : null,
    readyAt:
      !terminal && timed
        ? new Date(Math.max(...waiting.map((c) => c.readyAtMs as number))).toISOString()
        : null,
  };
}
