import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "@/lib/rank-check/queued-source-schema";
import { appPath } from "@/lib/routing/app-path";
import {
  incidentAgeMinutes,
  incidentOpenTime,
  type PartialEvidenceView,
  type RecoveryEvidenceView,
} from "./evidence-model";
import type { RecoveryRecord } from "./records";
import { recoveryInstance } from "./tokens";

export async function readRecoveryEvidence(
  tx: Prisma.TransactionClient,
  namespace: string,
  records: readonly RecoveryRecord[],
  now: Date,
) {
  const identities = await tx.providerDispatchIdentity.findMany({
    where: {
      namespace,
      OR: [
        {
          rankCheckId: { in: records.flatMap((row) => (row.rankCheckId ? [row.rankCheckId] : [])) },
        },
        {
          operation: {
            operation_id: {
              in: records.filter((row) => row.kind === "operation").map((row) => row.id),
            },
          },
        },
      ],
    },
    select: {
      projectId: true,
      rankCheckId: true,
      operation: {
        select: {
          operation_id: true,
          providerIncidentOperations: {
            select: {
              incident: {
                include: {
                  project: { select: { publicId: true } },
                  transitions: {
                    where: { OR: [{ kind: "reopened" }, { kind: "linked", version: 1 }] },
                    orderBy: { createdAt: "desc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const projectIds = [
    ...new Set([
      ...records.flatMap((row) => (row.projectId ? [row.projectId] : [])),
      ...identities.map((identity) => identity.projectId),
    ]),
  ];
  const projections = new Map<string, EvidenceProjection | null>();
  for (const projectId of projectIds) {
    const ids = [
      ...new Set([
        ...records
          .filter((row) => row.projectId === projectId)
          .flatMap((row) => (row.rankCheckId ? [row.rankCheckId] : [])),
        ...identities
          .filter((identity) => identity.projectId === projectId)
          .map((identity) => identity.rankCheckId),
      ]),
    ];
    const values = await readCheckEvidence(projectId, { checkIds: ids }, tx);
    const checks = await tx.rankCheck.findMany({
      where: { id: { in: ids }, keyword: { projectId } },
      select: { id: true, publicId: true },
    });
    for (const check of checks) projections.set(check.id, values.get(check.publicId) ?? null);
  }
  const byRecord = new Map<string, RecoveryEvidenceView>();
  for (const row of records) {
    const identity = identities.find((identity) =>
      row.kind === "operation"
        ? identity.operation.operation_id === row.id
        : identity.rankCheckId === row.rankCheckId,
    );
    const incident = identity?.operation.providerIncidentOperations[0]?.incident;
    const openedAt = incident ? incidentOpenTime(incident) : null;
    const projection = projections.get(row.rankCheckId ?? identity?.rankCheckId ?? "") ?? null;
    byRecord.set(row.key, {
      closedUnknown: row.closedUnknown,
      projection,
      incident:
        incident && openedAt
          ? {
              href: `${appPath(incident.project.publicId, "runs")}?view=checks&incidentId=${encodeURIComponent(incident.id)}`,
              openedAt: openedAt.toISOString(),
              ageMinutes: incidentAgeMinutes(openedAt, now),
            }
          : null,
    });
  }
  return byRecord;
}

export async function readPartialEvidence(
  tx: Prisma.TransactionClient,
  namespace: string,
): Promise<PartialEvidenceView[]> {
  const rows = await tx.providerPartialEvidence.findMany({
    where: {
      namespace,
      instanceId: recoveryInstance(),
      schemaVersion: { not: QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      kind: true,
      returnedDepth: true,
      createdAt: true,
      rankCheck: {
        select: {
          publicId: true,
          keyword: { select: { publicId: true, project: { select: { publicId: true } } } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    returnedDepth: row.returnedDepth,
    createdAt: row.createdAt.toISOString(),
    project: row.rankCheck.keyword.project.publicId,
    checkHref: appPath(
      row.rankCheck.keyword.project.publicId,
      "rank-tracker",
      row.rankCheck.keyword.publicId,
    ),
  }));
}
