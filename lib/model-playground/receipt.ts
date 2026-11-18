import "server-only";
import type { ModelAttempt, ModelPaymentDatabase } from "./admission-storage";
import { persistedModelResult } from "./execution-storage";
import type { ModelRunIdentity } from "./runtime-contract";
import { completeObservedModelColumn } from "./store-observed";
import type { ModelColumnResult } from "./types";

/** Original receipts repair retained content without a workflow or paid transport. */
export async function retainModelReceiptColumn(
  db: ModelPaymentDatabase,
  attempt: ModelAttempt,
  response: ModelColumnResult | null,
): Promise<ModelRunIdentity | undefined> {
  if (!response) return;
  try {
    const [column] = await db.$transaction(
      (tx) => tx.$queryRaw<{ runId: string; columnId: string }[]>`
      SELECT r.id AS "runId",c."columnId" FROM model_playground_runs r
      JOIN model_playground_columns c ON c."runId"=r.id AND c."projectId"=r."projectId"
      WHERE r."previewId"=${attempt.rootQuoteId} AND r."projectId"=${attempt.binding.projectId}
        AND c."columnId"=${attempt.rootColumnId}`,
    );
    if (!column) return;
    const input = { projectId: attempt.binding.projectId, runId: column.runId };
    try {
      await completeObservedModelColumn(
        db,
        { ...input, columnId: column.columnId, attemptId: attempt.id },
        persistedModelResult({
          ...response,
          column: { ...attempt.binding.column, columnId: column.columnId },
        }),
      );
    } catch {
      // The original evidence remains durable for a later recovery sweep.
    }
    return input;
  } catch {
    return undefined;
  }
}
