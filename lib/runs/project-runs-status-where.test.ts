import { RUN_OUTCOMES, RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import type {
  SearchBackfillKind,
  SearchSyncStatusTitle,
} from "@/lib/search-insights/sync/control-types";
import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import { describe, expect, it } from "vitest";
import { PROJECT_RUNS_STATUSES } from "./filters";
import { PROJECT_RUN_GSC_IMPORT_KNOWN_STATES } from "./project-run";
import { matchesProjectRunsStatus } from "./project-runs-page";
import {
  type GscImportRow,
  gscProjectRun,
  type RankRunRow,
  rankProjectRun,
} from "./project-runs-presentation";
import {
  gscRawStatusWhere,
  gscStatusWhere,
  includesUpcomingRuns,
  rankStatusWhere,
  upcomingStatusWhere,
} from "./project-runs-status-where";
import { RUN_STATUS_KEYS } from "./run-status-vocabulary";

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

// Evaluates the Prisma where subset these filters use, with SQL NULL semantics for IN/NOT IN.
function matchesWhere(where: Where, row: Row): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "AND") return (condition as Where[]).every((part) => matchesWhere(part, row));
    if (field === "OR") return (condition as Where[]).some((part) => matchesWhere(part, row));
    const value = row[field];
    if (condition === null || typeof condition !== "object") return value === condition;
    const filter = condition as { in?: unknown[]; not?: unknown; notIn?: unknown[] };
    if (filter.in) return value !== null && filter.in.includes(value);
    if (filter.notIn) return value !== null && !filter.notIn.includes(value);
    return value !== filter.not;
  });
}

const project = { id: "project_1", name: "Example", publicId: "prj_a00000000000000000000000" };
const at = new Date("2026-09-06T12:00:00.000Z");

function rankRow(status: string, outcome: string | null): RankRunRow {
  return {
    blockedReason: null,
    completedCount: 0,
    costCents: 0,
    createdAt: at,
    estimatedCostCents: 0,
    finishedAt: at,
    keywordCount: 1,
    launchedAt: at,
    outcome,
    plannedFor: at,
    publicId: "rcr_a00000000000000000000000",
    startedAt: at,
    status,
    targetCount: 1,
    totalCount: 1,
    trigger: "manual",
  };
}

function gscRow(state: string, pausedReason: string | null): GscImportRow {
  return {
    createdAt: at,
    daysDone: 0,
    daysTotal: 28,
    id: "import_1",
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: null,
    pausedReason,
    projectId: project.id,
    property: "sc-domain:example.com",
    searchType: "web",
    source: "gsc",
    state,
    syncStartedAt: null,
  };
}

const rankRows = RUN_STATUSES.flatMap((status) =>
  [null, ...RUN_OUTCOMES].map((outcome) => rankRow(status, outcome)),
);
const gscRows = [...PROJECT_RUN_GSC_IMPORT_KNOWN_STATES, "archived"].flatMap((state) =>
  [null, "error", "needs_reauth", "rate_limited", "user", "other"].map((reason) =>
    gscRow(state, reason),
  ),
);

const SNAPSHOT_TITLES = {
  complete: "Completed",
  needs_reauth: "Reconnect required",
  needs_retry: "Failed",
  paused_provider: "Waiting for Google",
  paused_user: "Paused",
  queued: "Queued",
  running: "Importing",
  status_unavailable: "Status unavailable",
  waiting_for_first_data: "Waiting for data",
  waiting_worker: "Delayed",
} as const satisfies Record<SearchBackfillKind, SearchSyncStatusTitle>;

function snapshot(kind: SearchBackfillKind, state: string): ActiveSearchImportSnapshot {
  return {
    capabilities: { pause: false, resume: false, retry: false },
    id: "import_1",
    presentation: { action: null, kind, supportingText: null, title: SNAPSHOT_TITLES[kind] },
    progress: { done: 0, total: 28 },
    property: "sc-domain:example.com",
    state,
  };
}

describe("project runs status filters", () => {
  it.each(PROJECT_RUNS_STATUSES)(
    "matches rank rows the same way in SQL and memory: %s",
    (status) => {
      for (const row of rankRows) {
        const run = rankProjectRun(row, project);
        expect(matchesWhere(rankStatusWhere(status), row), `${row.status}/${row.outcome}`).toBe(
          matchesProjectRunsStatus(run, status),
        );
      }
    },
  );

  it.each(PROJECT_RUNS_STATUSES)("matches upcoming rank rows the same way: %s", (status) => {
    for (const row of [rankRow("planned", null), rankRow("blocked", null)]) {
      const run = rankProjectRun({ ...row, launchedAt: null }, project);
      const stored = includesUpcomingRuns(status) && matchesWhere(upcomingStatusWhere(status), row);
      expect(stored, row.status).toBe(matchesProjectRunsStatus(run, status));
    }
  });

  it.each(PROJECT_RUNS_STATUSES)("matches stored imports the same way: %s", (status) => {
    for (const row of gscRows) {
      const run = gscProjectRun(row, project);
      if (!run) throw new Error("Expected a Search Console run.");
      expect(matchesWhere(gscRawStatusWhere(status), row), `${row.state}/${row.pausedReason}`).toBe(
        matchesProjectRunsStatus(run, status),
      );
    }
  });

  it.each(RUN_STATUS_KEYS)("places the live import by its snapshot status: %s", (status) => {
    const kinds = Object.keys(SNAPSHOT_TITLES) as SearchBackfillKind[];
    for (const kind of kinds) {
      for (const state of ["queued", "running", "waiting_for_first_data", "paused"]) {
        const live = snapshot(kind, state);
        const row = gscRow(state, kind === "paused_provider" ? "rate_limited" : null);
        const run = gscProjectRun(row, project, live);
        if (!run) throw new Error("Expected a Search Console run.");
        expect(matchesWhere(gscStatusWhere(status, live), row), `${kind}/${state}`).toBe(
          matchesProjectRunsStatus(run, status),
        );
      }
    }
  });
});
