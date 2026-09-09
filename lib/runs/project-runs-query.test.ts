import { describe, expect, it } from "vitest";
import type { ProjectRun } from "./project-run";
import { matchesProjectRunsQuery, pageProjectRuns } from "./project-runs-query";

const project = { name: "Example project", publicId: "prj_a00000000000000000000000" } as const;
const capabilities = {
  cancel: false,
  pause: false,
  resume: false,
  retry: false,
  viewDetails: true,
};

function rank(
  id: string,
  launchedAt: string,
  status: "cancelled" | "completed" = "completed",
): ProjectRun {
  return {
    attention: null,
    capabilities,
    details: { costCents: 0, estimatedCostCents: 0, outcome: null, status, trigger: "manual" },
    href: `/app/${project.publicId}/runs/rank-checks/${id}`,
    id: id as `rcr_${string}`,
    kind: "rank_check",
    lifecycle: status,
    progress: { completed: 1, total: 1, unit: "targets" },
    project,
    scope: { description: null, label: "1 keyword" },
    timestamps: {
      createdAt: launchedAt,
      finishedAt: launchedAt,
      launchedAt,
      plannedFor: null,
      startedAt: launchedAt,
    },
    title: "Manual rank check",
  };
}

function gsc(
  id: string,
  createdAt: string,
  state: "completed" | "failed" | "paused" | "running" = "completed",
  overrides: Pick<ProjectRun, "attention" | "lifecycle"> & {
    pausedReason: "error" | "needs_reauth" | "rate_limited" | "user" | null;
  } = {
    attention: state === "failed" ? { kind: "failed", message: null } : null,
    lifecycle: state,
    pausedReason: null,
  },
): ProjectRun {
  return {
    attention: overrides.attention,
    capabilities,
    details: {
      pausedReason: overrides.pausedReason,
      property: "sc-domain:example.com",
      source: "gsc",
      state,
    },
    href: `/app/${project.publicId}/search-console`,
    id,
    kind: "gsc_import",
    lifecycle: overrides.lifecycle,
    progress: {
      completed: state === "running" ? null : 1,
      total: state === "running" ? null : 1,
      unit: "days",
    },
    project,
    scope: { description: "sc-domain:example.com", label: "Search Console" },
    timestamps: {
      createdAt,
      lastProbeAt: null,
      lastSyncFinishedAt: null,
      lastSyncStartedAt: null,
      syncStartedAt: null,
    },
    title: "Search Console import",
  };
}

function plannedRank(id: string, plannedFor: string): ProjectRun {
  return {
    attention: null,
    capabilities,
    details: {
      costCents: 0,
      estimatedCostCents: 0,
      outcome: null,
      status: "planned",
      trigger: "scheduled",
    },
    href: `/app/${project.publicId}/runs/rank-checks/${id}`,
    id: id as `rcr_${string}`,
    kind: "rank_check",
    lifecycle: "planned",
    progress: { completed: 0, total: 1, unit: "targets" },
    project,
    scope: { description: null, label: "1 keyword" },
    timestamps: {
      createdAt: plannedFor,
      finishedAt: null,
      launchedAt: null,
      plannedFor,
      startedAt: null,
    },
    title: "Scheduled rank check",
  };
}

