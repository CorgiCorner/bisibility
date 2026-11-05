import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { type AccountFact, capacityReadiness } from "@/lib/providers/account-health/adapter";
import { sameAccountScope } from "@/lib/providers/account-health/types";
import { autoCheckEligible, nextAccountCheck } from "./cadence";
import type { CheckInput, claimAccountCheck } from "./check-claim";
import { deliverAccountIncident } from "./notification";

type Claim = Extract<Awaited<ReturnType<typeof claimAccountCheck>>, { status: "claimed" }>;

export async function finishAccountCheck(
  input: CheckInput,
  claim: Claim,
  result: { fact: AccountFact; retryAt?: Date; timedOut?: boolean },
) {
  return notificationTransaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${claim.original.id} FOR UPDATE`;
    const current = await tx.providerConnection.findUnique({ where: { id: claim.original.id } });
    const existing = await tx.providerConnectionRecovery.findUnique({
      where: { connectionId: claim.original.id },
      include: { currentIncident: true },
    });
    const now = new Date();
    if (
      !current?.enabled ||
      !["connected", "needs_reauth"].includes(current.status) ||
      current.projectId !== input.projectId ||
      current.credentialSource !== "own" ||
      ownCredentialVersion(current.provider, current.id, current.credentialsEncrypted) !==
        claim.version ||
      existing?.credentialVersion !== claim.version ||
      existing.probeId !== claim.probeId ||
      existing.leaseOwner !== claim.probeId ||
      !existing.leaseExpiresAt ||
      existing.leaseExpiresAt <= now ||
      (existing.currentIncidentId ?? null) !== claim.incidentId
    )
      return "stale" as const;
    const incident = existing.currentIncident;
    const matches =
      incident &&
      incident.id === claim.incidentId &&
      incident.connectionId === current.id &&
      incident.credentialVersion === claim.version &&
      !incident.resolvedAt;
    const minimum =
      matches && incident.capacityUnit === claim.adapter.capacity.unit
        ? claim.adapter.capacity.minimum(
            claim.adapter.capacity.unit === "usd"
              ? { estimatedCostUsd: incident.minimumCapacity ?? undefined }
              : { searches: incident.minimumCapacity ?? undefined },
          )
        : null;
    const legacyCapacity =
      matches &&
      (incident.reason === "legacy_unverified" || incident.evidenceSource === "legacy_probe") &&
      incident.minimumCapacity === null &&
      result.fact.kind === "capacity" &&
      result.fact.unit === claim.adapter.capacity.unit &&
      Number.isFinite(result.fact.value) &&
      result.fact.value > 0;
    const ready =
      matches &&
      sameAccountScope(incident.scope, result.fact.scope) &&
      (legacyCapacity || capacityReadiness(result.fact, minimum) === "ready") &&
      !(
        incident.reason === "provider_account_restricted" &&
        typeof incident.scope === "object" &&
        incident.scope !== null &&
        "kind" in incident.scope &&
        incident.scope.kind === "capability"
      );
    if (ready) {
      await tx.providerAccountIncident.updateMany({
        where: {
          id: incident.id,
          connectionId: current.id,
          credentialVersion: claim.version,
          resolvedAt: null,
        },
        data: { resolvedAt: now },
      });
      await deliverAccountIncident(tx, {
        projectId: input.projectId,
        connectionId: current.id,
        incidentId: incident.id,
        provider: current.provider,
        reason: incident.reason,
        resolved: true,
      });
    }
    const legacyEvidence =
      matches &&
      (incident.reason === "legacy_unverified" ||
        (incident.reason === "provider_transient" && incident.evidenceSource === "legacy_probe")) &&
      sameAccountScope(incident.scope, result.fact.scope);
    const legacyFailure = legacyEvidence
      ? result.fact.kind === "failure"
        ? result.fact.code === "provider_rate_limited"
          ? "provider_transient"
          : [
                "provider_auth",
                "provider_billing",
                "provider_account_restricted",
                "provider_transient",
              ].includes(result.fact.code)
            ? result.fact.code
            : null
        : result.fact.kind === "capacity" &&
            result.fact.unit === claim.adapter.capacity.unit &&
            Number.isFinite(result.fact.value) &&
            result.fact.value <= 0
          ? "provider_billing"
          : result.fact.kind === "not_verified"
            ? "provider_transient"
            : null
      : null;
    if (legacyFailure && incident) {
      await tx.providerAccountIncident.update({
        where: { id: incident.id },
        data: { reason: legacyFailure, evidenceSource: "legacy_probe" },
      });
      await deliverAccountIncident(tx, {
        projectId: input.projectId,
        connectionId: current.id,
        incidentId: incident.id,
        provider: current.provider,
        reason: legacyFailure,
      });
    }
    const other = ready
      ? await tx.providerAccountIncident.findFirst({
          where: {
            connectionId: current.id,
            credentialVersion: claim.version,
            resolvedAt: null,
            id: { not: incident.id },
          },
          orderBy: { startedAt: "asc" },
        })
      : null;
    const state =
      ready && !other
        ? "verified"
        : legacyFailure === "provider_billing"
          ? "payment_required"
          : existing.accountState;
    const authIncident = await tx.providerAccountIncident.findFirst({
      where: {
        connectionId: current.id,
        credentialVersion: claim.version,
        reason: "provider_auth",
        resolvedAt: null,
      },
      select: { id: true },
    });
    const probeAuth = result.fact.kind === "failure" && result.fact.code === "provider_auth";
    const authPaused =
      Boolean(authIncident) ||
      (!ready && (probeAuth || existing.lastProbeOutcome === "provider_auth"));
    const lastProbeOutcome = ready
      ? "ready"
      : probeAuth || existing.lastProbeOutcome === "provider_auth"
        ? "provider_auth"
        : result.fact.kind === "failure"
          ? result.fact.code
          : (legacyFailure ?? "not_verified");
    const retryMs = result.fact.kind === "failure" ? result.fact.retryAfterMs : undefined;
    const maximumDate = 8_640_000_000_000_000;
    const cooldownMs = Math.max(
      existing.providerCooldownUntil?.getTime() ?? 0,
      result.retryAt?.getTime() ?? 0,
      retryMs ? Math.min(maximumDate, now.getTime() + retryMs) : 0,
    );
    const cooldown = cooldownMs > now.getTime() ? new Date(cooldownMs) : null;
    const next =
      !authPaused && ready && other && autoCheckEligible(claim.adapter, other.reason)
        ? nextAccountCheck({
            startedAt: other.startedAt,
            now: other.startedAt,
            attempt: 0,
            retryAt: cooldown,
          })
        : !authPaused &&
            !ready &&
            matches &&
            (incident.reason !== "legacy_unverified" || legacyFailure !== null) &&
            autoCheckEligible(claim.adapter, legacyFailure ?? incident.reason)
          ? nextAccountCheck({
              startedAt: incident.startedAt,
              now,
              attempt: existing.cadenceAttempt + (input.automatic ? 1 : 0),
              retryAt: cooldown,
            })
          : null;
    const scheduled =
      !ready && next && existing.nextCheckAt && existing.nextCheckAt > next
        ? existing.nextCheckAt
        : next;
    await tx.providerConnectionRecovery.update({
      where: { connectionId: current.id },
      data: {
        accountState: state,
        lastProbeOutcome,
        providerCooldownUntil: cooldown,
        checkedAt: now,
        ...(result.timedOut ? {} : { probeId: null, leaseOwner: null, leaseExpiresAt: null }),
        currentIncidentId: ready ? (other?.id ?? null) : existing.currentIncidentId,
        nextCheckAt: scheduled,
        cadenceAttempt:
          ready && other ? 0 : input.automatic ? { increment: 1 } : existing.cadenceAttempt,
        version: { increment: 1 },
      },
    });
    await writeAudit(
      {
        action: "provider.recovery_account_checked",
        actorId: input.actorId,
        projectId: input.projectId,
        targetId: current.publicId,
        targetType: "provider_connection",
        after: {
          accountState: state,
          freeAccountCheck: claim.adapter.probe.cost === "non_billable",
          paidReplay: false,
        },
      },
      tx,
    );
    return ready ? ("verified" as const) : ("unknown" as const);
  });
}
