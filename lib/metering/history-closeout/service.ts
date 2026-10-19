import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockConnectionAccounting } from "@/lib/metering/store/accounting-lock";
import { currentBudgets, lockScopes, matchingScopes } from "@/lib/metering/store/budgets";
import { canonical, encode, key } from "@/lib/metering/store/codec";
import { createSql, lock } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { reconcileSpendingGates } from "@/lib/provider-usage/reconcile-gates";
import { closeoutManifest, closeoutPolicy, historyMigration } from "./manifest";
import { planCloseout } from "./plan";
import { identityIncompleteHistoryCount } from "./read";
import { closeoutSnapshot } from "./snapshot";

async function controls(tx: Prisma.TransactionClient, readOnly: boolean) {
  const [row] = await tx.$queryRaw<{ isolation: string; readOnly: string }[]>`
    SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly"`;
  if (
    row?.isolation !== (readOnly ? "repeatable read" : "read committed") ||
    row.readOnly !== (readOnly ? "on" : "off")
  )
    throw new Error(
      "Closeout requires an explicit read-only snapshot or ReadCommitted apply transaction.",
    );
}
/** Caller owns a RepeatableRead READ ONLY transaction. No adoption, provider or wallet writes. */
export async function previewCloseout(
  tx: Prisma.TransactionClient,
  value: unknown,
  now = new Date(),
) {
  await controls(tx, true);
  const manifest = closeoutManifest.parse(value);
  const snapshot = await closeoutSnapshot(tx, manifest);
  const plan = planCloseout(snapshot, manifest, now);
  return {
    policy: closeoutPolicy,
    planHash: plan.planHash,
    targetHash: plan.targetHash,
    replayed: plan.replayed,
    schemaReady: snapshot.schemaAvailable,
    applyReady: plan.approvalReady && snapshot.schemaAvailable,
    actorBlock: plan.approvalReady ? null : "active_verified_instance_administrator_required",
    identityIncompleteHistory: await identityIncompleteHistoryCount(
      tx,
      manifest.namespace,
      snapshot.project.id,
    ),
    count: manifest.operations.length,
    disposition: "financially_closed_identity_incomplete",
    providerIdentity: "unknown",
    nativeUnits: null,
    totalCostUsdUnits: snapshot.entries
      .reduce((total, e) => total + (e.operation.receipts[0]?.cost.money?.units ?? 0n), 0n)
      .toString(),
    operations: snapshot.entries.map((e) => ({
      operationId: e.operation.operationId,
      version: e.operation.version,
      occurredAt: e.operation.receipts[0]?.occurredAt,
      costUsdUnits: e.operation.receipts[0]?.cost.money?.units.toString(),
    })),
  };
}

/** Only a digest-bound explicit operator call. No caller-supplied amounts or native identities. */
export async function applyCloseout(
  tx: Prisma.TransactionClient,
  value: unknown,
  approvedHash: string,
  now = new Date(),
) {
  await controls(tx, false);
  const manifest = closeoutManifest.parse(value);
  const [operator] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE "publicId"=${manifest.operator} AND "isInstanceAdmin" AND "emailVerified" AND "deactivatedAt" IS NULL FOR SHARE`;
  if (!operator)
    throw new Error("An active verified instance administrator is required for apply.");
  // Immutable source additions are blocked for this bounded transaction; read preview is lock-free.
  await tx.$executeRaw`LOCK TABLE metering_legacy_proof_source,metering_legacy_reference_source,metering_legacy_setting_source,metering_history_reference IN SHARE MODE`;
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await lockConnectionAccounting(sql, manifest.namespace, manifest.connection);
  for (const id of manifest.operations.map((i) => key(manifest.namespace, i.operationId)).sort())
    await lock(sql, `metering:operation:${id}`);
  const first = await closeoutSnapshot(tx, manifest);
  if (!first.schemaAvailable) throw new Error("Deploy the closeout schema before apply.");
  const scopes = first.entries.flatMap((e) => matchingScopes(e.operation));
  await lockScopes(sql, scopes);
  const budgets = await currentBudgets(sql, manifest.namespace, scopes);
  const keys = new Set([
    ...budgets.map((b) => canonical([manifest.namespace, b.id])),
    ...first.entries.flatMap((e) =>
      e.operation.budgetEpochs.map((b) => canonical([manifest.namespace, b.budgetId])),
    ),
  ]);
  for (const id of [...keys].sort()) await lock(sql, `metering:budget:${id}`);
  const snapshot = await closeoutSnapshot(tx, manifest);
  const plan = planCloseout(snapshot, manifest, now);
  if (!plan.approvalReady || !plan.planHash || plan.planHash !== approvedHash)
    throw new Error("Preview changed; a fresh exact approval is required.");
  if (plan.replayed)
    return { planHash: plan.planHash, replayed: true, closed: manifest.operations.length };
  // New trusted host policy, not the public Meter API (which forbids ad-hoc import receipts).
  const store = await createTransactionBoundStore({ transaction: tx, clock: { now: () => now } });
  for (const [index, correction] of plan.corrections.entries()) {
    const entry = snapshot.entries[index];
    if (!entry) throw new Error("Closeout entry missing.");
    const result = await store.correct(correction);
    if (result.outcome !== "settled" || result.operation.state !== "settled")
      throw new Error("Store refused financial closure; roll back the entire batch.");
    const body = { ...plan, corrections: undefined, manifest, finalOperation: result.operation };
    await tx.$executeRaw`INSERT INTO metering_history_closeout
      (operation_pk,namespace,operation_id,migration_id,source_id,source_hash,target_hash,original_receipt_id,receipt_id,version,policy,disposition,body,recorded_at)
      VALUES(${key(manifest.namespace, correction.operationId)},${manifest.namespace},${correction.operationId},${historyMigration},${entry.journal.source_id},${entry.journal.source_hash},${entry.journal.target_hash},${correction.replacesReceiptId},${correction.receipt.id},${result.operation.version},${closeoutPolicy},'financially_closed_identity_incomplete',${encode(body)}::jsonb,${new Date(manifest.recordedAt)})`;
  }
  await writeAudit(
    {
      action: "instance_admin.metering_history_closed",
      actorId: operator.id,
      projectId: snapshot.project.id,
      targetType: "project",
      targetId: snapshot.project.publicId,
      after: {
        policy: closeoutPolicy,
        planHash: plan.planHash,
        count: manifest.operations.length,
        disposition: "financially_closed_identity_incomplete",
      },
    },
    tx,
  );
  // Manifest eligibility binds every row to the same project and connection.
  const representative = snapshot.entries[0];
  if (representative) await reconcileSpendingGates(tx, representative.operation);
  return { planHash: plan.planHash, replayed: false, closed: plan.corrections.length };
}