describe("project runs federated paging", () => {
  it("paginates three mixed pages without skipping or repeating equal timestamps", () => {
    const same = "2026-09-06T12:00:00.000Z";
    const candidates = [
      rank("rcr_d00000000000000000000000", same),
      gsc("import_b", same),
      rank("rcr_c00000000000000000000000", same),
      gsc("import_a", same),
      rank("rcr_b00000000000000000000000", "2026-09-06T11:00:00.000Z"),
      gsc("import_c", "2026-09-06T11:00:00.000Z"),
      rank("rcr_a00000000000000000000000", "2026-09-06T10:00:00.000Z"),
    ];
    const query = { cursor: null, limit: 2, source: "all", status: "all", view: "runs" } as const;
    const ids: string[] = [];
    let cursor: string | null = null;

    for (;;) {
      const page = pageProjectRuns(candidates, { ...query, cursor });
      ids.push(...page.data.map((run) => run.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(ids).toEqual([
      "import_a",
      "import_b",
      "rcr_c00000000000000000000000",
      "rcr_d00000000000000000000000",
      "import_c",
      "rcr_b00000000000000000000000",
      "rcr_a00000000000000000000000",
    ]);
    expect(new Set(ids)).toHaveLength(candidates.length);
  });

  it("keeps source and status membership consistent with the filtered list", () => {
    const runs = [
      rank("rcr_a00000000000000000000000", "2026-09-06T12:00:00.000Z"),
      gsc("import_active", "2026-09-06T11:00:00.000Z", "running"),
      gsc("import_failed", "2026-09-06T10:00:00.000Z", "failed"),
    ];

    expect(
      runs.filter((run) =>
        matchesProjectRunsQuery(run, {
          cursor: null,
          limit: 20,
          source: "rank_checks",
          status: "all",
          view: "runs",
        }),
      ),
    ).toHaveLength(1);
    expect(
      runs.filter((run) =>
        matchesProjectRunsQuery(run, {
          cursor: null,
          limit: 20,
          source: "all",
          status: "active",
          view: "runs",
        }),
      ),
    ).toEqual([runs[1]]);
    expect(
      runs.filter((run) =>
        matchesProjectRunsQuery(run, {
          cursor: null,
          limit: 20,
          source: "search_console",
          status: "finished",
          view: "runs",
        }),
      ),
    ).toEqual([runs[2]]);
    expect(
      runs.filter((run) =>
        matchesProjectRunsQuery(run, {
          cursor: null,
          limit: 20,
          source: "all",
          status: "attention",
          view: "runs",
        }),
      ),
    ).toEqual([runs[2]]);
  });

  it("keeps durable GSC active, attention, and finished membership distinct", () => {
    const rateLimited = gsc("import_rate_limited", "2026-09-06T12:00:00.000Z", "paused", {
      attention: null,
      lifecycle: "waiting_to_resume",
      pausedReason: "rate_limited",
    });
    const userPaused = gsc("import_user", "2026-09-06T11:00:00.000Z", "paused", {
      attention: { kind: "paused", message: null },
      lifecycle: "paused",
      pausedReason: "user",
    });
    const errored = gsc("import_error", "2026-09-06T10:00:00.000Z", "paused", {
      attention: { kind: "failed", message: null },
      lifecycle: "paused",
      pausedReason: "error",
    });
    const needsReauth = gsc("import_reauth", "2026-09-06T09:00:00.000Z", "paused", {
      attention: { kind: "needs_reauthentication", message: null },
      lifecycle: "paused",
      pausedReason: "needs_reauth",
    });
    const finished = gsc("import_finished", "2026-09-06T08:00:00.000Z", "failed");
    const runs = [rateLimited, userPaused, errored, needsReauth, finished];

    const matching = (status: "active" | "attention" | "finished") =>
      runs.filter((run) =>
        matchesProjectRunsQuery(run, {
          cursor: null,
          limit: 20,
          source: "search_console",
          status,
          view: "runs",
        }),
      );

    expect(matching("active")).toEqual([rateLimited]);
    expect(matching("attention")).toEqual([userPaused, errored, needsReauth, finished]);
    expect(matching("finished")).toEqual([finished]);
  });

  it("rejects a cursor when the active filter set changes", () => {
    const runs = [
      rank("rcr_a00000000000000000000000", "2026-09-06T12:00:00.000Z"),
      gsc("import_a", "2026-09-06T11:00:00.000Z"),
    ];
    const first = pageProjectRuns(runs, {
      cursor: null,
      limit: 1,
      source: "all",
      status: "all",
      view: "runs",
    });

    expect(() =>
      pageProjectRuns(runs, {
        cursor: first.nextCursor,
        limit: 1,
        source: "rank_checks",
        status: "all",
        view: "runs",
      }),
    ).toThrow("filter set");
  });

  it("includes upcoming and blocked runs in All, and blocked runs in Needs attention", () => {
    const planned = plannedRank("rcr_a00000000000000000000000", "2026-09-07T08:00:00.000Z");
    const blocked: ProjectRun = {
      ...plannedRank("rcr_b00000000000000000000000", "2026-09-07T09:00:00.000Z"),
      attention: { kind: "blocked", message: "Monthly limit" },
      lifecycle: "blocked",
    };
    const query = { cursor: null, limit: 20, source: "all", status: "all", view: "runs" } as const;
    expect(pageProjectRuns([planned, blocked], query).data.map((run) => run.id)).toEqual([
      blocked.id,
      planned.id,
    ]);
    expect(pageProjectRuns([planned, blocked], { ...query, status: "attention" }).data).toEqual([
      blocked,
    ]);
    expect(pageProjectRuns([planned, blocked], { ...query, status: "active" }).data).toEqual([]);
    expect(pageProjectRuns([planned, blocked], { ...query, status: "finished" }).data).toEqual([]);
  });

  it("pages planned rank runs by ascending plannedFor and a filter-bound cursor", () => {
    const candidates = [
      plannedRank("rcr_b00000000000000000000000", "2026-09-06T12:00:00.000Z"),
      plannedRank("rcr_a00000000000000000000000", "2026-09-06T11:00:00.000Z"),
      plannedRank("rcr_c00000000000000000000000", "2026-09-06T12:00:00.000Z"),
    ];
    const first = pageProjectRuns(candidates, {
      cursor: null,
      limit: 2,
      source: "all",
      status: "all",
      view: "planned",
    });
    const second = pageProjectRuns(candidates, {
      cursor: first.nextCursor,
      limit: 2,
      source: "all",
      status: "all",
      view: "planned",
    });

    expect(first.data.map((run) => run.id)).toEqual([
      "rcr_a00000000000000000000000",
      "rcr_b00000000000000000000000",
    ]);
    expect(second.data.map((run) => run.id)).toEqual(["rcr_c00000000000000000000000"]);
  });
});
