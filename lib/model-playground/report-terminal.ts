import "server-only";
import type { ModelPaymentDatabase } from "./admission-storage";
import { saveModelPlaygroundReport } from "./report";
import { loadModelReportEntities } from "./report-context";
import { isStoredReportRunTerminal } from "./report-readiness";
import { type ModelPlaygroundDatabase, storeTransaction } from "./store-db";

/** A not-ready run throws so the terminal claim counts as a failure. */
export class ModelPlaygroundReportNotReady extends Error {
  constructor() {
    super("Report not ready");
    this.name = "ModelPlaygroundReportNotReady";
  }
}

function databaseOf(db: ModelPaymentDatabase) {
  return db as unknown as ModelPlaygroundDatabase;
}

/** Create once, then refresh the saved report from current columns for a newer revision. */
export async function deliverModelPlaygroundTerminalReport(
  db: ModelPaymentDatabase,
  input: { projectId: string; runId: string; revision: number },
): Promise<{ revision: number } | { held: true }> {
  const database = databaseOf(db);
  const entities = await loadModelReportEntities(database, input.projectId);
  const saved = await saveModelPlaygroundReport(
    database,
    { projectId: input.projectId, runId: input.runId },
    entities,
  );
  if (!saved.ok && (saved.reason === "held" || saved.reason === "read_only")) return { held: true };
  if (!saved.ok && (saved.reason === "dismissed" || saved.reason === "unclassified"))
    return { revision: input.revision };
  const ready = await storeTransaction(database, (tx) => isStoredReportRunTerminal(tx, input));
  if (!ready || (!saved.ok && saved.reason === "pending"))
    throw new ModelPlaygroundReportNotReady();
  if (!saved.ok) throw new Error(`Report delivery ${saved.reason}`);
  return { revision: input.revision };
}
