import { prisma } from "@/lib/db/prisma";
import { ACTIVE_RUN_STATUSES } from "./contract";

const OVERLAP_LIMIT = 5;
const PLANNED_HORIZON_MS = 24 * 60 * 60_000;
const PENDING_ITEM_STATUSES = ["queued", "running"];
// Nothing is sent for these yet, so the existing cancel and skip commands stop them outright.
const CANCELLABLE_STATUSES = new Set(["blocked", "planned", "queued"]);

export type RankCheckRunOverlapStatus = "blocked" | "cancelling" | "planned" | "queued" | "running";

export type RankCheckRunOverlap = {
  /** When the run is planned for, or when it was launched or created. */
  at: string;
  canCancel: boolean;
  keywordCount: number;
  runId: string;
  status: RankCheckRunOverlapStatus;
};

export type RankCheckRunOverlaps = { runs: RankCheckRunOverlap[]; total: number };

type OverlapRow = {
  createdAt: Date;
  launchedAt: Date | null;
  plannedFor: Date | null;
  publicId: string;
  status: string;
};

function overlap(row: OverlapRow, keywordCount: number): RankCheckRunOverlap {
  const at = row.status === "planned" ? row.plannedFor : row.launchedAt;
  return {
    at: (at ?? row.createdAt).toISOString(),
    canCancel: CANCELLABLE_STATUSES.has(row.status),
    keywordCount,
    runId: row.publicId,
    status: row.status as RankCheckRunOverlapStatus,
  };
}

/**
 * Other runs that will also check some of these keywords: active runs holding a pending item for
 * one, and scheduled occurrences (blocked, or planned within a day) whose schedule includes one.
 * A scheduled occurrence has no items until the planner launches it, and the planner resolves its
 * scope from the schedule's members, so the same membership decides the overlap here.
 */
export async function findRankCheckRunOverlaps(
  projectId: string,
  keywordIds: readonly string[],
  now: Date,
): Promise<RankCheckRunOverlaps> {
  if (keywordIds.length === 0) return { runs: [], total: 0 };
  const ids = [...keywordIds];
  const pendingItems = { keywordId: { in: ids }, status: { in: PENDING_ITEM_STATUSES } };
  const activeWhere = {
    items: { some: pendingItems },
    projectId,
    status: { in: [...ACTIVE_RUN_STATUSES] },
  };
  const scheduledWhere = {
    checkSchedule: { archivedAt: null, enabled: true, keywords: { some: { id: { in: ids } } } },
    OR: [
      { status: "blocked" },
      { plannedFor: { lte: new Date(now.getTime() + PLANNED_HORIZON_MS) }, status: "planned" },
    ],
    projectId,
  };
  const runSelect = {
    createdAt: true,
    launchedAt: true,
    plannedFor: true,
    publicId: true,
    status: true,
  } as const;
  const [active, scheduled, activeCount, scheduledCount] = await Promise.all([
    prisma.rankCheckRun.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { ...runSelect, _count: { select: { items: { where: pendingItems } } } },
      take: OVERLAP_LIMIT,
      where: activeWhere,
    }),
    prisma.rankCheckRun.findMany({
      orderBy: [{ plannedFor: "asc" }, { id: "asc" }],
      select: {
        ...runSelect,
        checkSchedule: {
          select: { _count: { select: { keywords: { where: { id: { in: ids } } } } } },
        },
      },
      take: OVERLAP_LIMIT,
      where: scheduledWhere,
    }),
    prisma.rankCheckRun.count({ where: activeWhere }),
    prisma.rankCheckRun.count({ where: scheduledWhere }),
  ]);
  // Active runs are checking now, so they come before anything still waiting for its slot.
  const runs = [
    ...active.map((row) => overlap(row, row._count.items)),
    ...scheduled.map((row) => overlap(row, row.checkSchedule?._count.keywords ?? 0)),
  ].filter(({ keywordCount }) => keywordCount > 0);
  return { runs: runs.slice(0, OVERLAP_LIMIT), total: activeCount + scheduledCount };
}
