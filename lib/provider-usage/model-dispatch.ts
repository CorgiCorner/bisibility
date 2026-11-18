import "server-only";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
} from "@/lib/metering/paid-dispatch";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import type { ModelAdmissionPorts } from "@/lib/model-playground/admission";
import {
  assertModelPaymentConnections,
  lockModelPaymentActor,
} from "@/lib/model-playground/admission-binding";
import { refuseModelAttempt } from "@/lib/model-playground/admission-refusal";
import {
  type ModelAttempt,
  type ModelPaymentDatabase,
  readModelAttempt,
  readModelInFlightCount,
  readModelPaymentQuote,
} from "@/lib/model-playground/admission-storage";
import { dispatchModelFunding } from "@/lib/model-playground/funding-extension";
import {
  ModelAdmissionRefusal,
  modelPaymentContextSchema,
  validateModelPaymentQuote,
} from "@/lib/model-playground/payment";
import { modelPaymentTransaction } from "@/lib/model-playground/payment-transaction";
import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";

export class ModelDispatchRefusal extends Error {
  constructor(
    readonly reason:
      | "already_dispatched"
      | "account_concurrency"
      | "storage_busy"
      | NonNullable<ModelAttempt["refusalReason"]>,
  ) {
    super(reason);
  }
  get retryable() {
    return this.reason === "account_concurrency" || this.reason === "storage_busy";
  }
}

export async function beforeModelDispatch(
  db: ModelPaymentDatabase,
  ports: ModelAdmissionPorts,
  id: string,
) {
  const refusal = await modelPaymentTransaction(db, async (tx) => {
    const initial = await readModelAttempt(tx, id);
    const retained = await readModelPaymentQuote(tx, initial.quoteId);
    if (!retained?.accepted) throw new ModelDispatchRefusal("reservation_unavailable");
    const quote = {
      ...retained.quote,
      context: {
        ...retained.quote.context,
        columns: retained.quote.context.columns.filter((c) => c.binding.attemptId === id),
      },
    };
    const [clockRow] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const now = clockRow.now;
    try {
      await lockModelPaymentActor(tx, quote);
      // A possible-send fence always wins over changed credentials or expired leases.
      const current = await readModelAttempt(tx, id);
      if (current.dispatched) throw new ModelDispatchRefusal("already_dispatched");
      if (current.refusalReason) return current.refusalReason;
      await assertModelPaymentConnections(tx, quote);
      const live = await ports.readCurrent(tx, retained.quote);
      const changed = validateModelPaymentQuote(quote, live, new Date(quote.createdAt));
      if (changed) throw new ModelAdmissionRefusal(changed);
      if (!modelPaymentContextSchema.safeParse(live).success)
        throw new ModelAdmissionRefusal("quote_changed");
    } catch (error) {
      if (!(error instanceof ModelAdmissionRefusal)) throw error;
      const current = await readModelAttempt(tx, id);
      if (current.dispatched) throw new ModelDispatchRefusal("already_dispatched");
      if (!current.refusalReason) await refuseModelAttempt(tx, current, error.reason, now);
      return current.refusalReason ?? error.reason;
    }
    const clock = { now: () => now };
    const meter = await createTransactionMeter(tx, clock);
    const ref = { namespace: initial.namespace, principal: initial.principal, operationId: id };
    const operation = await readPaidOperation(meter, ref);
    if (
      operation.state === "released" ||
      (operation.state === "reserved" &&
        Date.parse(operation.reservationExpiresAt) <= now.getTime())
    ) {
      await refuseModelAttempt(tx, initial, "reservation_unavailable", now);
      return "reservation_unavailable" as const;
    }
    if (operation.state !== "reserved") throw new ModelDispatchRefusal("reservation_unavailable");
    // The owner lock serializes slots. The transport bound, never lease expiry, frees a slot.
    if (
      (await readModelInFlightCount(tx, initial.principal, now)) >= MODEL_PLAYGROUND_LIMITS.inflight
    ) {
      return "account_concurrency" as const;
    }
    const options = { clock, verifyBinding: async () => {} };
    const grant = await markPaidAttemptDispatch(
      tx,
      { operation, replayed: false },
      `model:${id}`,
      options,
    );
    await fencePaidAttemptsInTransaction(tx, [grant], options);
    await dispatchModelFunding(tx, initial, now);
    await tx.$executeRaw`UPDATE model_playground_payment_attempts SET dispatched_at=clock_timestamp() WHERE id=${id} AND dispatched_at IS NULL`;
    return null;
  });
  // Throw only after the cancellation transaction has committed.
  if (refusal) {
    if (refusal === "reservation_unavailable" || refusal === "account_concurrency")
      throw new ModelDispatchRefusal(refusal);
    throw new ModelAdmissionRefusal(refusal);
  }
}
