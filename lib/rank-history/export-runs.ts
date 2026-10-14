import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import {
  type HistoryRunRecord,
  historyRunItemRecord,
  historyRunRecord,
  type RetainedExportRun,
  type RetainedExportRunItem,
  retainedRunItemSelect,
  retainedRunSelect,
} from "./export-run-records";

type HistoryRunReadPort = {
  rankCheckRun: {
    count(input: { where: Prisma.RankCheckRunWhereInput }): Promise<number>;
    findMany(input: {
      where: Prisma.RankCheckRunWhereInput;
      select: typeof retainedRunSelect;
      orderBy: Prisma.RankCheckRunOrderByWithRelationInput[];
      take: number;
      cursor?: Prisma.RankCheckRunWhereUniqueInput;
      skip?: number;
    }): Promise<RetainedExportRun[]>;
  };
  rankCheckRunItem: {
    count(input: { where: Prisma.RankCheckRunItemWhereInput }): Promise<number>;
    findMany(input: {
      where: Prisma.RankCheckRunItemWhereInput;
      select: typeof retainedRunItemSelect;
      orderBy: Prisma.RankCheckRunItemOrderByWithRelationInput[];
      take: number;
      cursor?: Prisma.RankCheckRunItemWhereUniqueInput;
      skip?: number;
    }): Promise<RetainedExportRunItem[]>;
  };
};

async function readBatches<T>(
  count: number,
  read: (cursor?: string) => Promise<T[]>,
  key: (row: T) => string,
) {
  const rows: T[] = [];
  let cursor: string | undefined;
  while (rows.length < count) {
    const batch = await read(cursor);
    if (!batch.length || batch.length > 500 || rows.length + batch.length > count)
      throw new RankReportSnapshotConflictError();
    rows.push(...batch);
    cursor = key(batch[batch.length - 1]);
  }
  return rows;
}

/** Retained item FKs prove membership. A mutable current schedule/filter never proves an old cohort. */
export async function loadHistoryExportRuns(
  tx: HistoryRunReadPort,
  input: {
    projectId: string;
    keywordIds: readonly string[];
    asOf: Date;
    fullProject: boolean;
    capacity: number;
  },
) {
  const runWhere = { projectId: input.projectId, deletedAt: null, createdAt: { lte: input.asOf } };
  const itemWhere = {
    rankCheckId: null,
    createdAt: { lte: input.asOf },
    run: runWhere,
    keyword: { projectId: input.projectId },
  };
  const unobservedRunWhere = { ...runWhere, rankChecks: { none: {} } };
  const [itemCount, runCount] = await Promise.all([
    tx.rankCheckRunItem.count({ where: itemWhere }),
    tx.rankCheckRun.count({ where: unobservedRunWhere }),
  ]);
  if (itemCount + runCount > input.capacity) throw new RankReportCapacityError();
  const [items, runs] = await Promise.all([
    readBatches(
      itemCount,
      (cursor) =>
        tx.rankCheckRunItem.findMany({
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: 500,
          where: itemWhere,
          select: retainedRunItemSelect,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      (row) => row.id,
    ),
    readBatches(
      runCount,
      (cursor) =>
        tx.rankCheckRun.findMany({
          ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
          take: 500,
          where: unobservedRunWhere,
          select: retainedRunSelect,
          orderBy: [{ createdAt: "asc" }, { publicId: "asc" }],
        }),
      (row) => row.publicId,
    ),
  ]);
  if (
    items.length !== itemCount ||
    runs.length !== runCount ||
    items.some((row) => row.updatedAt > input.asOf || row.run.updatedAt > input.asOf) ||
    runs.some((row) => row.updatedAt > input.asOf)
  )
    throw new RankReportSnapshotConflictError();
  const selected = new Set(input.keywordIds);
  const records: HistoryRunRecord[] = items
    .filter((item) => selected.has(item.keywordId))
    .map(historyRunItemRecord);
  let unresolvedMembershipCount = 0;
  const byRun = new Map<string, RetainedExportRunItem[]>();
  for (const item of items) byRun.set(item.runId, [...(byRun.get(item.runId) ?? []), item]);
  for (const run of runs) {
    const cohort = byRun.get(run.id) ?? [];
    if (cohort.length !== run._count.items) throw new RankReportSnapshotConflictError();
    if (
      input.fullProject ||
      (cohort.length > 0 && cohort.every((item) => selected.has(item.keywordId)))
    )
      records.push(historyRunRecord(run, cohort.length ? "persisted_run_items" : "project_only"));
    else if (cohort.length === 0) unresolvedMembershipCount += 1;
  }
  return { records, unresolvedMembershipCount, source: { items, runs } };
}
