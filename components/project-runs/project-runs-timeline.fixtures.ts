import type { ProjectRunRankCheck } from "@/lib/runs/project-run";
import type { ProjectRunsApiResponse } from "@/lib/runs/project-runs-api";
import {
  compareTimelineTuples,
  projectRunTimelineSortTuple,
} from "@/lib/runs/project-runs-timeline";

type RankRun = ProjectRunRankCheck &
  Extract<ProjectRunsApiResponse["runs"][number], { kind: "rank_check" }>;
export const timelineProjectRef = "prj_abcdefghijklmnopqrstuvwx";

function rank(
  index: number,
  status: RankRun["details"]["status"],
  at: string,
  overrides: Partial<RankRun["details"]> = {},
): RankRun {
  const id = `rcr_a${String(index).padStart(23, "0")}` as const;
  const finished = status === "completed" || status === "cancelled";
  const planned = status === "planned" || status === "blocked";
  const skipped = overrides.blockedReason === "no_active_keywords";
  return {
    id,
    kind: "rank_check",
    lifecycle: status,
    href: `/app/${timelineProjectRef}/runs/rank-checks/${id}`,
    attention:
      overrides.outcome === "failed" || status === "blocked"
        ? { kind: status === "blocked" ? "blocked" : "failed", message: null }
        : null,
    capabilities: {
      cancel: !finished && !planned,
      pause: false,
      resume: false,
      retry: overrides.outcome === "failed",
      viewDetails: true,
    },
    project: { name: "Example project", publicId: timelineProjectRef },
    title: { kind: "rank_check", trigger: overrides.trigger ?? "scheduled" },
    details: {
      status,
      outcome: finished ? "succeeded" : null,
      trigger: "scheduled",
      costCents: 0,
      estimatedCostCents: 0,
      ...overrides,
    },
    scope: { kind: "rank_check", description: null, keywordCount: skipped ? 0 : 12 },
    progress: {
      completed: finished && !skipped ? 12 : 0,
      total: skipped ? 0 : 12,
      unit: "targets",
    },
    timestamps: {
      createdAt: "2026-10-01T06:00:00.000Z",
      plannedFor: planned ? at : null,
      launchedAt: planned || skipped ? null : at,
      startedAt: status === "running" || (finished && !skipped) ? at : null,
      finishedAt: finished ? at : null,
      nextCheckAt: status === "queued" ? at : null,
    },
  };
}

/** Fictitious runs for component previews and interaction tests. */
export const timelineFixtureRuns: RankRun[] = [
  rank(1, "running", "2026-10-07T06:00:00.000Z"),
  rank(2, "queued", "2026-10-07T06:15:00.000Z", { trigger: "retry" }),
  rank(3, "planned", "2026-10-07T07:00:00.000Z"),
  rank(4, "blocked", "2026-10-07T08:00:00.000Z", { blockedReason: "no_provider" }),
  rank(5, "completed", "2026-10-07T05:30:00.000Z"),
  rank(6, "completed", "2026-10-06T08:00:00.000Z", { outcome: "failed" }),
  rank(7, "completed", "2026-10-05T08:00:00.000Z", {
    outcome: "deferred",
    blockedReason: "no_active_keywords",
  }),
  rank(8, "cancelled", "2026-10-04T08:00:00.000Z"),
].sort((left, right) =>
  compareTimelineTuples(projectRunTimelineSortTuple(left), projectRunTimelineSortTuple(right)),
);
