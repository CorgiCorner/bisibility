import { loadMonitorSnapshot } from "./snapshot";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { localKeywordSourceHash } from "@/lib/local-monitoring-store/canonical";
import type {
  LocalDatabase,
  LocalStoreContext,
  LocalTransaction,
} from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { localKeywordSelect } from "@/lib/local-monitoring-store/repository";
import { projectRef } from "@/lib/local-monitoring-store/schema";
import { assertMonitorDefinition } from "./definition";
import { LocalMonitorConflictError, type MonitorDefinition } from "./model";
import { monitorReadiness, publicMonitorCalendar, publicMonitorDefinition } from "./projection";
import { loadMonitorCalendar } from "./references";
import { monitorRef, readMonitorSchema } from "./schema";

async function projectMonitor(tx: LocalTransaction, projectId: string, publicId: string) {
  const { monitor, revision, intent, definition } = await loadMonitorSnapshot(
    tx,
    projectId,
    publicId,
  );
  const subject = await tx.businessLocation.findFirst({
    where: { id: definition.entityId, projectId },
    select: { state: true, role: true, currentRevisionId: true },
  });
  const keywords = await tx.keyword.findMany({
    where: {
      projectId,
      id: { in: definition.keywords.map((row) => row.id) },
      archivedAt: null,
    },
    select: localKeywordSelect,
  });
  let currentCalendar = null;
  if (intent.mode === "scheduled" && intent.scheduleId) {
    const schedule = await tx.checkSchedule.findFirst({
      where: { projectId, id: intent.scheduleId },
      select: { publicId: true },
    });
    if (schedule)
      try {
        currentCalendar = await loadMonitorCalendar(tx, projectId, schedule.publicId);
      } catch (error) {
        if (!(error instanceof LocalMonitorConflictError)) throw error;
      }
  }
  const readiness = monitorReadiness({
    state: monitor.state,
    revisionId: revision.id,
    definition,
    sources: {
      subject,
      keywords: keywords
        .filter((row) => row.device === "desktop" || row.device === "mobile")
        .map((row) => ({
          id: row.id,
          measurementTargetEpoch: String(row.measurementTargetEpoch),
          measurementPolicyEpoch: String(row.measurementPolicyEpoch),
          sourceHash: localKeywordSourceHash({
            ...row,
            device: row.device as "desktop" | "mobile",
          }),
        })),
    },
    intent,
    currentCalendar,
  });
  return {
    id: monitor.publicId,
    ...publicMonitorDefinition(definition),
    version: monitor.version,
    state: monitor.state,
    revisionId: revision.id,
    revision: revision.revision,
    schedule: {
      intentId: intent.id,
      revision: intent.revision,
      mode: intent.mode,
      calendar: publicMonitorCalendar(intent.snapshot),
      capabilityVersion: intent.capabilityVersion,
    },
    readiness,
  };
}

/** Fresh membership is rechecked for each read. No target creation, enqueue, preview or provider I/O. */
export async function readLocalMonitor(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const data = readMonitorSchema.parse(command);
  return db.$transaction(
    async (tx) => {
      const scope = await localProjectScope(
        tx,
        context,
        data.projectId,
        "read",
        "local_measurement_target",
      );
      return projectMonitor(tx, scope.project.id, data.monitorId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function listLocalMonitors(
  projectId: string,
  context: LocalStoreContext,
  options: {
    db?: LocalDatabase;
    after?: string;
    includeArchived?: boolean;
  } = {},
) {
  projectRef.parse(projectId);
  if (options.after) monitorRef.parse(options.after);
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await localProjectScope(
        tx,
        context,
        projectId,
        "read",
        "local_measurement_target",
      );
      const rows = await tx.localMonitor.findMany({
        where: {
          projectId: scope.project.id,
          ...(options.includeArchived ? {} : { state: "active" }),
          ...(options.after ? { publicId: { gt: options.after } } : {}),
        },
        select: { publicId: true },
        orderBy: { publicId: "asc" },
        take: 51,
      });
      const items = [];
      for (const row of rows.slice(0, 50))
        items.push(await projectMonitor(tx, scope.project.id, row.publicId));
      return { items, nextCursor: rows.length > 50 ? rows[49].publicId : null };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Bounded retained history. Current mutable settings never rewrite these snapshots. */
export async function readLocalMonitorHistory(
  command: unknown,
  context: LocalStoreContext,
  options: {
    db?: LocalDatabase;
    kind: "definition" | "schedule";
    beforeRevision?: number;
  },
) {
  const data = readMonitorSchema.parse(command);
  if (
    options.beforeRevision !== undefined &&
    (!Number.isSafeInteger(options.beforeRevision) || options.beforeRevision < 1)
  )
    throw new RangeError("Invalid history cursor.");
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await localProjectScope(
        tx,
        context,
        data.projectId,
        "read",
        "local_measurement_target",
      );
      const monitor = await tx.localMonitor.findFirst({
        where: { projectId: scope.project.id, publicId: data.monitorId },
      });
      if (!monitor) throw new LocalMeasurementUnavailableError();
      const where = {
        projectId: scope.project.id,
        monitorId: monitor.id,
        ...(options.beforeRevision === undefined
          ? {}
          : { revision: { lt: options.beforeRevision } }),
      };
      const select = {
        id: true,
        revision: true,
        previousRevisionId: true,
        snapshot: true,
        createdAt: true,
      } as const;
      const rows =
        options.kind === "definition"
          ? await tx.localMonitorRevision.findMany({
              where,
              select,
              orderBy: { revision: "desc" },
              take: 51,
            })
          : await tx.localMonitorScheduleIntent.findMany({
              where,
              select: { ...select, mode: true, definitionRevisionId: true },
              orderBy: { revision: "desc" },
              take: 51,
            });
      const items = rows.slice(0, 50).map((row) => ({
        ...row,
        snapshot:
          options.kind === "definition"
            ? publicMonitorDefinition(
                assertMonitorDefinition(row.snapshot as unknown as MonitorDefinition),
              )
            : publicMonitorCalendar(row.snapshot),
      }));
      return { items, nextCursor: rows.length > 50 ? rows[49].revision : null };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
