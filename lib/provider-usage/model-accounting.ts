import "server-only";
import { lockResourceOwners } from "@/lib/capacity/resource-lock";
import type { Prisma } from "@/lib/generated/prisma/client";
import { modelNativeMeterReceipt } from "@/lib/metering/model-payment";
import { paidContext } from "@/lib/metering/paid-context";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import {
  type ModelAttempt,
  type ModelPaymentDatabase,
  readModelAttempt,
} from "@/lib/model-playground/admission-storage";
import {
  reconcileModelFundingEvidence,
  settleModelFunding,
} from "@/lib/model-playground/funding-extension";
import { type ModelInterruption, modelObservation } from "@/lib/model-playground/interruption";
import { modelPaymentTransaction } from "@/lib/model-playground/payment-transaction";
import { retainModelReceiptColumn } from "@/lib/model-playground/receipt";
import { terminalizeModelPlaygroundExecution } from "@/lib/model-playground/terminal";
import type { ModelColumnResult } from "@/lib/model-playground/types";
import { modelUsageDigest } from "@/lib/model-playground/usage";
import {
  loadModelUsageEvidence,
  ModelUsageEvidenceConflict,
  persistModelUsageEvidence,
} from "@/lib/model-playground/usage-storage";
import type { Authority } from "@usagekit/core";
import { recordModelAccountingOutcome } from "./model-accounting-outcome";
import { ModelDispatchRefusal } from "./model-dispatch";

/** Retain an observation atomically under the caller's resource-owner lock. */
export async function retainModelDispatchEvidence(
  tx: Prisma.TransactionClient,
  attempt: ModelAttempt,
  response: ModelColumnResult | null,
  interruption?: ModelInterruption,
) {
  const { id } = attempt;
  const observation = modelObservation(response, interruption);
  const observationId = modelUsageDigest({ id, response: observation });
  if (!attempt.dispatched) throw new ModelDispatchRefusal("reservation_unavailable");
  const ref = { namespace: attempt.namespace, principal: attempt.principal, operationId: id };
  if (!(await paidContext(tx, ref)).transportFenced)
    throw new Error("Native settlement requires possible-send proof.");
  await tx.$executeRaw`INSERT INTO model_playground_payment_observations(id,attempt_id,response,created_at)
    VALUES(${observationId},${id},${JSON.stringify(observation)}::jsonb,clock_timestamp()) ON CONFLICT(id) DO NOTHING`;
  await tx.$executeRawUnsafe("SAVEPOINT model_evidence");
  let persistenceReason: "evidence_conflict" | "accounting_error" | null = null;
  try {
    await persistModelUsageEvidence(tx, id, response);
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT model_evidence");
    persistenceReason =
      error instanceof ModelUsageEvidenceConflict ? "evidence_conflict" : "accounting_error";
    await recordModelAccountingOutcome(tx, observationId, "pending", persistenceReason);
  }
  await tx.$executeRaw`UPDATE model_playground_payment_attempts SET observed_at=COALESCE(observed_at,clock_timestamp()) WHERE id=${id}`;
  return { observationId, persistenceReason };
}

