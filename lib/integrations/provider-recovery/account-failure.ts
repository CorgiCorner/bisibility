import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { AccountFact } from "@/lib/providers/account-health/adapter";
import { accountHealthAdapter } from "@/lib/providers/account-health/registry";
import { sameAccountScope } from "@/lib/providers/account-health/types";
import { autoCheckEligible, nextAccountCheck } from "./cadence";
import { deliverAccountIncident } from "./notification";

export async function recordConnectionAccountFailure(input: {
  connectionId: string;
  projectId: string;
  provider: string;
  credentialVersion: string | null;
  fact: AccountFact;
  httpStatus?: number;
  minimumCapacity?: number | null;
  capacityUnit?: "usd" | "searches" | null;
}) {
  const { fact, credentialVersion } = input;
  if (
    !credentialVersion ||
    fact.kind !== "failure" ||
    !["provider_billing", "provider_auth", "provider_account_restricted"].includes(fact.code)
  )
    return false;
  return notificationTransaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${input.connectionId} FOR UPDATE`;
    const connection = await tx.providerConnection.findUnique({
      where: { id: input.connectionId },
    });
    if (
      !connection ||
      connection.projectId !== input.projectId ||
      connection.provider !== input.provider ||
      connection.credentialSource !== "own" ||
      ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted) !==
        credentialVersion
    )
      return false;
    const open = await tx.providerAccountIncident.findMany({
      where: {
        connectionId: connection.id,
        credentialVersion,
        reason: fact.code,
        resolvedAt: null,
      },
      orderBy: { startedAt: "asc" },
    });
    const matched = open.find((candidate) => sameAccountScope(candidate.scope, fact.scope));
    const incident = matched
      ? matched
      : await tx.providerAccountIncident.create({
          data: {
            connectionId: connection.id,
            credentialVersion,
            scope: fact.scope,
            reason: fact.code,
            evidenceSource: "provider_response",
            minimumCapacity: input.minimumCapacity ?? null,
            capacityUnit: input.capacityUnit ?? null,
          },
        });
    if (
      matched &&
      input.minimumCapacity &&
      input.capacityUnit &&
      (!matched.capacityUnit || input.capacityUnit === matched.capacityUnit)
    )
      await tx.providerAccountIncident.update({
        where: { id: matched.id },
        data: {
          minimumCapacity: Math.max(matched.minimumCapacity ?? 0, input.minimumCapacity),
          capacityUnit: input.capacityUnit,
        },
      });
    const recovery = await tx.providerConnectionRecovery.findUnique({
      where: { connectionId: connection.id },
      select: {
        currentIncidentId: true,
        credentialVersion: true,
        lastProbeOutcome: true,
        providerCooldownUntil: true,
      },
    });
    const switched =
      !matched ||
      recovery?.currentIncidentId !== incident.id ||
      recovery.credentialVersion !== credentialVersion;
    const authIncident = await tx.providerAccountIncident.findFirst({
      where: {
        connectionId: connection.id,
        credentialVersion,
        reason: "provider_auth",
        resolvedAt: null,
      },
      select: { id: true },
    });
    const authPaused =
      Boolean(authIncident) ||
      (recovery?.credentialVersion === credentialVersion &&
        recovery.lastProbeOutcome === "provider_auth");
    const state = fact.code === "provider_billing" ? "payment_required" : "unknown";
    const nextCheckAt =
      !authPaused && autoCheckEligible(accountHealthAdapter(input.provider), fact.code)
        ? nextAccountCheck({
            startedAt: incident.startedAt,
            now: new Date(),
            attempt: 0,
            retryAt:
              recovery?.credentialVersion === credentialVersion
                ? recovery.providerCooldownUntil
                : null,
          })
        : null;
    await tx.providerConnectionRecovery.upsert({
      where: { connectionId: connection.id },
      create: {
        connectionId: connection.id,
        credentialVersion,
        accountState: state,
        currentIncidentId: incident.id,
        nextCheckAt,
      },
      update: {
        credentialVersion,
        accountState: state,
        currentIncidentId: incident.id,
        probeId: null,
        checkedAt: new Date(),
        version: { increment: 1 },
        ...(switched || authPaused
          ? { ...(switched ? { cadenceAttempt: 0 } : {}), nextCheckAt }
          : {}),
        ...(recovery?.credentialVersion !== credentialVersion
          ? { lastProbeOutcome: null, providerCooldownUntil: null }
          : {}),
      },
    });
    if (!matched) {
      await deliverAccountIncident(tx, {
        projectId: input.projectId,
        connectionId: connection.id,
        incidentId: incident.id,
        provider: input.provider,
        reason: fact.code,
      });
      await writeAudit(
        {
          action:
            input.httpStatus === 402 ? "provider.payment_required" : "provider.account_blocked",
          actorId: null,
          projectId: input.projectId,
          targetId: connection.publicId,
          targetType: "provider_connection",
          after: {
            reason: fact.code,
            ...(input.httpStatus ? { httpStatus: input.httpStatus } : {}),
            paidTransportPaused: true,
            originalCostConfirmed: false,
          },
        },
        tx,
      );
    }
    return true;
  });
}
