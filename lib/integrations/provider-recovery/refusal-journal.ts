import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  type ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";

export async function recordRankRefusals(
  db: PrismaClient,
  input: {
    connectionId: string;
    credentialVersion: string | null;
    checks: readonly { rankCheckId: string; runItemId?: string | null }[];
    refusal: ProviderRecoveryAdmissionError;
  },
) {
  if (!input.credentialVersion || !input.checks.length)
    throw new ProviderUsagePersistenceError({ phase: "admission" });
  if (
    input.refusal.reason === "account_blocked" &&
    !input.refusal.incidentId &&
    input.refusal.legacyVersion === null
  )
    throw new ProviderUsagePersistenceError({ phase: "admission" });
  const version = input.credentialVersion;
  const legacyId = `legacy_${createHash("sha256")
    .update(JSON.stringify([input.connectionId, version, input.refusal.legacyVersion]))
    .digest("hex")}`;
  const incidentId =
    input.refusal.reason === "account_blocked" ? (input.refusal.incidentId ?? legacyId) : null;
  const refusalKey = incidentId ?? `accounting:${version}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const items = await tx.rankCheckRunItem.findMany({
          where: { rankCheckId: { in: input.checks.map((check) => check.rankCheckId) } },
          select: { id: true, rankCheckId: true },
        });
        if (
          items.some(
            (item, index) =>
              items.findIndex((candidate) => candidate.rankCheckId === item.rankCheckId) !== index,
          )
        )
          throw new Error("Rank refusal run item is ambiguous");
        if (incidentId === legacyId) {
          await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${input.connectionId} FOR UPDATE`;
          const recovery = await tx.providerConnectionRecovery.findUnique({
            where: { connectionId: input.connectionId },
            include: { currentIncident: true },
          });
          const stillCurrent =
            recovery?.credentialVersion === version &&
            recovery.version === input.refusal.legacyVersion &&
            (!recovery.currentIncident ||
              recovery.currentIncident.resolvedAt !== null ||
              recovery.currentIncident.credentialVersion !== version) &&
            recovery.accountState !== "verified";
          if (
            !stillCurrent &&
            !(await tx.providerAccountIncident.findUnique({ where: { id: legacyId } }))
          )
            throw new Error("Legacy account state changed before refusal persistence");
          await tx.providerAccountIncident.createMany({
            data: [
              {
                id: legacyId,
                connectionId: input.connectionId,
                credentialVersion: version,
                scope: { kind: "account" },
                reason: "legacy_unverified",
                evidenceSource: "legacy_state",
              },
            ],
            skipDuplicates: true,
          });
          if (stillCurrent)
            await tx.providerConnectionRecovery.updateMany({
              where: {
                connectionId: input.connectionId,
                credentialVersion: version,
                currentIncidentId: recovery?.currentIncidentId ?? null,
                version: input.refusal.legacyVersion ?? undefined,
                accountState: { not: "verified" },
              },
              data: { currentIncidentId: legacyId },
            });
        }
        await tx.providerBlockedAttempt.createMany({
          data: input.checks.map((check) => ({
            rankCheckId: check.rankCheckId,
            runItemId:
              check.runItemId ??
              items.find((item) => item.rankCheckId === check.rankCheckId)?.id ??
              null,
            connectionId: input.connectionId,
            credentialVersion: version,
            incidentId,
            refusalKey,
            reason: input.refusal.reason,
            transportPhase: "not_sent",
          })),
          skipDuplicates: true,
        });
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new ProviderUsagePersistenceError({ cause: lastError, phase: "admission" });
}
