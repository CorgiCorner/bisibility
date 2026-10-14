import type { RetainedExportRun, RetainedExportRunItem } from "./export-run-records";

const createdAt = new Date("2026-10-12T11:30:00Z");
export function retainedRunFixture(overrides: Partial<RetainedExportRun> = {}): RetainedExportRun {
  return {
    id: "run-db",
    publicId: "rcr_abcdefghijklmnopqrstuvwx",
    createdAt,
    updatedAt: createdAt,
    status: "cancelled",
    outcome: null,
    trigger: "manual",
    blockedReason: null,
    selectionKind: "all",
    selectionHash: "a".repeat(64),
    plannedFor: null,
    launchedAt: null,
    startedAt: null,
    finishedAt: null,
    requestedCount: 1,
    totalCount: 1,
    completedCount: 0,
    failedCount: 0,
    deferredCount: 0,
    skippedCount: 0,
    cancelledCount: 1,
    _count: { items: 1 },
    ...overrides,
  };
}
export function retainedRunItemFixture(
  overrides: Partial<RetainedExportRunItem> = {},
): RetainedExportRunItem {
  const run = retainedRunFixture();
  return {
    id: "run-item-db",
    runId: run.id,
    keywordId: "keyword-db",
    createdAt,
    updatedAt: createdAt,
    status: "cancelled",
    blockedReason: null,
    notBefore: null,
    startedAt: null,
    finishedAt: null,
    keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
    run: {
      publicId: run.publicId,
      status: run.status,
      outcome: run.outcome,
      updatedAt: run.updatedAt,
    },
    ...overrides,
  };
}
