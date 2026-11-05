import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { accountHealthAdapter } from "@/lib/providers/account-health/registry";
import { AUTO_CHECK_INCIDENT_REASONS, autoCheckEligible, nextAccountCheck } from "./cadence";
import { PROBE_LEASE_MS } from "./probe";

export async function initializeAccountSchedules(providers: string[], now: Date) {
  const rows = await prisma.providerConnectionRecovery.findMany({
    where: {
      nextCheckAt: null,
      cadenceAttempt: 0,
      OR: [
        { lastManualCheckAt: null, probeId: null, leaseOwner: null },
        { leaseOwner: { not: null }, leaseExpiresAt: { lte: now } },
      ],
      connection: {
        enabled: true,
        credentialSource: "own",
        status: { in: ["connected", "needs_reauth"] },
        provider: { in: providers },
      },
      currentIncident: {
        is: {
          resolvedAt: null,
          startedAt: { gt: new Date(now.getTime() - 30 * 86400_000) },
          reason: {
            in: [...AUTO_CHECK_INCIDENT_REASONS],
          },
        },
      },
    },
    include: { currentIncident: true, connection: true },
    take: 50,
    orderBy: { connectionId: "asc" },
  });
  for (const row of rows) {
    const incident = row.currentIncident;
    const authIncident = await prisma.providerAccountIncident.findFirst({
      where: {
        connectionId: row.connectionId,
        credentialVersion: row.credentialVersion,
        reason: "provider_auth",
        resolvedAt: null,
      },
      select: { id: true },
    });
    const expiredLease = row.leaseOwner && row.leaseExpiresAt && row.leaseExpiresAt <= now;
    const alreadyFinished =
      expiredLease &&
      row.checkedAt.getTime() > (row.leaseExpiresAt?.getTime() ?? 0) - PROBE_LEASE_MS;
    if (
      !incident ||
      alreadyFinished ||
      row.lastProbeOutcome === "provider_auth" ||
      authIncident ||
      !autoCheckEligible(accountHealthAdapter(row.connection.provider), incident.reason) ||
      incident.credentialVersion !== row.credentialVersion ||
      ownCredentialVersion(
        row.connection.provider,
        row.connection.id,
        row.connection.credentialsEncrypted,
      ) !== row.credentialVersion
    ) {
      await prisma.providerConnectionRecovery.updateMany({
        where: {
          connectionId: row.connectionId,
          credentialVersion: row.credentialVersion,
          currentIncidentId: row.currentIncidentId,
          nextCheckAt: null,
          cadenceAttempt: 0,
          version: row.version,
        },
        data: { cadenceAttempt: 1 },
      });
      continue;
    }
    const next = nextAccountCheck({
      startedAt: incident.startedAt,
      now: incident.startedAt,
      attempt: 0,
      retryAt: row.providerCooldownUntil,
    });
    if (!next) {
      await prisma.providerConnectionRecovery.updateMany({
        where: { connectionId: row.connectionId, version: row.version, nextCheckAt: null },
        data: { cadenceAttempt: 1 },
      });
      continue;
    }
    await prisma.providerConnectionRecovery.updateMany({
      where: {
        connectionId: row.connectionId,
        credentialVersion: row.credentialVersion,
        currentIncidentId: incident.id,
        nextCheckAt: null,
        cadenceAttempt: 0,
        version: row.version,
        connection: {
          enabled: true,
          credentialSource: "own",
          status: { in: ["connected", "needs_reauth"] },
          provider: { in: providers },
        },
        currentIncident: { is: { id: incident.id, resolvedAt: null } },
      },
      data: {
        nextCheckAt: next,
        ...(expiredLease ? { probeId: null, leaseOwner: null, leaseExpiresAt: null } : {}),
      },
    });
  }
}

export async function retireAccountSchedules(providers: string[], now: Date) {
  await prisma.providerConnectionRecovery.updateMany({
    where: {
      nextCheckAt: { not: null },
      OR: [
        { lastProbeOutcome: "provider_auth" },
        { connection: { enabled: false } },
        { connection: { credentialSource: { not: "own" } } },
        { connection: { status: { notIn: ["connected", "needs_reauth"] } } },
        { connection: { provider: { notIn: providers } } },
        { currentIncident: null },
        { currentIncident: { is: { resolvedAt: { not: null } } } },
        {
          currentIncident: {
            is: {
              reason: {
                notIn: [...AUTO_CHECK_INCIDENT_REASONS],
              },
            },
          },
        },
        {
          currentIncident: { is: { startedAt: { lte: new Date(now.getTime() - 30 * 86400_000) } } },
        },
      ],
    },
    data: { nextCheckAt: null },
  });
}
