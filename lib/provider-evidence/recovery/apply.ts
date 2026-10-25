import { lockConnectionAccounting } from "@/lib/metering/store/accounting-lock";
import { key } from "@/lib/metering/store/codec";
import { createSql, lock } from "@/lib/metering/store/host-sql";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import { restoreRetainedRankResult } from "@/lib/rank-check/recovery-restore";
import { captureRecoveryResult } from "./result";
import { recoveryRetryPlan } from "./retry";
import "server-only";
import { lockRecoveryTask } from "./lease";
import { recoveryWriteGateOpen } from "./predicate";
import { importRecoveryProof } from "./proof";
import type { RecoveryLookup } from "./proof-value";
import { providerRecoveryScope } from "./scope";
import { recoverySwitches } from "./switches";

export async function applyRecoveryLookup(
  lease: { intentId: string; owner: string },
  outcome: RecoveryLookup,
  now = new Date(),
  hooks: { afterCapture?: () => Promise<void>; afterRestore?: () => Promise<void> } = {},
) {
  if (!recoverySwitches().lookup) return;
  return notificationTransaction(
    async (tx) => {
      const snapshot = await tx.providerRecoveryIntent.findFirst({
        where: { id: lease.intentId, candidate: providerRecoveryScope() },
        include: { candidate: true },
      });
      if (!snapshot) return;
      const initialIdentity = await tx.providerDispatchIdentity.findUnique({
        where: { operationPk: snapshot.operationPk },
      });
      if (initialIdentity?.payerKind === "hosted")
        await tx.$queryRaw`SELECT id FROM credit_wallets WHERE id=${initialIdentity.payerAccountRef} FOR UPDATE`;

      if (snapshot.candidate.queuedTaskId) {
        await lockRecoveryTask(tx, snapshot.candidate.queuedTaskId);
        await tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE id=${snapshot.candidate.queuedTaskId} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${snapshot.candidate.rankCheckId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM provider_recovery_intents WHERE id=${lease.intentId} FOR UPDATE`;
      const intent = await tx.providerRecoveryIntent.findUniqueOrThrow({
        where: { id: lease.intentId },
      });
      if (
        intent.leaseOwner !== lease.owner ||
        !intent.leaseExpiresAt ||
        intent.leaseExpiresAt <= now ||
        intent.state !== "attempting"
      )
        return;
      const operation = await tx.meteringOperation.findUniqueOrThrow({
        where: { operation_pk: intent.operationPk },
        include: { paidAttemptContext: true, providerDispatchIdentity: true },
      });
      const original = operation.paidAttemptContext;
      if (recoverySwitches().proofWrites && initialIdentity) {
        if (initialIdentity.payerKind === "byok")
          await tx.$queryRaw`SELECT id FROM metering_usage_evidence WHERE id=${operation.operation_id} FOR UPDATE`;
        const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
        await lockConnectionAccounting(
          sql,
          initialIdentity.namespace,
          initialIdentity.connectionId,
        );
        await lock(sql, `metering:operation:${key(operation.namespace, operation.operation_id)}`);
      }
      await tx.$queryRaw`SELECT operation_id FROM metering_paid_attempt_context WHERE namespace=${operation.namespace} AND operation_id=${operation.operation_id} FOR UPDATE`;
      const binding = await tx.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: {
            namespace: operation.namespace,
            operation_id: operation.operation_id,
          },
        },
      });
      const check = await tx.rankCheck.findUnique({
        where: { id: snapshot.candidate.rankCheckId },
      });
      const accountingOnly = intent.accountingOnly || check?.status === "completed";
      const task = snapshot.candidate.queuedTaskId
        ? await tx.queuedRankCheckTask.findUnique({
            where: { id: snapshot.candidate.queuedTaskId },
          })
        : null;
      const gateOpen =
        !!original &&
        binding.dispatch_lease_id === intent.attemptId &&
        !!binding.fenced_at &&
        operation.state !== "released" &&
        recoveryWriteGateOpen(binding) &&
        !(task?.persistenceLeaseExpiresAt && task.persistenceLeaseExpiresAt > now);
      const retainedEvidence = await tx.providerOperationEvidence.findUniqueOrThrow({
        where: { operationPk: intent.operationPk },
      });
      let accounting: "unknown" | "measured" | "conflict" =
        retainedEvidence.accounting ?? "unknown";
      let reason = gateOpen ? "native_proof_unavailable" : "write_gate_closed";
      if (gateOpen && operation.providerDispatchIdentity && recoverySwitches().proofWrites) {
        // A refused canonical import rolls back every proof/financial write, retaining classification.
        await tx.$executeRawUnsafe("SAVEPOINT recovery_proof");
        try {
          const result = await importRecoveryProof(
            tx,
            operation.providerDispatchIdentity,
            operation.operation_id,
            outcome,
            now,
          );
          if (
            result.accounting === "conflict" ||
            accounting === "unknown" ||
            result.accounting === "measured"
          )
            accounting = result.accounting;
          reason = result.reason;
          if (!["imported", "proof_already_imported"].includes(result.reason))
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT recovery_proof");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT recovery_proof");
        } catch {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT recovery_proof");
          reason = "native_proof_import_refused";
        }
      }
      let resultState = "not_attempted";
      if (!accountingOnly && operation.providerDispatchIdentity) {
        resultState = await captureRecoveryResult(
          tx,
          operation.providerDispatchIdentity,
          intent.attemptId,
          outcome,
          now,
          gateOpen && recoverySwitches().restore,
        );
        await hooks.afterCapture?.();
        if (gateOpen && resultState === "complete" && recoverySwitches().restore) {
          await restoreRetainedRankResult(tx, snapshot.candidate.rankCheckId, null, now, lease);
          await hooks.afterRestore?.();
        }
      }
      const currentCheck = await tx.rankCheck.findUnique({
        where: { id: snapshot.candidate.rankCheckId },
      });
      const pendingResult = resultState === "complete" && currentCheck?.status !== "completed";
      if (!recoverySwitches().proofWrites && reason === "native_proof_unavailable")
        reason = "proof_writes_disabled";
      if (
        "reason" in outcome &&
        typeof outcome.reason === "string" &&
        !["imported", "proof_already_imported"].includes(reason)
      )
        reason = outcome.reason;
      const plan = recoveryRetryPlan({
        outcome,
        identity: operation.providerDispatchIdentity,
        attempts: intent.attempts,
        accounting,
        reason,
        resultPending: pendingResult || !gateOpen,
        resultComplete:
          accountingOnly ||
          currentCheck?.status === "completed" ||
          resultState === "partial" ||
          (outcome.kind === "evidence" && outcome.tasks[0]?.classification === "provider_error"),
        now,
      });
      const native =
        outcome.kind === "evidence" && outcome.topStatus.code === 20000 ? outcome.tasks[0] : null;
      await tx.providerOperationEvidence.update({
        where: { operationPk: intent.operationPk },
        data: {
          accounting,
          exhaustionStatus: plan.exhaustionStatus,
          exhaustionReason: plan.exhaustionReason,
          recoveryState: plan.state,
          recoveryReason: plan.reason,
          nextAttemptAt: plan.nextAttemptAt,
          lastAttemptAt: intent.lastAttemptAt,
          ...(native
            ? {
                acceptance: native.id ? "accepted" : "unconfirmed",
                fulfillment:
                  native.classification === "partial"
                    ? "partial"
                    : native.classification === "provider_error"
                      ? "provider_error"
                      : ["success", "terminal_empty_success"].includes(native.classification)
                        ? "complete"
                        : "pending",
                returnedDepth: native.returnedDepth,
              }
            : {}),
        },
      });
      await refreshOperationIncident(tx, intent.operationPk);
      await tx.providerRecoveryIntent.update({
        where: { id: intent.id },
        data: {
          state: plan.state,
          reason: plan.reason,
          nextAttemptAt: plan.nextAttemptAt,
          accountingOnly,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return { accounting, reason, accountingOnly, resultState };
    },
    { timeout: 30_000 },
  );
}
