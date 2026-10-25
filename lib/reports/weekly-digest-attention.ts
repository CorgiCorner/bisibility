import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { incidentCopyRenderer } from "@/lib/notifications/incident-copy";
import { emptyIncidentCounts } from "@/lib/provider-evidence/incidents/dimensions";
import { frozenIncidentOperations } from "@/lib/provider-evidence/incidents/frozen";
import { providerRecoveryScope } from "@/lib/provider-evidence/recovery/scope";
import { appPath } from "@/lib/routing/app-path";
import { absoluteUrl, resolveCanonicalOrigin } from "@/lib/seo/origin";
import { digestOperationCounts, type DigestOperationDimensions } from "./weekly-digest-projection";

export type DigestAttention = {
  body: string;
  change: "New" | "Changed" | "Resolved" | "Reopened";
  url: string;
};

function transitionCounts(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid incident snapshot.");
  const counts = emptyIncidentCounts();
  for (const key of Object.keys(counts) as Array<keyof typeof counts>) {
    const count = value[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid incident count.");
    counts[key] = count;
  }
  return { ...counts, state: value.state === "resolved" ? "resolved" : "open" };
}

export async function collectDigestAttention(
  tx: Prisma.TransactionClient,
  project: { id: string; publicId: string },
  periodStart: Date,
  periodEnd: Date,
): Promise<DigestAttention[]> {
  const watermark = await tx.providerIncidentDeliveryWatermark.findUnique({
    where: { projectId: project.id },
  });
  const from =
    watermark?.deliveredThrough && watermark.deliveredThrough > periodStart
      ? watermark.deliveredThrough
      : periodStart;
  const incidents = await tx.providerIncident.findMany({
    where: {
      projectId: project.id,
      retiredAt: null,
      project: { writeMode: { not: "migrated" } },
      transitions: { some: { createdAt: { gte: from, lt: periodEnd } } },
    },
    orderBy: { id: "asc" },
    include: {
      transitions: {
        where: { createdAt: { lt: periodEnd } },
        orderBy: [{ createdAt: "desc" }, { version: "desc" }],
        take: 1,
      },
      operations: { include: { operation: { select: { input: true } } } },
    },
  });
  if (!incidents.length) return [];
  const render = await incidentCopyRenderer("en");
  const attention: DigestAttention[] = [];
  for (const incident of incidents) {
    const latest = incident.transitions[0];
    if (!latest) continue;
    const frozen = await frozenIncidentOperations(tx, incident.operations);
    const evidence = await tx.providerOperationEvidence.findMany({
      where: { operationPk: { in: incident.operations.map((link) => link.operationPk) } },
    });
    const dimensions = incident.operations.map((link): DigestOperationDimensions => {
      const current = evidence.find((row) => row.operationPk === link.operationPk);
      if (frozen.has(link.operationPk) && link.customerEvidence)
        return {
          ...(link.customerEvidence as DigestOperationDimensions),
          recoveryState: current?.recoveryState ?? null,
        };
      return {
        acceptance: current?.acceptance ?? null,
        fulfillment: current?.fulfillment ?? null,
        accounting: current?.accounting ?? null,
        exhaustionStatus: current?.exhaustionStatus ?? null,
        exhaustionReason: current?.exhaustionReason ?? null,
        recoveryState: current?.recoveryState ?? null,
      };
    });
    const counts = {
      ...transitionCounts(latest.counts),
      costConflictCount: digestOperationCounts(dimensions).costConflictCount,
    };
    attention.push({
      body: render(counts).body,
      change:
        latest.kind === "resolved"
          ? "Resolved"
          : latest.kind === "reopened"
            ? "Reopened"
            : latest.version === 1
              ? "New"
              : "Changed",
      url: absoluteUrl(resolveCanonicalOrigin(), appPath(project.publicId, "runs")),
    });
  }
  return attention;
}

export async function incidentLinkedDigestChecks(tx: Prisma.TransactionClient, checkIds: string[]) {
  if (!checkIds.length) return new Set<string>();
  const checks = await tx.rankCheck.findMany({
    where: { publicId: { in: checkIds } },
    select: { id: true, publicId: true },
  });
  const candidates = await tx.providerRecoveryCandidate.findMany({
    where: {
      ...providerRecoveryScope(),
      rankCheckId: { in: checks.map((row) => row.id) },
      accountingOnly: false,
      intent: { accountingOnly: false },
    },
    select: { rankCheckId: true, operationPk: true },
  });
  const links = await tx.providerIncidentOperation.findMany({
    where: { operationPk: { in: candidates.map((row) => row.operationPk) } },
    select: { operationPk: true },
  });
  const linkedIds = new Set(
    candidates
      .filter((row) => links.some((link) => link.operationPk === row.operationPk))
      .map((row) => row.rankCheckId),
  );
  return new Set(checks.filter((row) => linkedIds.has(row.id)).map((row) => row.publicId));
}
