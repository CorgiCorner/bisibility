import "server-only";
import { prisma } from "@/lib/db/prisma";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import type { ReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportDigest } from "@/lib/rank-reports/digest";
import { localResultCursorCodec } from "./cursor-host";
import {
  LocalResultCapacityError,
  LocalResultSnapshotConflictError,
  LocalResultUnavailableError,
} from "./errors";
import type { LocalMonitorRunHistory } from "./model";
import {
  localHistoryTimeFilter,
  localHistoryWindow,
  localResultAsOf,
  localRunHistorySchema,
} from "./schema";

const HISTORY_LIMIT = 1000,
  PAGE_SIZE = 20;
/** Only immutable occurrence membership is paged; each page rechecks fresh project ownership. */
export async function readMonitorRunHistory(
  command: unknown,
  context: LocalStoreContext,
  options: { db?: LocalDatabase; codec?: ReportCursorCodec; now?: Date } = {},
): Promise<LocalMonitorRunHistory> {
  const input = localRunHistorySchema.parse(command),
    codec = options.codec ?? localResultCursorCodec(),
    cursor = input.cursor ? codec.decode(input.cursor) : null;
  const asOf = localResultAsOf(cursor?.asOf ?? input.asOf, options.now ?? new Date()),
    window = localHistoryWindow(input, asOf),
    originalBinding = {
      purpose: "local-monitor-run-history-v1",
      projectId: input.projectId,
      monitorId: input.monitorId,
    },
    legacy =
      cursor &&
      input.from === undefined &&
      input.to === undefined &&
      cursor.binding === reportDigest(originalBinding),
    binding = reportDigest(legacy ? originalBinding : { ...originalBinding, window });
  if (cursor && input.asOf !== undefined && input.asOf !== cursor.asOf)
    throw new LocalResultUnavailableError();
  if (cursor && cursor.binding !== binding) throw new LocalResultUnavailableError();
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await localProjectScope(tx, context, input.projectId, "read"),
        monitor = await tx.localMonitor.findFirst({
          where: { projectId: scope.project.id, publicId: input.monitorId },
          select: { id: true },
        });
      if (!monitor) throw new LocalResultUnavailableError();
      const where = {
          projectId: scope.project.id,
          monitorId: monitor.id,
          createdAt: localHistoryTimeFilter(window),
        },
        count = await tx.localMonitorOccurrence.count({ where });
      if (count > HISTORY_LIMIT) throw new LocalResultCapacityError();
      const occurrences = await tx.localMonitorOccurrence.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT,
      });
      if (occurrences.length !== count) throw new LocalResultSnapshotConflictError();
      const source = reportDigest(
        occurrences.map((row) => ({
          id: row.id,
          runId: row.runId,
          bodyHash: row.bodyHash,
          definitionRevisionId: row.definitionRevisionId,
          createdAt: row.createdAt.toISOString(),
        })),
      );
      if (cursor && cursor.source !== source) throw new LocalResultSnapshotConflictError();
      const index = cursor
        ? occurrences.findIndex(
            (row) => row.id === cursor.last.id && row.createdAt.toISOString() === cursor.last.at,
          )
        : -1;
      if (cursor && index < 0) throw new LocalResultUnavailableError();
      const selected = occurrences.slice(index + 1, index + 1 + PAGE_SIZE),
        last = selected.at(-1);
      const [runs, revisions] = await Promise.all([
        tx.localMeasurementRun.findMany({
          where: { projectId: scope.project.id, id: { in: selected.map((row) => row.runId) } },
          select: { id: true, publicId: true },
        }),
        tx.localMonitorRevision.findMany({
          where: {
            projectId: scope.project.id,
            monitorId: monitor.id,
            id: { in: selected.map((row) => row.definitionRevisionId) },
          },
          select: { id: true, revision: true },
        }),
      ]);
      const byRun = new Map(runs.map((row) => [row.id, row])),
        byRevision = new Map(revisions.map((row) => [row.id, row]));
      const items = selected.map((row) => {
        const run = byRun.get(row.runId),
          revision = byRevision.get(row.definitionRevisionId);
        if (!run || !revision) throw new LocalResultUnavailableError();
        return {
          runId: run.publicId,
          createdAt: row.createdAt.toISOString(),
          definitionRevision: revision.revision,
          mode: row.mode,
        };
      });
      const more = index + 1 + selected.length < occurrences.length;
      return {
        version: 1,
        projectId: input.projectId,
        monitorId: input.monitorId,
        asOf: asOf.toISOString(),
        window,
        eligibleTotal: count,
        items,
        nextCursor:
          more && last
            ? codec.encode({
                version: 1,
                asOf: asOf.toISOString(),
                binding,
                source,
                last: { id: last.id, at: last.createdAt.toISOString() },
              })
            : null,
      } satisfies LocalMonitorRunHistory;
    },
    { isolationLevel: "RepeatableRead" },
  );
}
