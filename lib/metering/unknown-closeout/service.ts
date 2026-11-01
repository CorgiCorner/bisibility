import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockConnectionAccounting } from "@/lib/metering/store/accounting-lock";
import { encode } from "@/lib/metering/store/codec";
import { createSql, lock } from "@/lib/metering/store/host-sql";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import { lockRecoveryTask } from "@/lib/provider-evidence/recovery/lease";
import { reconcileSpendingGates } from "@/lib/provider-usage/reconcile-gates";
import { unknownCloseoutManifest } from "./manifest";
import { unknownCloseoutSnapshot } from "./snapshot";

async function controls(tx: Prisma.TransactionClient, readOnly: boolean) {
  const [row] = await tx.$queryRaw<{ isolation: string; readOnly: string }[]>`
    SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly"`;
  if (
    row?.isolation !== (readOnly ? "repeatable read" : "read committed") ||
    row.readOnly !== (readOnly ? "on" : "off")
  )
    throw new Error(
      "An explicit read-only snapshot or ReadCommitted apply transaction is required",
    );
}
export async function previewUnknownCloseout(
  tx: Prisma.TransactionClient,
  value: unknown,
  now = new Date(),
) {
  await controls(tx, true);
  const manifest = unknownCloseoutManifest.parse(value);
  const snapshot = await unknownCloseoutSnapshot(tx, manifest, now);
  return {
    policy: manifest.policy,
    planHash: snapshot.planHash,
    replayed: snapshot.replayed,
    count: snapshot.rows.length,
    cost: "unknown" as const,
    providerCalls: 0,
    paidReplay: false,
    operations: snapshot.rows.map((row) => ({
      operationId: row.operation_id,
      version: row.version,
      connection: row.connection,
    })),
  };
}

/** Privileged operator annotation; never settles Meter, releases reservations or attests money. */
export async function applyUnknownCloseout(
  tx: Prisma.TransactionClient,
  value: unknown,
  expectedHash: string,
  now = new Date(),
) {
  await controls(tx, false);
  const manifest = unknownCloseoutManifest.parse(value);
  const [actor] = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM users WHERE "publicId"=${manifest.operator}
    AND "isInstanceAdmin" AND "emailVerified" AND "deactivatedAt" IS NULL FOR SHARE`;
  if (!actor) throw new Error("An active verified instance administrator is required");
  const first = await unknownCloseoutSnapshot(tx, manifest, now);
  for (const id of [...new Set(first.rows.map((row) => row.project))].sort())
    await lockProjectForProviderMutation(tx, id);
  for (const id of [...new Set(first.rows.map((row) => row.connection))].sort())
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${id} FOR UPDATE`;
  for (const row of first.rows) {
    if (!row.task_id) throw new Error("Original task missing");
    await lockRecoveryTask(tx, row.task_id);
    await tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE id=${row.task_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${row.rank_check_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM provider_recovery_intents WHERE "operationPk"=${row.operation_pk} FOR UPDATE`;
    await tx.$queryRaw`SELECT "operationPk" FROM provider_operation_evidence WHERE "operationPk"=${row.operation_pk} FOR UPDATE`;
  }
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  for (const connection of [...new Set(first.rows.map((row) => row.connection))].sort())
    await lockConnectionAccounting(sql, manifest.namespace, connection);
  for (const row of first.rows) {
    await lock(sql, `metering:operation:${row.operation_pk}`);
    await tx.$queryRaw`SELECT operation_pk FROM metering_operation WHERE operation_pk=${row.operation_pk} FOR UPDATE`;
    await tx.$queryRaw`SELECT operation_id FROM metering_paid_attempt_context WHERE namespace=${manifest.namespace} AND operation_id=${row.operation_id} FOR UPDATE`;
  }
  const snapshot = await unknownCloseoutSnapshot(tx, manifest, now);
  if (snapshot.planHash !== expectedHash)
    throw new Error("Closeout changed; review a fresh preview");
  if (snapshot.replayed)
    return {
      planHash: expectedHash,
      closed: snapshot.rows.length,
      replayed: true,
      cost: "unknown",
    };
  for (const row of snapshot.rows) {
    await tx.$executeRaw`INSERT INTO metering_unknown_closeout
      (operation_pk,namespace,operation_id,version,input,attempt_id,credential_version,policy,plan_hash,actor_id,recorded_at)
      VALUES(${row.operation_pk},${manifest.namespace},${row.operation_id},${row.version},${encode(row.input)}::jsonb,
        ${row.attempt_id},${row.credential_version},${manifest.policy},${expectedHash},${snapshot.actorId},${new Date(manifest.recordedAt)})`;
    await tx.providerRecoveryIntent.updateMany({
      where: { operationPk: row.operation_pk },
      data: {
        state: "operator_review",
        reason: "operator_closed_cost_unknown",
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.providerOperationEvidence.updateMany({
      where: { operationPk: row.operation_pk },
      data: {
        recoveryState: "operator_review",
        recoveryReason: "operator_closed_cost_unknown",
        nextAttemptAt: null,
        exhaustionStatus: "exhausted",
        exhaustionReason: "operator_closed_cost_unknown",
      },
    });
  }
  const meter = await createTransactionMeter(tx);
  for (const row of snapshot.rows) {
    if (!row.credential_version) throw new Error("Original credential missing");
    const account = await tx.providerConnectionRecovery.findUnique({
      where: { connectionId: row.connection },
    });
    // Closure is not a healthy-account probe. A missing/currently unverified account stays paused.
    if (!account || account.credentialVersion !== row.credential_version)
      await tx.providerConnectionRecovery.upsert({
        where: { connectionId: row.connection },
        create: {
          connectionId: row.connection,
          credentialVersion: row.credential_version,
          accountState: "unknown",
        },
        update: {
          credentialVersion: row.credential_version,
          accountState: "unknown",
          probeId: null,
          checkedAt: now,
          version: { increment: 1 },
        },
      });
    const operation = await readPaidOperation(meter, {
      namespace: manifest.namespace,
      principal: row.principal,
      operationId: row.operation_id,
    });
    await reconcileSpendingGates(tx, operation);
    await refreshOperationIncident(tx, row.operation_pk);
  }
  await writeAudit(
    {
      action: "instance_admin.metering_cost_unknown_closed",
      actorId: snapshot.actorId,
      targetType: "instance_ops",
      targetId: "metering-recovery",
      after: {
        policy: manifest.policy,
        planHash: expectedHash,
        count: snapshot.rows.length,
        cost: "unknown",
        reason: manifest.reason,
        evidenceRef: manifest.evidenceRef,
      },
    },
    tx,
  );
  return {
    planHash: expectedHash,
    closed: snapshot.rows.length,
    replayed: false,
    cost: "unknown",
  };
}
