import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deliverIncident } from "./delivery";
import {
  aggregateIncident,
  type IncidentCounts,
  type IncidentDimensions,
  operationResolved,
} from "./dimensions";
import { frozenIncidentOperations } from "./frozen";

/** All dimension writers refresh in their transaction. The incident row serializes versions. */
export async function refreshOperationIncident(
  tx: Prisma.TransactionClient,
  operationPk: string,
  linked = false,
  initial = false,
) {
  if (!recoverySwitches().incidentBell) return;
  const link = await tx.providerIncidentOperation.findUnique({ where: { operationPk } });
  if (!link) return;
  const identity = await tx.providerIncident.findUniqueOrThrow({
    where: { id: link.incidentId },
    select: { projectId: true },
  });
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${identity.projectId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM provider_incidents WHERE id=${link.incidentId} FOR UPDATE`;
  const incident = await tx.providerIncident.findUniqueOrThrow({
    where: { id: link.incidentId },
    include: { project: { select: { writeMode: true } } },
  });
  if (incident.retiredAt || incident.project.writeMode === "migrated") return;
  const links = await tx.providerIncidentOperation.findMany({
    where: { incidentId: incident.id },
    include: { operation: { select: { input: true } } },
  });
  const evidence = await tx.providerOperationEvidence.findMany({
    where: { operationPk: { in: links.map((row) => row.operationPk) } },
  });
  // A deleted/unclassified evidence row is unresolved, never silently omitted.
  const frozen = await frozenIncidentOperations(tx, links);
  const operations: IncidentDimensions[] = [];
  for (const row of links) {
    const current = evidence.find((item) => item.operationPk === row.operationPk);
    const dimensions: IncidentDimensions =
      frozen.has(row.operationPk) && row.customerEvidence
        ? (row.customerEvidence as IncidentDimensions)
        : {
            acceptance: current?.acceptance ?? null,
            fulfillment: current?.fulfillment ?? null,
            accounting: current?.accounting ?? null,
            exhaustionStatus: current?.exhaustionStatus ?? null,
            exhaustionReason: current?.exhaustionReason ?? null,
          };
    operations.push(dimensions);
    const previous = row.customerEvidence as IncidentDimensions | null;
    if (
      !frozen.has(row.operationPk) &&
      Object.entries(dimensions).some(
        ([key, value]) => previous?.[key as keyof IncidentDimensions] !== value,
      )
    )
      await tx.providerIncidentOperation.update({
        where: { operationPk: row.operationPk },
        data: { customerEvidence: dimensions },
      });
  }
  const { counts, resolved } = aggregateIncident(operations);
  const state = resolved ? "resolved" : "open";
  const changed = Object.entries(counts).some(
    ([key, value]) => incident[key as keyof IncidentCounts] !== value,
  );
  if (!linked && !changed && state === incident.state) return;
  const kind =
    state !== incident.state
      ? resolved
        ? "resolved"
        : "reopened"
      : linked
        ? "linked"
        : "count_change";
  const linkedDimensions = operations[links.findIndex((row) => row.operationPk === operationPk)];
  const added = linked && !!linkedDimensions && !operationResolved(linkedDimensions);
  const current = await tx.providerIncident.update({
    where: { id: incident.id },
    data: {
      ...counts,
      state,
      openSlot: resolved ? null : "open",
      resolvedAt: resolved ? (incident.resolvedAt ?? new Date()) : null,
      version: initial ? 1 : { increment: 1 },
    },
  });
  await tx.providerIncidentTransition.create({
    data: {
      incidentId: current.id,
      version: current.version,
      kind,
      counts: { ...counts, state, addedUnresolvedOperation: added },
    },
  });
  await deliverIncident(tx, current, added);
}
