import "server-only";
import { readStoredReportReadiness } from "./report-readiness";
import { readStoredRun } from "./store";
import {
  type ModelPlaygroundDatabase,
  ModelPlaygroundStoreError,
  queryRows,
  storeTransaction,
} from "./store-db";
import { storeIdentitySchema } from "./store-validation";

export type RetainedRun = Awaited<ReturnType<typeof readStoredRun>>;
export type RetainedRunRead =
  | {
      ok: true;
      run: RetainedRun;
      terminal: boolean;
      readyAt: string | null;
      readyInMs: number | null;
    }
  | { ok: false; reason: "invalid_input" | "not_found" | "invalid_snapshot" | "storage" };

/** The caller authorizes project access before this storage-only read. */
export async function readRetainedModelRun(
  db: ModelPlaygroundDatabase,
  input: unknown,
): Promise<RetainedRunRead> {
  const parsed = storeIdentitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  try {
    return await storeTransaction(db, async (tx) => {
      // Keep returned answers and readiness at the same point between paid completions.
      await queryRows(
        tx,
        `SELECT id FROM model_playground_runs WHERE "projectId"=$1 AND id=$2 FOR SHARE`,
        parsed.data.projectId,
        parsed.data.runId,
      );
      const run = await readStoredRun(tx, parsed.data.projectId, parsed.data.runId);
      const readiness = await readStoredReportReadiness(tx, parsed.data);
      return { ok: true as const, run, ...readiness };
    });
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof ModelPlaygroundStoreError && error.code === "not_found"
          ? "not_found"
          : error instanceof ModelPlaygroundStoreError && error.code === "invalid_snapshot"
            ? "invalid_snapshot"
            : "storage",
    };
  }
}
