import { describe, expect, it } from "vitest";
import {
  isKnownProjectRunGscImportState,
  isPlannedProjectRun,
  type ProjectRun,
  projectRunPlannedSortTuple,
  projectRunSortTuple,
} from "./project-run";

const capabilities = {
  cancel: false,
  pause: false,
  resume: false,
  retry: false,
  viewDetails: true,
};
const project = { name: "Example project", publicId: "prj_a00000000000000000000000" } as const;

const rankRun = {
  attention: null,
  capabilities,
  details: {
    costCents: 10,
    estimatedCostCents: 15,
    outcome: "succeeded",
    status: "completed",
    trigger: "manual",
  },
  href: "/app/prj_a00000000000000000000000/runs/rank-checks/rcr_a00000000000000000000000",
  id: "rcr_a00000000000000000000000",
  kind: "rank_check",
  lifecycle: "completed",
  progress: { completed: 2, total: 2, unit: "targets" },
  project,
  scope: { description: null, label: "2 keywords" },
  timestamps: {
    createdAt: "2026-09-06T11:58:00.000Z",
    finishedAt: "2026-09-06T12:01:00.000Z",
    launchedAt: "2026-09-06T12:00:00.000Z",
    plannedFor: null,
    startedAt: "2026-09-06T12:00:05.000Z",
  },
  title: "Manual rank check",
} satisfies ProjectRun;

describe("project run presentation contract", () => {
  it("uses a rank run launch time before its finished time", () => {
    expect(projectRunSortTuple(rankRun)).toEqual({
      id: rankRun.id,
      kind: "rank_check",
      sortAt: "2026-09-06T12:00:00.000Z",
    });
  });

  it("uses an import creation time and never fabricates rank-check costs or targets", () => {
    const importRun = {
      attention: null,
      capabilities,
      details: {
        pausedReason: null,
        property: "sc-domain:example.com",
        source: "gsc",
        state: "completed",
      },
      href: "/app/prj_a00000000000000000000000/search-console",
      id: "import_internal_id",
      kind: "gsc_import",
      lifecycle: "completed",
      progress: { completed: 28, total: 28, unit: "days" },
      project,
      scope: { description: "sc-domain:example.com", label: "Search Console" },
      timestamps: {
        createdAt: "2026-09-06T11:00:00.000Z",
        lastProbeAt: null,
        lastSyncFinishedAt: null,
        lastSyncStartedAt: null,
        syncStartedAt: null,
      },
      title: "Search Console import",
    } satisfies ProjectRun;

    expect(projectRunSortTuple(importRun)).toEqual({
      id: importRun.id,
      kind: "gsc_import",
      sortAt: "2026-09-06T11:00:00.000Z",
    });
  });

  it("rejects an invalid completed rank run without a launch or finish timestamp", () => {
    expect(() =>
      projectRunSortTuple({
        ...rankRun,
        timestamps: { ...rankRun.timestamps, finishedAt: null, launchedAt: null },
      }),
    ).toThrow("launch or finish");
  });

  it("admits only unlaunched planned or blocked rank checks to the planned view", () => {
    expect(
      isPlannedProjectRun({
        ...rankRun,
        details: { ...rankRun.details, status: "planned" },
        lifecycle: "planned",
        timestamps: { ...rankRun.timestamps, finishedAt: null, launchedAt: null },
      }),
    ).toBe(true);
    expect(isPlannedProjectRun(rankRun)).toBe(false);
  });

  it("uses plannedFor for planned rank checks and rejects a missing term", () => {
    const plannedRun = {
      ...rankRun,
      details: { ...rankRun.details, status: "planned" },
      lifecycle: "planned" as const,
      timestamps: {
        ...rankRun.timestamps,
        finishedAt: null,
        launchedAt: null,
        plannedFor: "2026-09-07T08:00:00.000Z",
      },
    } satisfies ProjectRun;

    expect(projectRunSortTuple(plannedRun)).toEqual({
      id: plannedRun.id,
      kind: "rank_check",
      sortAt: plannedRun.timestamps.createdAt,
    });
    expect(projectRunPlannedSortTuple(plannedRun)).toEqual({
      id: plannedRun.id,
      kind: "rank_check",
      plannedFor: "2026-09-07T08:00:00.000Z",
    });
    expect(() =>
      projectRunPlannedSortTuple({
        ...plannedRun,
        timestamps: { ...plannedRun.timestamps, plannedFor: null },
      }),
    ).toThrow("plannedFor");
  });

  it("preserves an unrecognized import state for a status-unavailable lifecycle", () => {
    const importRun = {
      attention: null,
      capabilities,
      details: {
        pausedReason: null,
        property: "sc-domain:example.com",
        source: "gsc",
        state: "legacy_in_progress",
      },
      href: "/app/prj_a00000000000000000000000/search-console",
      id: "legacy_import_id",
      kind: "gsc_import",
      lifecycle: "status_unavailable",
      progress: { completed: null, total: null, unit: "days" },
      project,
      scope: { description: "sc-domain:example.com", label: "Search Console" },
      timestamps: {
        createdAt: "2026-09-06T11:00:00.000Z",
        lastProbeAt: null,
        lastSyncFinishedAt: null,
        lastSyncStartedAt: null,
        syncStartedAt: null,
      },
      title: "Search Console import",
    } satisfies ProjectRun;

    expect(importRun.details.state).toBe("legacy_in_progress");
    expect(isKnownProjectRunGscImportState(importRun.details.state)).toBe(false);
  });
});
