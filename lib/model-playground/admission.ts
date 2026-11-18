import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { reservePaidAttempts } from "@/lib/metering/paid-admission";
import { PaidAttemptAdmissionError } from "@/lib/metering/paid-attempt-types";
import { assertModelPaymentConnections, lockModelPaymentActor } from "./admission-binding";
import {
  consumeModelConfirmation,
  modelRoot,
  readModelConfirmation,
} from "./admission-confirmation";
import { readModelUnconfirmedAttempts } from "./admission-history";
import {
  type ModelAdmissionPlan,
  modelAdmittedReplay,
  previousModelAdmission,
} from "./admission-replay";
import { MODEL_ADMISSION_WINDOW_MS } from "./admission-state";
import {
  type ModelAttempt,
  type ModelPaymentDatabase,
  readModelPaymentQuote,
} from "./admission-storage";
import { reserveModelFunding } from "./funding-extension";
import {
  type ModelAdmissionReason,
  ModelAdmissionRefusal,
  type ModelPaymentContext,
  type ModelPaymentQuote,
  modelPaymentContextSchema,
  validateModelPaymentQuote,
} from "./payment";
import { modelPaymentReservations } from "./payment-reservation";
import { modelPaymentTransaction } from "./payment-transaction";
import { bindModelUsageEvidence } from "./usage-storage";

export { saveModelPaymentQuote } from "./admission-storage";

export type ModelAdmissionResult =
  | {
      kind: "admitted";
      quoteId: string;
      attempts: ModelAttempt[];
      columnAttempts: Record<string, string>;
      replayed: boolean;
      earlierAttemptUnconfirmed: boolean;
      replacementRefusal?: { reason: ModelAdmissionReason; quoteInvalidated: boolean };
    }
  | { kind: "not_dispatched"; reason: ModelAdmissionReason; quoteInvalidated: boolean }
  | { kind: "uncertain"; quoteInvalidated: false }
  | {
      kind: "confirmation_required";
      nonce: string;
      contentHash: string;
      attemptIds: string[];
      earlierAttemptUnconfirmed: true;
    };
export type ModelAdmissionPorts = {
  /** Trusted server resolver: read catalog, rates, settings and advisory budget inside this transaction. */
  readCurrent(tx: Prisma.TransactionClient, quote: ModelPaymentQuote): Promise<ModelPaymentContext>;
  now?: () => Date;
};
export type ModelRunConsent = {
  quoteId: string;
  actorId: string;
  projectId: string;
  configHash: string;
  consent: "non_guaranteed_estimate_v1";
  /** Bound to the exact unresolved attempts shown in the explicit confirmation. */
  confirmUnknown?: { nonce: string; contentHash: string; attemptIds: string[] };
};

