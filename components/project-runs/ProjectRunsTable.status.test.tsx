import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectRun } from "@/lib/runs/project-run";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectRunsTable } from "./ProjectRunsTable";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

const importRun: ProjectRun = {
  attention: { kind: "needs_reauthentication", message: null },
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  details: {
    pausedReason: "needs_reauth",
    property: "sc-domain:example.com",
    source: "gsc",
    state: "paused",
  },
  href: `/app/${projectRef}/search-console?property=sc-domain%3Aexample.com`,
  id: "import_1",
  kind: "gsc_import",
  lifecycle: "paused",
  progress: { completed: null, total: null, unit: "days" },
  project: { name: "Example", publicId: projectRef as ProjectRun["project"]["publicId"] },
  scope: { description: "sc-domain:example.com", kind: "gsc_import" },
  timestamps: {
    createdAt: "2026-09-06T09:00:00.000Z",
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: null,
    syncStartedAt: null,
  },
  title: { kind: "gsc_import" },
};

const deferredRun: ProjectRun = {
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  details: {
    costCents: 0,
    estimatedCostCents: 0,
    outcome: "deferred",
    status: "completed",
    trigger: "manual",
  },
  href: `/app/${projectRef}/runs/rank-checks/rcr_abcdefghijklmnopqrstuvwx`,
  id: "rcr_abcdefghijklmnopqrstuvwx",
  kind: "rank_check",
  lifecycle: "completed",
  progress: { completed: 0, total: 3, unit: "targets" },
  project: { name: "Example", publicId: projectRef as ProjectRun["project"]["publicId"] },
  scope: { description: null, keywordCount: 3, kind: "rank_check" },
  timestamps: {
    createdAt: "2026-09-06T09:00:00.000Z",
    finishedAt: "2026-09-06T09:05:00.000Z",
    launchedAt: "2026-09-06T09:00:00.000Z",
    plannedFor: null,
    startedAt: "2026-09-06T09:01:00.000Z",
  },
  title: { kind: "rank_check", trigger: "manual" },
};

function renderTable() {
  return render(
    <ProjectRunsTable
      canMutate={false}
      emptyState={null}
      onRunNow={vi.fn(async () => undefined)}
      onSkip={vi.fn(async () => undefined)}
      projectRef={projectRef}
      rows={[importRun, deferredRun]}
    />,
  );
}

describe("ProjectRunsTable status chips", () => {
  it("labels each chip with a filter word and describes it", () => {
    renderTable();

    expect(
      screen.getByText("Reconnect required").closest("[aria-describedby]"),
    ).toHaveAccessibleDescription("The import needs you to reconnect Search Console.");
    expect(screen.getByText("Deferred").closest("[aria-describedby]")).toHaveAccessibleDescription(
      "The run postponed its targets and charged nothing for them.",
    );
  });

  it("lists every status by source in the header legend", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Status meanings" }));
    const legend = screen.getByRole("dialog", { name: "Status meanings" });

    expect(within(legend).getByRole("heading", { name: "Rank checks" })).toBeTruthy();
    expect(within(legend).getByRole("heading", { name: "Search Console" })).toBeTruthy();
    expect(within(legend).getByText("Not confirmed")).toBeTruthy();
    expect(within(legend).getByText("Waiting for Google")).toBeTruthy();
    expect(
      within(legend).getByText("The run finished, but it has no recorded result."),
    ).toBeTruthy();
  });
});