/** Commit the transport evidence first. Meter refuses links to pending canonicals. */
export async function recordModelDispatchEvidence(
  db: ModelPaymentDatabase,
  id: string,
  response: ModelColumnResult | null,
  _now?: Date,
  interruption?: ModelInterruption,
) {
  const retained = await modelPaymentTransaction(db, async (tx) => {
    const initial = await readModelAttempt(tx, id);
    await lockResourceOwners(tx, [initial.principal]);
    const attempt = await readModelAttempt(tx, id);
    return { attempt, ...(await retainModelDispatchEvidence(tx, attempt, response, interruption)) };
  });
  const { observationId } = retained;
  const ref = {
    namespace: retained.attempt.namespace,
    principal: retained.attempt.principal,
    operationId: id,
  };
  const pending = {
    state: "unknown" as const,
    accountingStatus: "pending" as const,
    automaticPaidRetryAllowed: false as const,
  };
  try {
    if (retained.persistenceReason) {
      if (
        response &&
        retained.persistenceReason === "evidence_conflict" &&
        (await reconcileModelFundingEvidence(db, id, response))
      )
        return {
          state: "settled" as const,
          accountingStatus: "settled" as const,
          accountingReason: null,
          automaticPaidRetryAllowed: false as const,
        };
      return { ...pending, accountingReason: retained.persistenceReason };
    }
    return await modelPaymentTransaction(db, async (tx) => {
      await lockResourceOwners(tx, [ref.principal]);
      const loaded = await loadModelUsageEvidence(tx, id, retained.attempt.binding.projectId);
      if (!loaded?.receipt) throw new Error("Retained native evidence unavailable.");
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const now = clock.now;
      const meter = await createTransactionMeter(tx, { now: () => now });
      let operation = await readPaidOperation(meter, ref);
      let reason: string | null = null;
      if (
        loaded.receipt.additionalExposure !== "unknown" ||
        loaded.receipt.usageStatus !== "complete"
      ) {
        const receipt = modelNativeMeterReceipt(
          loaded,
          new Date(loaded.receipt.evidence?.occurredAt ?? operation.createdAt),
        );
        if (!operation.receipts.some((r) => r.id === receipt.id)) {
          const holder = `model:accounting:${id}`;
          let authority: Authority = { kind: "late_evidence", source: "model:retained-fence" };
          if (operation.lease && Date.parse(operation.lease.expiresAt) > now.getTime()) {
            authority = {
              kind: operation.lease.holder === holder ? "recovery" : "lease",
              leaseId: operation.lease.leaseId,
            };
          } else if (operation.state === "dispatch_intended") {
            // Accounting-only recovery, as in reconcile-native; this never grants HTTP.
            const claim = await meter.claimForRecovery({ ...ref, holder, leaseTtlMs: 60000 });
            if (!("claimed" in claim) || !claim.claimed)
              throw new Error("Native accounting lease unavailable.");
            operation = claim.operation;
            authority = { kind: "recovery", leaseId: claim.lease.leaseId };
          }
          const funded = await settleModelFunding(tx, {
            attempt: retained.attempt,
            loaded,
            operation,
            receipt,
            authority,
            now,
            response,
            interruption,
          });
          const result =
            funded === null
              ? await meter.settle({
                  ...ref,
                  expectedVersion: operation.version,
                  commandId: `model:settle:${receipt.id}`,
                  receipt,
                  authority,
                })
              : null;
          if (funded?.kind === "pending") reason = funded.reason;
          else if (result && result.outcome !== "settled")
            reason = result.outcome === "rejected" ? result.reason : result.outcome;
        }
      }
      const final = await readPaidOperation(meter, ref);
      const state = final.state === "settled" ? ("settled" as const) : ("unknown" as const);
      await recordModelAccountingOutcome(
        tx,
        observationId,
        state === "settled" && !reason ? "settled" : "pending",
        reason,
      );
      return {
        state,
        money: loaded.receipt.monetary,
        accountingStatus:
          state === "settled" && !reason ? ("settled" as const) : ("pending" as const),
        accountingReason: reason,
        automaticPaidRetryAllowed: false as const,
      };
    });
  } catch {
    // Evidence is already durable. Accounting recovery can replay it without HTTP.
    await modelPaymentTransaction(db, (tx) =>
      recordModelAccountingOutcome(tx, observationId, "pending", "accounting_error"),
    ).catch(() => {});
    return { ...pending, accountingReason: "accounting_error" };
  } finally {
    const run = await retainModelReceiptColumn(db, retained.attempt, response);
    if (run)
      await terminalizeModelPlaygroundExecution(db, run).catch((error: unknown) => {
        // The settled receipt stays. The name carries no row text; the sweep retries.
        console.error("[model-playground] receipt terminalize failed", {
          name: error instanceof Error ? error.name : "Error",
        });
      });
  }
}
