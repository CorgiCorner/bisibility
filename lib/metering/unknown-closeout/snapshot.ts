import type { Prisma } from "@/lib/generated/prisma/client";
import { canonical, hash } from "@/lib/metering/store/codec";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { queuedOwnTagProofSql } from "@/lib/provider-usage/queued-proof";
import {
  parseQueuedCostEvidence,
  queuedCostOperatorState,
} from "@/lib/rank-check/queued-cost-evidence";
import type { UnknownCloseoutManifest } from "./manifest";

export type UnknownCloseoutRow = {
  operation_pk: string;
  operation_id: string;
  namespace: string;
  principal: string;
  state: string;
  version: number;
  input: Prisma.JsonObject;
  created_at: Date;
  lease_expires_at: Date | null;
  attempt_id: string | null;
  fenced: boolean;
  original_principal: string | null;
  credential_version: string | null;
  project: string;
  connection: string;
  rank_check_id: string | null;
  rank_status: string | null;
  task_id: string | null;
  task_state: string | null;
  persistence_expires_at: Date | null;
  accepted_unpriced: boolean;
  cost_evidence: Prisma.JsonValue | null;
  task_provider_id: string | null;
  receipts: bigint;
  active_recovery: boolean;
  closed_hash: string | null;
};

/**
 * A deferred task qualifies as before. A failed task qualifies only when the provider accepted it
 * (native id, own-key tag, no recorded cost) and automatic cost recovery already gave up; a failed
 * task that was never accepted keeps its normal retry path and is refused.
 */
function taskStateQualifies(row: UnknownCloseoutRow) {
  if (row.task_state === "deferred") return true;
  return (
    row.task_state === "failed" &&
    row.accepted_unpriced &&
    queuedCostOperatorState(row.cost_evidence)?.state === "unrecoverable" &&
    // Evidence read for another native id never proves this task's cost is unrecoverable.
    parseQueuedCostEvidence(row.cost_evidence)?.providerTaskId === row.task_provider_id
  );
}

export async function unknownCloseoutSnapshot(
  tx: Prisma.TransactionClient,
  manifest: UnknownCloseoutManifest,
  now: Date,
) {
  const [actor] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE "publicId"=${manifest.operator} AND "isInstanceAdmin"
      AND "emailVerified" AND "deactivatedAt" IS NULL`;
  if (!actor) throw new Error("An active verified instance administrator is required");
  const rows = await tx.$queryRaw<UnknownCloseoutRow[]>(SQL.sql`
    SELECT o.operation_pk,o.operation_id,o.namespace,o.principal,o.state,o.version,o.input,o.created_at,o.lease_expires_at,
      p.dispatch_lease_id AS attempt_id,p.fenced_at IS NOT NULL AS fenced,p.principal AS original_principal,
      p.context->>'providerCredentialVersion' AS credential_version,
      o.input->'scope'->>'group' AS project,o.input->'scope'->>'connection' AS connection,
      rc.id AS rank_check_id,rc.status AS rank_status,t.id AS task_id,t.state AS task_state,t."persistenceLeaseExpiresAt" AS persistence_expires_at,
      COALESCE(t."providerTaskId" IS NOT NULL AND t."costCents" IS NULL AND ${queuedOwnTagProofSql},false) AS accepted_unpriced,
      t."costEvidence" AS cost_evidence,t."providerTaskId" AS task_provider_id,
      (SELECT count(*) FROM metering_receipt r WHERE r.operation_pk=o.operation_pk) AS receipts,
      EXISTS(SELECT 1 FROM provider_recovery_intents i WHERE i."operationPk"=o.operation_pk
        AND i."leaseExpiresAt">${now}) AS active_recovery,d.plan_hash AS closed_hash
    FROM metering_operation o LEFT JOIN metering_paid_attempt_context p
      ON p.namespace=o.namespace AND p.operation_id=o.operation_id
    LEFT JOIN queued_rank_check_tasks t ON t.id=o.input->>'correlationId'
    LEFT JOIN rank_checks rc ON rc.id=COALESCE(t."rankCheckId",p.context->>'rankCheckId')
    LEFT JOIN metering_unknown_closeout d ON d.operation_pk=o.operation_pk
    WHERE o.namespace=${manifest.namespace} AND o.operation_id=ANY(${manifest.operations.map((x) => x.operationId)}::text[])
    ORDER BY o.operation_id`);
  if (rows.length !== manifest.operations.length) throw new Error("Closeout scope changed");
  for (const [index, row] of rows.entries()) {
    if (
      row.operation_id !== manifest.operations[index]?.operationId ||
      row.version !== manifest.operations[index]?.expectedVersion ||
      row.state !== "dispatch_intended" ||
      row.input.fundingSource !== "byok" ||
      row.input.costOwner !== row.principal ||
      row.input.provider !== "dataforseo" ||
      row.input.operation !== "serp.google.organic.task_post" ||
      !row.attempt_id ||
      !row.fenced ||
      row.original_principal !== row.principal ||
      !row.credential_version ||
      row.receipts !== 0n ||
      row.active_recovery ||
      (row.persistence_expires_at && row.persistence_expires_at > now) ||
      (row.lease_expires_at && row.lease_expires_at > now) ||
      !row.task_id ||
      !taskStateQualifies(row) ||
      !["deferred", "failed"].includes(row.rank_status ?? "") ||
      row.created_at.getTime() > now.getTime() - 15 * 60000
    )
      throw new Error("Only terminal original BYOK submissions without native receipts qualify");
    const connection = await tx.providerConnection.findFirst({
      where: {
        id: row.connection,
        projectId: row.project,
        provider: "dataforseo",
        credentialSource: "own",
      },
    });
    if (
      !connection ||
      ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted) !==
        row.credential_version
    )
      throw new Error("The original provider account changed");
  }
  if (rows.some((row) => row.closed_hash !== null) && rows.some((row) => row.closed_hash === null))
    throw new Error("Partial closeout cannot be replayed");
  const basis = rows.map(
    ({ closed_hash: _, active_recovery: __, lease_expires_at: ___, ...row }) => ({
      ...row,
      created_at: row.created_at.toISOString(),
    }),
  );
  const planHash = hash(canonical({ manifest, actor: actor.id, basis }));
  if (rows.some((row) => row.closed_hash !== null && row.closed_hash !== planHash))
    throw new Error("A different immutable closeout already exists");
  return {
    actorId: actor.id,
    rows,
    planHash,
    replayed: rows.every((row) => row.closed_hash === planHash),
  };
}
