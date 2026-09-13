import type { ProjectRunsApiResponse } from "@/lib/runs/project-runs-api";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRunsContent, ProjectRunsLoadError } from "./ProjectRunsContent";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const runNowAction = vi.fn(async () => undefined);
const skipAction = vi.fn(async () => undefined);

const importRun: ProjectRunsApiResponse["runs"][number] = {
  attention: null,
  capabilities: { cancel: false, pause: true, resume: false, retry: false, viewDetails: true },
  details: {
    pausedReason: null,
    property: "sc-domain:example.com",
    source: "gsc",
    state: "running",
  },
  href: `/app/${projectRef}/search-console?property=sc-domain%3Aexample.com`,
  id: "import_1",
  kind: "gsc_import",
  lifecycle: "running",
  progress: { completed: null, total: null, unit: "days" },
  project: { name: "Example", publicId: projectRef },
  scope: { description: "sc-domain:example.com", label: "Search Console" },
  timestamps: {
    createdAt: "2026-09-06T09:00:00.000Z",
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: "2026-09-06T09:10:00.000Z",
    syncStartedAt: "2026-09-06T09:10:00.000Z",
  },
  title: "Search Console import",
};

const plannedRankRun: ProjectRunsApiResponse["runs"][number] = {
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  details: {
    costCents: null,
    estimatedCostCents: null,
    outcome: null,
    status: "planned",
    trigger: "scheduled",
  },
  href: `/app/${projectRef}/runs/rank-checks/rcr_abcdefghijklmnopqrstuvwx`,
  id: "rcr_abcdefghijklmnopqrstuvwx",
  kind: "rank_check",
  lifecycle: "planned",
  progress: { completed: 0, total: 10, unit: "targets" },
  project: { name: "Example", publicId: projectRef },
  scope: { description: null, label: "10 keywords" },
  timestamps: {
    createdAt: "2026-09-06T09:00:00.000Z",
    finishedAt: null,
    launchedAt: null,
    plannedFor: "2026-09-07T09:00:00.000Z",
    startedAt: null,
  },
  title: "Scheduled rank check",
};

function renderContent(overrides: Partial<React.ComponentProps<typeof ProjectRunsContent>> = {}) {
  return render(
    <ProjectRunsContent
      canMutate
      operations={[]}
      page={{ counts: { rankChecks: 0, searchConsole: 0, total: 0 }, nextCursor: null, runs: [] }}
      projectRef={projectRef}
      query={{ cursor: null, limit: 20, source: "all", status: "all", view: "runs" }}
      runNowAction={runNowAction}
      skipAction={skipAction}
      {...overrides}
    />,
  );
}

