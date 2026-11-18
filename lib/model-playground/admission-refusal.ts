import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import type { ModelAttempt } from "./admission-storage";
import { releaseModelFunding } from "./funding-extension";

export async function refuseModelAttempt(
  tx: Prisma.TransactionClient,
  attempt: ModelAttempt,
  reason: NonNullable<ModelAttempt["refusalReason"]>,
  now: Date,
) {
  const meter = await createTransactionMeter(tx, { now: () => now });
  const ref = {
    namespace: attempt.namespace,
    principal: attempt.principal,
    operationId: attempt.id,
  };
  const operation = await readPaidOperation(meter, ref);
  if (operation.state !== "released") {
    const result = await meter.releaseUndispatched({
      ...ref,
      commandId: "model:pre-send-refusal",
      expectedVersion: operation.version,
      reason,
    });
    if (result.outcome !== "released")
      throw new Error("Model reservation cancellation requires recovery.");
  }
  await releaseModelFunding(tx, attempt, now);
  await tx.$executeRaw`UPDATE model_playground_payment_attempts SET refusal_reason=${reason} WHERE id=${attempt.id} AND dispatched_at IS NULL`;
}
