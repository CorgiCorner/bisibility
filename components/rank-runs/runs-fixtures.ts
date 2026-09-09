import type { RankRunPage, RankRunRecord } from "./runs-types";

const counts = {
  cancelled: 0,
  completed: 24,
  deferred: 0,
  failed: 0,
  requested: 24,
  skipped: 0,
  total: 24,
};

export const historyRun: RankRunRecord = {
  blockedReason: null,
  costCents: 192,
  counts,
  estimatedCostCents: 192,
  finishedAt: "2026-09-03T06:04:00.000Z",
  id: "rcr_abcdefghijklmnopqrstuvwx",
  keywordCount: 24,
  kind: "rank_check",
  launchedAt: "2026-09-03T06:00:00.000Z",
  outcome: "succeeded",
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  requestedBy: { avatarUrl: null, initials: "M", name: "Marta" },
  selectionKind: "all",
  startedAt: "2026-09-03T06:00:00.000Z",
  status: "completed",
  targetCount: 24,
  trigger: "scheduled",
};

export const plannedRun: RankRunRecord = {
  ...historyRun,
  costCents: 0,
  counts: { ...counts, completed: 0 },
  finishedAt: null,
  id: "rcr_planned_0001",
  launchedAt: null,
  outcome: null,
  plannedFor: "2026-09-04T06:00:00.000Z",
  requestedBy: null,
  selectionKind: "scheduled_due",
  startedAt: null,
  status: "planned",
};

export const blockedRun: RankRunRecord = {
  ...plannedRun,
  blockedReason: "Budget reached before this occurrence.",
  id: "rcr_blocked_0001",
  plannedFor: "2026-09-05T06:00:00.000Z",
  status: "blocked",
};

export const historyPage: RankRunPage = { data: [historyRun], nextCursor: "history-cursor" };
export const plannedPage: RankRunPage = { data: [plannedRun, blockedRun], nextCursor: null };