describe("ProjectRunsContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps schedules discoverable from the Upcoming Search Console empty state", () => {
    renderContent({
      query: { cursor: null, limit: 20, source: "search_console", status: "all", view: "planned" },
    });

    expect(screen.getByText("No upcoming Search Console runs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedules" })).toHaveAttribute(
      "href",
      `/app/${projectRef}/runs/schedules`,
    );
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
  });

  it("selects Upcoming from another status and clears the old cursor", () => {
    renderContent({
      query: {
        cursor: "old-page",
        limit: 50,
        source: "rank_checks",
        status: "attention",
        view: "runs",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run status" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Upcoming" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?view=planned&source=rank_checks&limit=50`,
    );
  });

  it.each([
    ["All statuses", ""],
    ["Active", "&status=active"],
    ["Needs attention", "&status=attention"],
    ["Finished", "&status=finished"],
  ])("leaves Upcoming for %s without retaining its cursor", (label, suffix) => {
    renderContent({
      query: {
        cursor: "upcoming-page",
        limit: 20,
        source: "rank_checks",
        status: "all",
        view: "planned",
      },
    });
    expect(screen.getByRole("button", { name: "Run status" })).toHaveTextContent("Upcoming");
    fireEvent.click(screen.getByRole("button", { name: "Run status" }));
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?source=rank_checks${suffix}`,
    );
  });

  it("keeps Upcoming when changing source and paginating", () => {
    renderContent({
      query: { cursor: "old-page", limit: 20, source: "all", status: "all", view: "planned" },
      page: {
        counts: { rankChecks: 0, searchConsole: 0, total: 0 },
        nextCursor: "next-page",
        runs: [],
      },
    });
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      `/app/${projectRef}/runs?view=planned&cursor=next-page`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run source" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rank checks" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?view=planned&source=rank_checks`,
    );
  });

  it("keeps the Upcoming context when recovering from a stale page", () => {
    render(
      <ProjectRunsLoadError
        projectRef={projectRef}
        stale
        query={{
          cursor: "old-page",
          limit: 20,
          source: "rank_checks",
          status: "all",
          view: "planned",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Return to first page" })).toHaveAttribute(
      "href",
      `/app/${projectRef}/runs?view=planned&source=rank_checks`,
    );
    expect(screen.queryByRole("link", { name: "Planned" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
  });

  it("renders qualifying coverage, property href, and no-op-free DataTable controls for an active import", () => {
    renderContent({
      operations: [
        {
          capabilities: { pause: true, resume: false, retry: false },
          id: "import_1",
          kind: "gsc_import",
          presentation: {
            action: null,
            supportingText: "Google will resume the import automatically when its limit allows.",
            title: "Waiting for Google",
          },
          progress: { done: 28, total: 488 },
          property: "sc-domain:example.com",
          state: "running",
        },
      ],
      page: {
        counts: { rankChecks: 0, searchConsole: 1, total: 1 },
        nextCursor: null,
        runs: [
          {
            ...importRun,
            details: { ...importRun.details, pausedReason: "rate_limited", state: "paused" },
            lifecycle: "waiting_to_resume",
          },
        ],
      },
    });

    expect(screen.getByRole("table", { name: "Project runs" })).toBeInTheDocument();
    expect(screen.getByText("28 / 488")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Google")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Search Console import" }));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Run now" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "View details" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectRef}/search-console?property=sc-domain%3Aexample.com`,
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("uses the canonical delayed snapshot tone instead of durable running tone", () => {
    renderContent({
      operations: [
        {
          capabilities: { pause: false, resume: false, retry: false },
          id: "import_1",
          kind: "gsc_import",
          presentation: { action: null, supportingText: null, title: "Delayed" },
          progress: { done: 28, total: 488 },
          property: "sc-domain:example.com",
          state: "running",
        },
      ],
      page: {
        counts: { rankChecks: 0, searchConsole: 1, total: 1 },
        nextCursor: null,
        runs: [importRun],
      },
    });

    expect(screen.getByText("Delayed").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "attention",
    );
  });

  it("keeps a Run now action out of the clickable row navigation", () => {
    renderContent({
      page: {
        counts: { rankChecks: 1, searchConsole: 0, total: 1 },
        nextCursor: null,
        runs: [plannedRankRun],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Run now" }));

    expect(runNowAction).toHaveBeenCalledWith({ projectRef, runId: plannedRankRun.id });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("skips a planned run from the menu and refreshes without navigating", async () => {
    renderContent({
      page: {
        counts: { rankChecks: 1, searchConsole: 0, total: 1 },
        nextCursor: null,
        runs: [plannedRankRun],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Skip once" }));

    expect(skipAction).toHaveBeenCalledWith({ projectRef, runId: plannedRankRun.id });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("shows only viewing in the menu without mutation permission", () => {
    renderContent({
      canMutate: false,
      page: {
        counts: { rankChecks: 1, searchConsole: 0, total: 1 },
        nextCursor: null,
        runs: [plannedRankRun],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));

    expect(screen.getByRole("menuitem", { name: "View details" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Run now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Skip once" })).not.toBeInTheDocument();
  });

  it("distinguishes global no-runs and stale cursor errors", () => {
    const { rerender } = renderContent();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedules" })).toBeVisible();
    expect(screen.queryByRole("radiogroup", { name: "Runs view" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Rank checks and Search Console history imports will appear here."),
    ).toBeInTheDocument();

    rerender(
      <ProjectRunsContent
        canMutate
        operations={[]}
        page={{ counts: { rankChecks: 0, searchConsole: 0, total: 0 }, nextCursor: null, runs: [] }}
        projectRef={projectRef}
        query={{ cursor: null, limit: 20, source: "all", status: "active", view: "runs" }}
        runNowAction={runNowAction}
        skipAction={skipAction}
      />,
    );
    expect(screen.getByText("No runs in progress")).toBeInTheDocument();

    rerender(<ProjectRunsLoadError projectRef={projectRef} stale />);
    expect(screen.getByRole("alert")).toHaveTextContent("This Runs page is stale");
    expect(screen.getByRole("link", { name: "Schedules" })).toBeVisible();
  });
});

describe("run history deletion", () => {
  const completedRun = {
    ...plannedRankRun,
    lifecycle: "completed",
    details: { ...plannedRankRun.details, status: "completed", outcome: "failed" },
    timestamps: {
      ...plannedRankRun.timestamps,
      launchedAt: "2026-09-06T09:00:00Z",
      finishedAt: "2026-09-06T09:01:00Z",
    },
  } as ProjectRunsApiResponse["runs"][number];
  const page = {
    counts: { rankChecks: 1, searchConsole: 0, total: 1 },
    nextCursor: null,
    runs: [completedRun],
  };
  it("confirms a completed run deletion before invoking the action", async () => {
    const deleteAction = vi.fn(async () => undefined);
    renderContent({ canDelete: true, deleteAction, page });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete run" }));
    expect(deleteAction).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Keyword positions and recorded provider spend are retained/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    await waitFor(() =>
      expect(deleteAction).toHaveBeenCalledWith({ projectRef, runId: completedRun.id }),
    );
  });
  it("does not offer deletion without delete permission", () => {
    renderContent({ canDelete: false, deleteAction: vi.fn(), page });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));
    expect(screen.queryByRole("menuitem", { name: "Delete run" })).not.toBeInTheDocument();
  });
  it("does not offer deletion for a planned run", () => {
    renderContent({
      canDelete: true,
      deleteAction: vi.fn(),
      page: { ...page, runs: [plannedRankRun] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Scheduled rank check" }));
    expect(screen.queryByRole("menuitem", { name: "Delete run" })).not.toBeInTheDocument();
  });
});
