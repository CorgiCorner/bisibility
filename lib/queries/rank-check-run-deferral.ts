import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { type DeferralReasonCode, deferralReasonCode } from "@/lib/rank-check/deferral-reason";

export async function sharedRankCheckRunDeferralCode(
  projectId: string,
  runPublicId: string,
): Promise<DeferralReasonCode | null> {
  const run = await prisma.rankCheckRun.findFirst({
    select: { id: true },
    where: { deletedAt: null, projectId, publicId: runPublicId },
  });
  if (!run) return null;
  const rows = await prisma.rankCheck.findMany({
    distinct: ["deferredReason"],
    select: { deferredReason: true },
    where: { runId: run.id, status: "deferred" },
  });
  const codes = new Set(rows.map((row) => deferralReasonCode(row.deferredReason)));
  if (codes.size !== 1) return null;
  return [...codes][0] ?? null;
}

export async function hasAccountDeferredRankCheck(projectId: string, runPublicId: string) {
  return Boolean(
    await prisma.rankCheck.findFirst({
      where: {
        run: { projectId, publicId: runPublicId, deletedAt: null },
        status: "deferred",
        deferredReason: "provider_account_blocked",
      },
      select: { id: true },
    }),
  );
}

export async function rankCheckConnectionNotice(projectId: string, runPublicId: string) {
  const rows = await prisma.$queryRaw<
    {
      provider: string;
      connectionId: string;
      credentialsEncrypted: string | null;
      credentialVersion: string;
      resolvedAt: Date | null;
    }[]
  >`
    SELECT c.provider, c.id AS "connectionId", c."credentialsEncrypted",
      recovery."credentialVersion", i."resolvedAt"
    FROM rank_checks r
    JOIN rank_check_runs run ON run.id = r."runId"
    JOIN provider_blocked_attempts b ON b."rankCheckId" = r.id
    JOIN provider_account_incidents i ON i.id = b."incidentId"
      AND i."credentialVersion" = b."credentialVersion"
    JOIN provider_connections c ON c.id = b."connectionId"
    JOIN provider_connection_recovery recovery ON recovery."connectionId" = c.id
      AND recovery."credentialVersion" = i."credentialVersion"
    WHERE run."projectId" = ${projectId} AND run."publicId" = ${runPublicId}
      AND run."deletedAt" IS NULL AND r.status = 'deferred'
      AND r."deferredReason" = 'provider_account_blocked' AND b.reason = 'account_blocked'
      AND c."projectId" = ${projectId} AND c.enabled = true AND c."credentialSource" = 'own'
      AND (((i.reason = 'legacy_unverified'
              OR (i.reason = 'provider_transient' AND i."evidenceSource" = 'legacy_probe'))
            AND i."resolvedAt" IS NULL AND recovery."currentIncidentId" = i.id)
        OR ((i.reason = 'legacy_unverified' OR i."evidenceSource" = 'legacy_probe')
            AND i."resolvedAt" IS NOT NULL AND recovery."accountState" = 'verified'
            AND recovery."currentIncidentId" IS NULL AND c.status = 'connected'
            AND NOT EXISTS (SELECT 1 FROM provider_account_incidents open_incident
              WHERE open_incident."connectionId" = c.id
                AND open_incident."credentialVersion" = recovery."credentialVersion"
                AND open_incident."resolvedAt" IS NULL
                AND (open_incident.scope->>'kind' = 'account'
                  OR open_incident.scope->>'capability' = 'rank_check'))))
    ORDER BY (i."resolvedAt" IS NOT NULL), b."createdAt", b.id LIMIT 50`;
  const row = currentConnection(rows);
  if (!row) return null;
  return {
    provider: providerLabel(row.provider),
    state: row.resolvedAt ? ("verified" as const) : ("unverified" as const),
  };
}

type ConnectionRow = {
  provider: string;
  connectionId: string;
  credentialsEncrypted: string | null;
  credentialVersion: string;
};

function currentConnection<T extends ConnectionRow>(rows: T[]) {
  return rows.find(
    (candidate) =>
      ownCredentialVersion(
        candidate.provider,
        candidate.connectionId,
        candidate.credentialsEncrypted,
      ) === candidate.credentialVersion,
  );
}

function providerLabel(provider: string) {
  return PROVIDER_CATALOG.find((entry) => entry.id === provider)?.label ?? provider;
}

/** The project's own connection whose unverified legacy state still defers rank checks. */
export async function projectConnectionNotice(projectId: string) {
  const rows = await prisma.$queryRaw<ConnectionRow[]>`
    SELECT DISTINCT c.provider, c.id AS "connectionId", c."credentialsEncrypted",
      recovery."credentialVersion"
    FROM provider_connections c
    JOIN provider_connection_recovery recovery ON recovery."connectionId" = c.id
    JOIN provider_account_incidents i ON i.id = recovery."currentIncidentId"
      AND i."credentialVersion" = recovery."credentialVersion"
    WHERE c."projectId" = ${projectId} AND c.enabled = true AND c."credentialSource" = 'own'
      AND i."resolvedAt" IS NULL
      AND (i.reason = 'legacy_unverified'
        OR (i.reason = 'provider_transient' AND i."evidenceSource" = 'legacy_probe'))
      AND EXISTS (SELECT 1 FROM provider_blocked_attempts b
        JOIN rank_checks r ON r.id = b."rankCheckId"
        JOIN keywords k ON k.id = r."keywordId"
        WHERE b."incidentId" = i.id AND b."credentialVersion" = i."credentialVersion"
          AND b.reason = 'account_blocked' AND k."projectId" = ${projectId}
          AND r.status = 'deferred' AND r."deferredReason" = 'provider_account_blocked')
    ORDER BY c.id LIMIT 50`;
  const row = currentConnection(rows);
  return row ? { provider: providerLabel(row.provider) } : null;
}
