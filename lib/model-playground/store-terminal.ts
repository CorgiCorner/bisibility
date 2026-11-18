import { isStoredReportRunTerminal } from "./report-readiness";
import type { ModelPlaygroundDatabase, ModelPlaygroundTransaction } from "./store-db";
import { queryRows, requireRow, storeTransaction } from "./store-db";

export async function lockModelRun(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  // Empty scope keeps each caller's existing typed refusal at its column lookup.
  return queryRows(
    tx,
    `SELECT id FROM model_playground_runs WHERE "projectId"=$1 AND id=$2 FOR UPDATE`,
    identity.projectId,
    identity.runId,
  );
}

/** Serialize sibling completions; only the last newly retained result signals finalisation. */
export function completeModelRunColumn(
  db: ModelPlaygroundDatabase,
  identity: { projectId: string; runId: string },
  complete: (tx: ModelPlaygroundTransaction) => Promise<boolean>,
) {
  return storeTransaction(db, async (tx) => {
    requireRow(await lockModelRun(tx, identity));
    if (!(await complete(tx))) return false;
    // Terminality has its own savepoint, so a sibling read cannot undo the answer.
    // Report create and refresh belong to terminal hook delivery, not this transaction.
    return terminalityAfterAnswer(tx, identity);
  });
}

async function terminalityAfterAnswer(
  tx: ModelPlaygroundTransaction,
  identity: { projectId: string; runId: string },
) {
  await queryRows(tx, "SAVEPOINT model_report_terminality");
  try {
    const terminal = await isStoredReportRunTerminal(tx, identity);
    await queryRows(tx, "RELEASE SAVEPOINT model_report_terminality");
    return terminal;
  } catch {
    await queryRows(tx, "ROLLBACK TO SAVEPOINT model_report_terminality");
    await queryRows(tx, "RELEASE SAVEPOINT model_report_terminality");
    return false;
  }
}
