// This type-only marker is erased for the plain-Node worker but still prevents
// client bundling.
import "server-only";

import type { ReconcileResult } from "../rank-check/reconcile-result";
import { reconcileAllSchedules } from "../rank-check/reconciler";

export type { ReconcileResult };

// Activities run in the worker's Node.js process (NOT the workflow sandbox), so
// importing the reconciler (prisma + Temporal client) here is correct. The
// result crosses the Temporal payload boundary, so it stays a plain,
// JSON-serializable object of counters.

/**
 * Side-effecting reconciler sweep for the singleton reconcile workflow: read
 * schedule intent from the DB and converge the per-keyword Temporal Schedules.
 */
export async function reconcileAllSchedulesActivity(): Promise<ReconcileResult> {
  return reconcileAllSchedules();
}