/** Only this committed atomic result authorizes the launch port to say not_dispatched. */
export async function admitModelRun(
  db: ModelPaymentDatabase,
  input: ModelRunConsent,
  ports: ModelAdmissionPorts,
): Promise<ModelAdmissionResult> {
  return modelPaymentTransaction(db, async (tx) => {
    const retained = await readModelPaymentQuote(tx, input.quoteId);
    const refused = async (reason: ModelAdmissionReason) => {
      // Accepted -> replay or uncertainty; an earlier dispatch cannot be denied.
      if (retained?.accepted)
        return { kind: "uncertain" as const, quoteInvalidated: false as const };
      // Only a retained, unaccepted quote can acquire or retain a committed rejection.
      const quoteInvalidated = Boolean(retained && !retained.accepted);
      if (quoteInvalidated)
        await tx.$executeRaw`UPDATE model_playground_payment_quotes SET rejection=COALESCE(rejection,${reason}) WHERE id=${input.quoteId}`;
      return { kind: "not_dispatched" as const, reason, quoteInvalidated };
    };
    if (!retained) return refused("quote_missing");
    const { quote } = retained;
    if (quote.context.actorId !== input.actorId || quote.context.projectId !== input.projectId)
      return retained.accepted
        ? { kind: "uncertain", quoteInvalidated: false }
        : { kind: "not_dispatched", reason: "access_denied", quoteInvalidated: false };
    const now = ports.now?.() ?? new Date();
    if (retained.accepted) {
      try {
        await lockModelPaymentActor(tx, quote);
        if (input.configHash !== quote.configHash) return refused("configuration_changed");
        if (input.consent !== "non_guaranteed_estimate_v1") return refused("consent_required");
        const confirmation = await readModelConfirmation(tx, quote, input);
        if (
          confirmation?.consumed_root_quote_id &&
          confirmation.consumed_root_quote_id !== (retained.replayOf ?? quote.quoteId) &&
          !(await modelRoot(tx, confirmation.consumed_root_quote_id, now)).live
        )
          return refused("confirmation_spent");
        return (
          (await modelAdmittedReplay(
            tx,
            quote,
            retained.replayOf ?? quote.quoteId,
            (
              await readModelUnconfirmedAttempts(tx, quote, now)
            ).earlierAttemptUnconfirmed,
            now,
          )) ?? { kind: "uncertain" as const, quoteInvalidated: false as const }
        );
      } catch (error) {
        if (error instanceof ModelAdmissionRefusal) return refused(error.reason);
        throw error;
      }
    }
    if (retained.rejection) return refused("quote_invalidated");
    let plan: ModelAdmissionPlan | undefined;
    await tx.$executeRawUnsafe("SAVEPOINT model_admission");
    try {
      await lockModelPaymentActor(tx, quote);
      if (input.consent !== "non_guaranteed_estimate_v1")
        throw new ModelAdmissionRefusal("consent_required");
      if (input.configHash !== quote.configHash)
        throw new ModelAdmissionRefusal("configuration_changed");
      const previous = await previousModelAdmission(tx, quote, input, now);
      if (!previous) throw new Error("Missing model admission plan.");
      if (previous.kind !== "new_attempts")
        return previous.kind === "not_dispatched" ? refused(previous.reason) : previous;
      plan = previous;
      const selected = { ...quote, context: { ...quote.context, columns: plan.columns } };
      await assertModelPaymentConnections(tx, selected);
      const current = await ports.readCurrent(tx, quote);
      const reason = validateModelPaymentQuote(selected, current, now);
      if (reason) throw new ModelAdmissionRefusal(reason);
      if (!modelPaymentContextSchema.safeParse(current).success)
        throw new ModelAdmissionRefusal("quote_changed");
      const reservations = await reserveModelFunding(
        tx,
        selected,
        modelPaymentReservations(selected),
        now,
      );
      const admitted = await reservePaidAttempts(tx, reservations, {
        clock: { now: () => now },
        verifyBinding: async () => {},
      });
      for (const reservation of admitted) {
        const budget = reservation.operation.budgetEpochs.find(
          (b) => b.budgetId === quote.context.budget.id,
        );
        if (!budget) throw new ModelAdmissionRefusal("budget_unavailable");
        if (budget.budgetVersion !== quote.context.budget.version)
          throw new ModelAdmissionRefusal("budget_changed");
      }
      for (const { binding: b, advisory } of plan.columns) {
        await tx.meteringUsageEvidence.create({
          data: {
            id: b.attemptId,
            namespace: quote.context.namespace,
            principal: b.principal,
            projectId: b.projectId,
            connectionId: b.connectionId,
            provider: b.column.providerId,
            feature: "model_playground",
            source: b.source,
            correlationId: quote.quoteId,
            unit: "units",
            createdAt: now,
            estimate: {
              budgetCents: advisory.cents,
              credentialVersion: b.credentialVersion,
              publicConnectionId: b.column.connectionId,
            },
          },
        });
        await bindModelUsageEvidence(tx, b.attemptId, b);
        const replacement = plan.replacements[b.column.columnId];
        if (replacement)
          await tx.$executeRaw`UPDATE model_playground_payment_attempts SET superseded_at=${now} WHERE id=${replacement.id} AND refusal_reason IS NOT NULL`;
        await tx.$executeRaw`INSERT INTO model_playground_payment_attempts(id,quote_id,column_id,namespace,principal,binding,root_quote_id,root_column_id)
          VALUES(${b.attemptId},${quote.quoteId},${b.column.columnId},${quote.context.namespace},${b.principal},${JSON.stringify(b)}::jsonb,${plan.rootId},${replacement?.rootColumnId ?? b.column.columnId})`;
      }
      if (plan.nonce) await consumeModelConfirmation(tx, plan.nonce, quote.quoteId, now);
      await tx.$executeRaw`UPDATE model_playground_payment_quotes SET accepted_at=${now},confirmation_key=${plan.nonce},replay_of=${plan.rootId === quote.quoteId ? null : plan.rootId} WHERE id=${quote.quoteId}`;
      if (plan.rootId === quote.quoteId)
        await tx.$executeRaw`UPDATE model_playground_payment_content SET root_quote_id=${quote.quoteId},expires_at=${new Date(now.getTime() + MODEL_ADMISSION_WINDOW_MS)}
          WHERE project_id=${input.projectId} AND actor_id=${input.actorId} AND content_hash=${quote.contentHash}`;
      const result = await modelAdmittedReplay(
        tx,
        quote,
        plan.rootId,
        (await readModelUnconfirmedAttempts(tx, quote, now)).earlierAttemptUnconfirmed,
        now,
      );
      if (!result) throw new Error("Admitted model root lost its column mapping.");
      return { ...result, replayed: false };
    } catch (error) {
      let reason: ModelAdmissionReason;
      if (error instanceof ModelAdmissionRefusal) reason = error.reason;
      else if (error instanceof PaidAttemptAdmissionError)
        reason = error.outcome.outcome === "exceeded" ? "budget_exhausted" : "budget_unavailable";
      else throw error;
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT model_admission");
      const refusal = await refused(reason);
      if (plan && plan.rootId !== quote.quoteId) {
        // Return paid/live columns even when every replacement was atomically refused.
        const replay = await modelAdmittedReplay(
          tx,
          quote,
          plan.rootId,
          (await readModelUnconfirmedAttempts(tx, quote, now)).earlierAttemptUnconfirmed,
          now,
        );
        if (replay)
          return {
            ...replay,
            replacementRefusal: { reason, quoteInvalidated: refusal.quoteInvalidated },
          };
      }
      return refusal;
    }
  });
}
