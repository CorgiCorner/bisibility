import "server-only";
import { lockModelPaymentActor } from "./admission-binding";
import type { ModelPaymentDatabase } from "./admission-storage";
import { ModelAdmissionRefusal, modelPaymentQuoteSchema } from "./payment";
import type { ModelRunIdentity } from "./recovery";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundRuntime } from "./runtime-factory";

/** No request session in a worker: revalidate the original admitted actor in SQL. */
export function modelPlaygroundWorkerRuntime(
  db: ModelPaymentDatabase,
  input: ModelRunIdentity,
): ModelPlaygroundRuntime {
  const runtime = createModelPlaygroundRuntime(db, async () => {
    return db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ snapshot: unknown }[]>`SELECT q.snapshot
          FROM model_playground_runs r JOIN model_playground_payment_quotes q ON q.id=r."previewId"
          WHERE r.id=${input.runId} AND r."projectId"=${input.projectId} AND q.accepted_at IS NOT NULL`;
      if (!row) throw new ModelAdmissionRefusal("access_denied");
      const quote = modelPaymentQuoteSchema.parse(row.snapshot);
      if (quote.context.projectId !== input.projectId)
        throw new ModelAdmissionRefusal("access_denied");
      await lockModelPaymentActor(tx, quote);
      const { actorId, projectId, principal, namespace } = quote.context;
      return { actorId, projectId, principal, namespace };
    });
  });
  runtime.entrySource = "worker";
  return runtime;
}
