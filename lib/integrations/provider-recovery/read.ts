import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  actionableUnknownAccounting,
  finalReceiptJoin,
  unknownAccounting,
} from "@/lib/provider-usage/reconcile-state";
import {
  accountHealthAdapter,
  accountHealthProviders,
} from "@/lib/providers/account-health/registry";
import { selectConnectionRecovery } from "./selector";
import type { ConnectionRecoveryView } from "./types";

export const affectedPageSize = 50;
/** Shared admission/UI predicate: normal in-flight work is not an overdue incident. */
export function affectedOperations(
  projectId: string,
  connectionId: string,
  now: Date,
  includeClosed = false,
) {
  return Prisma.sql`o.namespace=${meteringNamespace()}
    AND o.input->'scope'->>'group'=${projectId}
    AND o.input->'scope'->>'connection'=${connectionId}
    AND o.created_at<${new Date(now.getTime() - 15 * 60000)} AND ${includeClosed ? unknownAccounting : actionableUnknownAccounting}`;
}

export async function readConnectionRecovery(
  projectId: string,
  connectionId: string,
  now = new Date(),
): Promise<ConnectionRecoveryView | null> {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: connectionId,
      projectId,
      credentialSource: "own",
      provider: { in: accountHealthProviders() },
    },
    select: { credentialsEncrypted: true, provider: true },
  });
  if (!connection) return null;
  const credentialVersion = ownCredentialVersion(
    connection.provider,
    connectionId,
    connection.credentialsEncrypted,
  );
  const [account, incidents, rows, refusalCounts] = await Promise.all([
    prisma.providerConnectionRecovery.findFirst({
      where: { connectionId, credentialVersion: credentialVersion ?? "" },
    }),
    prisma.providerAccountIncident.findMany({
      where: { connectionId, credentialVersion: credentialVersion ?? "", resolvedAt: null },
      select: { id: true, reason: true, scope: true },
    }),
    prisma.$queryRaw<
      {
        count: bigint;
        requests: bigint;
        latest: Date | null;
      }[]
    >`
      SELECT count(DISTINCT rc.id) FILTER (WHERE ${actionableUnknownAccounting}) AS count,count(*) FILTER (WHERE ${actionableUnknownAccounting}) AS requests,max(o.updated_at) AS latest
      FROM metering_operation o ${finalReceiptJoin}
      LEFT JOIN metering_paid_attempt_context p ON p.namespace=o.namespace AND p.operation_id=o.operation_id
      LEFT JOIN queued_rank_check_tasks t ON t.id=COALESCE(o.input->>'correlationId',p.context->>'correlationId')
      LEFT JOIN rank_checks rc ON rc.id=COALESCE(t."rankCheckId",p.context->>'rankCheckId')
      WHERE ${affectedOperations(projectId, connectionId, now, true)}`,
    prisma.$queryRaw<
      { count: bigint; current: bigint; fallback: bigint; fallbackProviders: string[] }[]
    >`
      SELECT count(DISTINCT b."rankCheckId") AS count,
        count(DISTINCT b."rankCheckId") FILTER (WHERE b."incidentId"=(SELECT r."currentIncidentId" FROM provider_connection_recovery r JOIN provider_account_incidents ci ON ci.id=r."currentIncidentId" AND ci."resolvedAt" IS NULL AND ci."credentialVersion"=r."credentialVersion" WHERE r."connectionId"=${connectionId})) AS current,
        count(DISTINCT b."rankCheckId") FILTER (WHERE rc.status='completed' AND rc."viaFallback"=true) AS fallback,
        coalesce(array_agg(DISTINCT rc.provider) FILTER (WHERE rc.status='completed' AND rc."viaFallback"=true), ARRAY[]::text[]) AS "fallbackProviders"
      FROM provider_blocked_attempts b
      JOIN provider_account_incidents i ON i.id=b."incidentId"
      JOIN provider_connections c ON c.id=b."connectionId"
      JOIN rank_checks rc ON rc.id=b."rankCheckId"
      JOIN keywords k ON k.id=rc."keywordId"
      WHERE k."projectId"=${projectId} AND c."projectId"=${projectId} AND b."connectionId"=${connectionId}
        AND b."createdAt" <= ${now} AND b.reason='account_blocked'`,
  ]);
  const row = rows[0];
  const affectedChecks = Number(row?.count ?? 0);
  const unconfirmedRequests = Number(row?.requests ?? 0);
  const selected = selectConnectionRecovery({
    accountState: account?.accountState ?? null,
    currentIncidentId: account?.currentIncidentId,
    incidents,
    unconfirmedRequests,
    probeId:
      account?.leaseExpiresAt && account.leaseExpiresAt > now
        ? (account.probeId ?? account.leaseOwner)
        : null,
    probeAvailable: accountHealthAdapter(connection.provider)?.probe.available ?? false,
    nextCheckAt: account?.nextCheckAt?.toISOString() ?? null,
  });
  const checksNotSent = Number(refusalCounts[0]?.count ?? 0);
  if (!account && !incidents.length && !unconfirmedRequests && !checksNotSent) return null;
  return {
    ...selected,
    capacityUnit: accountHealthAdapter(connection.provider)?.capacity.unit ?? null,
    checkedAt: account?.checkedAt.toISOString() ?? null,
    affectedChecks,
    checksNotSent,
    currentIncidentChecksNotSent: Number(refusalCounts[0]?.current ?? 0),
    fallbackCompleted: Number(refusalCounts[0]?.fallback ?? 0),
    fallbackProviders: refusalCounts[0]?.fallbackProviders ?? [],
    rangeEnd: now.toISOString(),
    unconfirmedRequests,
    revision: createHash("sha256")
      .update(
        JSON.stringify([
          account?.version,
          row?.latest,
          unconfirmedRequests,
          selected.reason,
          checksNotSent,
        ]),
      )
      .digest("hex"),
  };
}
