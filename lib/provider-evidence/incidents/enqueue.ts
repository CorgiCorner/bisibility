import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import "server-only";
import { randomUUID } from "node:crypto";
import type { OnRecoveryEnqueued } from "@/lib/provider-evidence/recovery/enqueue-contract";
import { incidentCause } from "./cause";
import { refreshOperationIncident } from "./refresh";

export const onRecoveryEnqueued: OnRecoveryEnqueued = async (tx, event) => {
  if (!recoverySwitches().incidentBell) return;
  if (event.accountingOnly) return;
  const candidate = await tx.providerRecoveryCandidate.findUniqueOrThrow({
    where: {
      operationPk_attemptId: { operationPk: event.operationPk, attemptId: event.attemptId },
    },
  });
  const check = await tx.rankCheck.findUnique({
    where: { id: candidate.rankCheckId },
    select: { keyword: { select: { projectId: true } } },
  });
  if (!check) return;
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${check.keyword.projectId} FOR SHARE`;
  const project = await tx.project.findUnique({
    where: { id: check.keyword.projectId },
    select: { writeMode: true, providerIncidentsRetiredThrough: true },
  });
  if (!project || project.writeMode === "migrated") return;
  const operation = await tx.meteringOperation.findUniqueOrThrow({
    where: { operation_pk: event.operationPk },
  });
  if (
    project.providerIncidentsRetiredThrough &&
    operation.created_at <= project.providerIncidentsRetiredThrough
  )
    return;
  // Preserve old associations, even if imported timestamps cannot establish the cutoff.
  const previous = await tx.providerIncidentOperation.findUnique({
    where: { operationPk: event.operationPk },
    select: { incident: { select: { retiredAt: true } } },
  });
  if (previous?.incident.retiredAt) return;
  const input = operation.input;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof input.provider !== "string" ||
    typeof input.operation !== "string"
  )
    return;
  const cause = incidentCause({ provider: input.provider, operation: input.operation });
  // Native conflict handling serializes concurrent first links without a version-zero row.
  const inserted = await tx.providerIncident.createMany({
    data: { id: randomUUID(), projectId: check.keyword.projectId, cause },
    skipDuplicates: true,
  });
  const incident = await tx.providerIncident.findFirstOrThrow({
    where: { projectId: check.keyword.projectId, cause, retiredAt: null },
  });
  await tx.$queryRaw`SELECT id FROM provider_incidents WHERE id=${incident.id} FOR UPDATE`;
  const created = await tx.providerIncidentOperation.createMany({
    data: { incidentId: incident.id, operationPk: event.operationPk },
    skipDuplicates: true,
  });
  if (created.count)
    await refreshOperationIncident(tx, event.operationPk, true, inserted.count === 1);
};
