import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  actionableUnknownAccounting,
  finalReceiptJoin,
} from "@/lib/provider-usage/reconcile-state";
import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import type { MeterReserveInput } from "@usagekit/core";

/** The caller already holds the original BYOK connection row through dispatch. */
export async function assertConnectionRecoveryAdmission(
  tx: Prisma.TransactionClient,
  input: MeterReserveInput,
  credentialVersion: string | null,
  now: Date,
  capability = input.operation,
) {
  const [row] = await tx.$queryRaw<
    {
      accountBlocked: boolean;
      accountingBlocked: boolean;
      incidentId: string | null;
      legacyVersion: number | null;
      scope: unknown;
    }[]
  >`
    WITH applicable AS (SELECT i.id,i.scope FROM provider_account_incidents i
      WHERE i."connectionId"=${input.scope.connection} AND i."credentialVersion"=${credentialVersion}
        AND i."resolvedAt" IS NULL AND (i.scope->>'kind'='account' OR i.scope->>'capability'=${capability})
      ORDER BY i."startedAt",i.id LIMIT 1)
    SELECT (EXISTS(SELECT 1 FROM applicable) OR EXISTS(SELECT 1 FROM provider_connection_recovery a
      WHERE a."connectionId"=${input.scope.connection} AND a."credentialVersion"=${credentialVersion}
        AND a."accountState"<>'verified' AND NOT EXISTS (SELECT 1 FROM provider_account_incidents current_incident WHERE current_incident.id=a."currentIncidentId" AND current_incident."credentialVersion"=a."credentialVersion" AND current_incident."resolvedAt" IS NULL))) AS "accountBlocked",
      (SELECT id FROM applicable) AS "incidentId",
      (SELECT scope FROM applicable) AS scope,
      (SELECT a.version FROM provider_connection_recovery a WHERE a."connectionId"=${input.scope.connection} AND a."credentialVersion"=${credentialVersion} AND a."accountState"<>'verified' AND NOT EXISTS (SELECT 1 FROM provider_account_incidents current_incident WHERE current_incident.id=a."currentIncidentId" AND current_incident."credentialVersion"=a."credentialVersion" AND current_incident."resolvedAt" IS NULL)) AS "legacyVersion",
      EXISTS(SELECT 1 FROM metering_operation o ${finalReceiptJoin}
        WHERE o.namespace=${input.scope.namespace} AND o.input->'scope'->>'group'=${input.scope.group}
          AND o.input->'scope'->>'connection'=${input.scope.connection}
          AND o.operation_id<>${input.operationId} AND ${actionableUnknownAccounting}
          AND o.created_at<${new Date(now.getTime() - 15 * 60000)}) AS "accountingBlocked"`;
  if (!row) throw new ProviderUsagePersistenceError({ phase: "admission" });
  if (row.accountBlocked)
    throw new ProviderRecoveryAdmissionError(
      "account_blocked",
      row.scope &&
        typeof row.scope === "object" &&
        "kind" in row.scope &&
        row.scope.kind === "capability" &&
        "capability" in row.scope &&
        typeof row.scope.capability === "string"
        ? { kind: "capability", capability: row.scope.capability }
        : { kind: "account" },
      undefined,
      row.incidentId ?? null,
      row.legacyVersion ?? null,
    );
  if (row.accountingBlocked)
    throw new ProviderRecoveryAdmissionError("accounting_review", { kind: "account" });
}
