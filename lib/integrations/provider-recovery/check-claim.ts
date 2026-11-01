import "server-only";
import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { accountHealthAdapter } from "@/lib/providers/account-health/registry";
import { autoCheckEligible } from "./cadence";
import { PROBE_LEASE_MS } from "./probe";

export type CheckInput = {
  projectId: string;
  projectPublicId: string;
  connectionPublicId: string;
  actorId: string | null;
  automatic?: boolean;
};

export async function claimAccountCheck(input: CheckInput) {
  const original = await prisma.providerConnection.findFirstOrThrow({
    where: {
      publicId: input.connectionPublicId,
      projectId: input.projectId,
      credentialSource: "own",
    },
  });
  const adapter = accountHealthAdapter(original.provider);
  const version = ownCredentialVersion(
    original.provider,
    original.id,
    original.credentialsEncrypted,
  );
  if (!version || !adapter?.probe.available || !adapter.check)
    throw new Error("Provider account verification is unavailable.");
  const probeId = randomUUID();
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${original.id} FOR UPDATE`;
    const current = await tx.providerConnection.findUnique({ where: { id: original.id } });
    if (
      !current ||
      current.projectId !== input.projectId ||
      current.credentialSource !== "own" ||
      !current.enabled ||
      !["connected", "needs_reauth"].includes(current.status) ||
      ownCredentialVersion(current.provider, current.id, current.credentialsEncrypted) !== version
    )
      throw new Error("The provider account changed. Check the current connection.");
    const existing = await tx.providerConnectionRecovery.findUnique({
      where: { connectionId: original.id },
      include: { currentIncident: true },
    });
    const now = new Date();
    if (
      existing?.credentialVersion === version &&
      existing.leaseOwner &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt > now
    )
      return { original, adapter, version, status: "checking" as const };
    if (
      existing?.credentialVersion === version &&
      existing.providerCooldownUntil &&
      existing.providerCooldownUntil > now
    ) {
      if (
        input.automatic &&
        existing.nextCheckAt &&
        existing.nextCheckAt <= now &&
        existing.currentIncident
      ) {
        const stopAt = existing.currentIncident.startedAt.getTime() + 30 * 86400_000;
        await tx.providerConnectionRecovery.update({
          where: { connectionId: original.id },
          data: {
            nextCheckAt:
              existing.providerCooldownUntil.getTime() < stopAt
                ? existing.providerCooldownUntil
                : null,
          },
        });
      }
      return { original, adapter, version, status: "cooldown" as const };
    }
    if (input.automatic) {
      const incident = existing?.currentIncident;
      const authIncident =
        existing?.credentialVersion === version
          ? await tx.providerAccountIncident.findFirst({
              where: {
                connectionId: original.id,
                credentialVersion: version,
                reason: "provider_auth",
                resolvedAt: null,
              },
              select: { id: true },
            })
          : null;
      if (
        existing?.credentialVersion !== version ||
        existing.lastProbeOutcome === "provider_auth" ||
        authIncident ||
        !incident ||
        incident.resolvedAt ||
        incident.credentialVersion !== version ||
        !existing.nextCheckAt ||
        existing.nextCheckAt > now ||
        !autoCheckEligible(adapter, incident.reason) ||
        now.getTime() - incident.startedAt.getTime() >= 30 * 86400_000
      ) {
        if (
          existing &&
          (existing.credentialVersion !== version ||
            existing.lastProbeOutcome === "provider_auth" ||
            authIncident)
        )
          await tx.providerConnectionRecovery.updateMany({
            where: { connectionId: original.id, credentialVersion: existing.credentialVersion },
            data: { nextCheckAt: null },
          });
        return { original, adapter, version, status: "skipped" as const };
      }
    } else if (
      existing?.credentialVersion === version &&
      existing.lastManualCheckAt &&
      now.getTime() - existing.lastManualCheckAt.getTime() < 60_000
    ) {
      return { original, adapter, version, status: "cooldown" as const };
    }
    const incidentId = existing?.credentialVersion === version ? existing.currentIncidentId : null;
    const lease = {
      probeId,
      leaseOwner: probeId,
      leaseExpiresAt: new Date(now.getTime() + PROBE_LEASE_MS),
    };
    await tx.providerConnectionRecovery.upsert({
      where: { connectionId: original.id },
      create: {
        connectionId: original.id,
        credentialVersion: version,
        accountState: "unknown",
        ...lease,
        lastManualCheckAt: input.automatic ? null : now,
      },
      update: {
        credentialVersion: version,
        ...lease,
        version: { increment: 1 },
        ...(!input.automatic ? { lastManualCheckAt: now } : {}),
        ...(existing?.credentialVersion !== version
          ? {
              accountState: "unknown",
              currentIncidentId: null,
              lastProbeOutcome: null,
              providerCooldownUntil: null,
              nextCheckAt: null,
              cadenceAttempt: 0,
            }
          : {}),
      },
    });
    await writeAudit(
      {
        action: "provider.recovery_account_check_started",
        actorId: input.actorId,
        projectId: input.projectId,
        targetId: original.publicId,
        targetType: "provider_connection",
        after: { freeAccountCheck: adapter.probe.cost === "non_billable", paidReplay: false },
      },
      tx,
    );
    return { original, adapter, version, status: "claimed" as const, incidentId, probeId };
  });
}
