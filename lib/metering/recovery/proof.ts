import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { recoverCandidate } from "@/lib/provider-usage/reconcile-recovery";
import { recoveryIncidentBody } from "@/lib/provider-usage/recovery-notification-policy";
import { recoverDeploymentProof } from "./deployment-extension";
import type { RecoveryRecord } from "./records";

/** This path has evidence authority only and never obtains a transport grant. */
async function recoverProof(tx: Prisma.TransactionClient, row: RecoveryRecord, now: Date) {
  if (row.kind === "evidence")
    return recoverCandidate(
      tx,
      row.namespace,
      { kind: "evidence", id: row.id, cursor: `e:${row.id}`, connection: row.connectionId ?? "" },
      now,
    );
  if (row.kind !== "operation") return false;
  if (row.funding === "platform") return recoverDeploymentProof(tx, row.namespace, row.id);
  const proofs = await tx.$queryRaw<{ id: string }[]>(SQL.sql`
    SELECT e.id FROM metering_usage_evidence e
    LEFT JOIN metering_history_import h ON h.namespace=e.namespace AND h.source_id=e.id
      AND h.migration_id='20261011021000_accounting_history'
    WHERE e.namespace=${row.namespace} AND NOT e.discarded AND e."receiptId" IS NOT NULL
      AND COALESCE(h.operation_id,e.id)=${row.id} ORDER BY e.id COLLATE "C" LIMIT 25`);
  let changed = false;
  for (const proof of proofs)
    changed =
      (await recoverCandidate(
        tx,
        row.namespace,
        {
          kind: "evidence",
          id: proof.id,
          cursor: `e:${proof.id}`,
          connection: row.connectionId ?? "",
        },
        now,
      )) || changed;
  if (!proofs.length)
    changed = await recoverCandidate(
      tx,
      row.namespace,
      { kind: "operation", id: row.id, cursor: `o:${row.id}`, connection: row.connectionId ?? "" },
      now,
    );
  return changed;
}
export async function recoverOriginalProof(
  tx: Prisma.TransactionClient,
  row: RecoveryRecord,
  now: Date,
) {
  const changed = await recoverProof(tx, row, now);
  await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata m
    WHERE m.key LIKE 'authoritative-reconciliation-error:%'
      AND ${recoveryIncidentBody}->>'namespace'=${row.namespace} AND ${recoveryIncidentBody}->>'kind'=${row.kind}
      AND ${recoveryIncidentBody}->>'id'=${row.id}`);
  return changed;
}
