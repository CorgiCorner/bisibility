import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { persistLocalPointRevision } from "@/lib/local-monitoring-store/point-repository";
import type { MonitorDefinition, MonitorMutationReceipt } from "./model";
import { LocalMonitorConflictError } from "./model";

export async function lockedMonitor(
  tx: LocalTransaction,
  projectId: string,
  publicId: string,
  expectedVersion: number,
) {
  const row = await tx.localMonitor.findFirst({ where: { projectId, publicId } });
  if (!row) throw new LocalMeasurementUnavailableError();
  await tx.$queryRaw`SELECT id FROM local_monitors WHERE id=${row.id} AND "projectId"=${projectId} FOR UPDATE`;
  const current = await tx.localMonitor.findFirst({ where: { id: row.id, projectId } });
  if (!current || current.version !== expectedVersion || current.state !== "active")
    throw new LocalMonitorConflictError();
  return current;
}

export async function persistDefinition(
  tx: LocalTransaction,
  input: {
    id: string;
    projectId: string;
    monitorId: string;
    previousId: string | null;
    revision: number;
    actorId: string;
    definition: MonitorDefinition;
    now: Date;
  },
) {
  const { definition } = input;
  await tx.localMonitorRevision.create({
    data: {
      id: input.id,
      projectId: input.projectId,
      monitorId: input.monitorId,
      previousRevisionId: input.previousId,
      revision: input.revision,
      entityId: definition.entityId,
      identityRevisionId: definition.identityRevisionId,
      gridRevisionKey: definition.grid.revisionKey,
      contentHash: localDigest(definition),
      snapshot: definition as unknown as Prisma.InputJsonValue,
      actorId: input.actorId,
      createdAt: input.now,
    },
  });
  for (const point of definition.grid.points) {
    const stored = await persistLocalPointRevision(tx, input.projectId, input.actorId, point.point);
    await tx.localMonitorGridPoint.create({
      data: {
        projectId: input.projectId,
        revisionId: input.id,
        pointId: stored.id,
        ordinal: point.ordinal,
        row: point.row,
        column: point.column,
      },
    });
  }
  await tx.localMonitorKeyword.createMany({
    data: definition.keywords.map((keyword, ordinal) => ({
      projectId: input.projectId,
      revisionId: input.id,
      keywordId: keyword.id,
      keywordPublicId: keyword.publicId,
      ordinal,
      sourceHash: keyword.sourceHash,
    })),
  });
}

export function receipt(row: {
  publicId: string;
  version: number;
  currentRevisionId: string | null;
  currentScheduleIntentId: string | null;
  state: string;
}): MonitorMutationReceipt {
  if (
    !row.currentRevisionId ||
    !row.currentScheduleIntentId ||
    !["active", "archived"].includes(row.state)
  )
    throw new LocalMonitorConflictError();
  return {
    monitorId: row.publicId,
    version: row.version,
    revisionId: row.currentRevisionId,
    scheduleIntentId: row.currentScheduleIntentId,
    state: row.state as "active" | "archived",
  };
}

export async function initialManualIntent(
  tx: LocalTransaction,
  input: {
    projectId: string;
    monitorId: string;
    definitionRevisionId: string;
    actorId: string;
    now: Date;
  },
) {
  const id = randomUUID();
  const { now, ...fields } = input;
  await tx.localMonitorScheduleIntent.create({
    data: {
      ...fields,
      id,
      revision: 1,
      mode: "manual",
      scheduleId: null,
      previousRevisionId: null,
      snapshot: Prisma.DbNull,
      approvalDigest: null,
      capabilityVersion: null,
      createdAt: now,
    },
  });
  return id;
}
