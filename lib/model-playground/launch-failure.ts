import type { ModelAttempt, ModelPaymentDatabase } from "./admission-storage";
import { readModelAttempt } from "./admission-storage";
import { refuseUnstartedModelAttempt } from "./execution-storage";
import { modelPaymentTransaction } from "./payment-transaction";
import { transactionDatabase } from "./runtime-transaction";

/** Serialize with run creation: a sibling's infrastructure failure never cancels a live run. */
export async function refuseUncreatedModelRun(
  db: ModelPaymentDatabase,
  projectId: string,
  requestId: string,
  attempts: ModelAttempt[],
  now: Date,
): Promise<boolean> {
  return modelPaymentTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["model-playground", projectId, requestId])},0))`;
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM model_playground_runs WHERE "projectId"=${projectId} AND "requestId"=${requestId}`;
    if (rows.length) return false;
    for (const attempt of attempts) {
      await refuseUnstartedModelAttempt(
        transactionDatabase(tx),
        attempt,
        "reservation_unavailable",
        now,
      );
    }
    const current = await Promise.all(attempts.map((a) => readModelAttempt(tx, a.id, now)));
    return current.length > 0 && current.every((a) => !a.dispatched && a.refusalReason !== null);
  });
}
