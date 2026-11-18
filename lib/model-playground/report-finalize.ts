import "server-only";
import { z } from "zod";
import { modelPlaygroundDatabase } from "./database";
import { type ReportSaveResult, saveModelPlaygroundReport } from "./report";
import { recordReportRepairBackoff, recordReportStorageFailure } from "./report-bookkeeping";
import { loadModelReportEntities } from "./report-context";
import { type ModelPlaygroundDatabase, queryRows, storeTransaction } from "./store-db";

/** Trusted execution/worker completion hook. Never dispatches or changes a paid result. */
export async function finalizeModelPlaygroundReport(
  runId: string,
  db: ModelPlaygroundDatabase = modelPlaygroundDatabase,
  recovery = false,
): Promise<ReportSaveResult> {
  if (!z.uuid().safeParse(runId).success) return { ok: false, reason: "invalid_input" };
  let projectId: string | undefined;
  try {
    const rows = await storeTransaction(db, (tx) =>
      queryRows<{ projectId: string }>(
        tx,
        `SELECT "projectId" FROM model_playground_runs WHERE id=$1`,
        runId,
      ),
    );
    if (!rows[0]) return { ok: false, reason: "not_found" };
    projectId = rows[0].projectId;
    const entities = await loadModelReportEntities(db, projectId);
    return await saveModelPlaygroundReport(db, { projectId, runId }, entities, recovery);
  } catch {
    // A throw before save must still move a repair-eligible row off the sweep head.
    await recordReportRepairBackoff(db, runId);
    if (projectId) await recordReportStorageFailure(db, { projectId, runId });
    return { ok: false, reason: "storage" };
  }
}
