import "server-only";
import type { ReconcileResult } from "../rank-check/reconcile-result";

export type { ReconcileResult };

// Historical workflows may still call this activity after the hard cut.
export async function reconcileAllSchedulesActivity(): Promise<ReconcileResult> {
  return { scanned: 0, created: 0, updated: 0, deleted: 0, failed: 0, listed: 0 };
}
