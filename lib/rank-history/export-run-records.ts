import { encodeUnprefixedCursor } from "@/lib/api/pagination";
import { requirePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";

export const retainedRunSelect = {
  id: true,
  publicId: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  outcome: true,
  trigger: true,
  blockedReason: true,
  selectionKind: true,
  selectionHash: true,
  plannedFor: true,
  launchedAt: true,
  startedAt: true,
  finishedAt: true,
  requestedCount: true,
  totalCount: true,
  completedCount: true,
  failedCount: true,
  deferredCount: true,
  skippedCount: true,
  cancelledCount: true,
  _count: { select: { items: true } },
} satisfies Prisma.RankCheckRunSelect;
export const retainedRunItemSelect = {
  id: true,
  runId: true,
  keywordId: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  blockedReason: true,
  notBefore: true,
  startedAt: true,
  finishedAt: true,
  keyword: { select: { publicId: true } },
  run: { select: { publicId: true, status: true, outcome: true, updatedAt: true } },
} satisfies Prisma.RankCheckRunItemSelect;
export type RetainedExportRun = Prisma.RankCheckRunGetPayload<{ select: typeof retainedRunSelect }>;
export type RetainedExportRunItem = Prisma.RankCheckRunItemGetPayload<{
  select: typeof retainedRunItemSelect;
}>;
const iso = (date: Date | null) => date?.toISOString() ?? null;
const code = (value: string | null) =>
  value && /^[a-z0-9_.:-]{1,128}$/i.test(value) ? value : null;

/** Uses the same opaque item ID as the existing run-items API; no synthetic RankCheck. */
export function historyRunItemRecord(item: RetainedExportRunItem) {
  return {
    kind: "rank_check_run_item" as const,
    id: encodeUnprefixedCursor({ publicId: item.id, timestamp: item.createdAt }),
    runId: requirePublicId(item.run.publicId, "rcr"),
    keywordId: requirePublicId(item.keyword.publicId, "kw"),
    recordedAt: item.createdAt.toISOString(),
    startedAt: iso(item.startedAt),
    finishedAt: iso(item.finishedAt),
    notBefore: iso(item.notBefore),
    status: item.status,
    blockedReason: code(item.blockedReason),
    runStatus: item.run.status,
    runOutcome: item.run.outcome,
    rankCheckState: "not_attached" as const,
    scopeMembership: "persisted_run_item" as const,
  };
}

export function historyRunRecord(
  run: RetainedExportRun,
  membership: "persisted_run_items" | "project_only",
) {
  return {
    kind: "rank_check_run" as const,
    id: requirePublicId(run.publicId, "rcr"),
    runId: requirePublicId(run.publicId, "rcr"),
    recordedAt: run.createdAt.toISOString(),
    plannedFor: iso(run.plannedFor),
    launchedAt: iso(run.launchedAt),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
    status: run.status,
    outcome: run.outcome,
    trigger: run.trigger,
    blockedReason: code(run.blockedReason),
    selectionKind: run.selectionKind,
    scopeMembership: membership,
    counts: {
      requested: run.requestedCount,
      total: run.totalCount,
      completed: run.completedCount,
      failed: run.failedCount,
      deferred: run.deferredCount,
      skipped: run.skippedCount,
      cancelled: run.cancelledCount,
    },
    rankCheckState: "not_attached" as const,
  };
}
export type HistoryRunRecord =
  | ReturnType<typeof historyRunRecord>
  | ReturnType<typeof historyRunItemRecord>;
