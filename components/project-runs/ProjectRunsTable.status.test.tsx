import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ProjectRun } from "@/lib/runs/project-run";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRunsTable } from "./ProjectRunsTable";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const viewport = vi.hoisted(() => ({ desktop: false }));
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: () => viewport.desktop }));
beforeEach(() => {
  viewport.desktop = false;
});

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

function renderTable(rows: readonly ProjectRun[] = [importRun, deferredRun]) {
  return render(
    <ProjectRunsTable
      canMutate={false}
      emptyState={null}
      onRunNow={vi.fn(async () => undefined)}
      onSkip={vi.fn(async () => undefined)}
      projectRef={projectRef}
      rows={rows}
    />,
  );
}

describe("ProjectRunsTable status chips", () => {
  it.each([true, false])(
    "keeps unknown import measurements distinct from zero (desktop=%s)",
    (desktop) => {
      viewport.desktop = desktop;
      renderTable([importRun]);
      const row = screen.getAllByText("Search Console import")[0]?.closest('[role="row"]');
      expect(
        row?.querySelector(desktop ? '[data-column-id="progress"]' : '[data-column-id="title"]'),
      ).toHaveTextContent("Not available");
      if (desktop)
        expect(row?.querySelector('[data-column-id="when"]')).toHaveTextContent("Submitted");
      else
        expect(row?.querySelector("time")).toHaveAttribute(
          "title",
          expect.stringMatching(/^Submitted:/),
        );
      expect(row).not.toHaveTextContent("Started");
      expect(row).not.toHaveTextContent("0 / 0");
    },
  );
  it.each([true, false])(
    "keeps queued runs unstarted until a real start is recorded (desktop=%s)",
    (desktop) => {
      viewport.desktop = desktop;
      const queued: ProjectRun = {
        ...deferredRun,
        details: { ...deferredRun.details, status: "queued", outcome: null },
        lifecycle: "queued",
        progress: { completed: 0, total: 3, unit: "targets" },
        timestamps: { ...deferredRun.timestamps, startedAt: null, finishedAt: null },
      };
      const view = renderTable([queued]);
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(screen.queryByText("Running")).not.toBeInTheDocument();
      expect(screen.queryByText("Failed")).not.toBeInTheDocument();
      const row = screen.getByText("Manual rank check").closest('[role="row"]');
      expect(
        row?.querySelector(desktop ? '[data-column-id="progress"]' : '[data-column-id="title"]'),
      ).toHaveTextContent("0 / 3");
      if (desktop)
        expect(row?.querySelector('[data-column-id="when"]')).toHaveTextContent("Ready from");
      else
        expect(row?.querySelector("time")).toHaveAttribute(
          "title",
          expect.stringMatching(/^Ready from:/),
        );
      expect(row).not.toHaveTextContent("Started");
      const started: ProjectRun = {
        ...queued,
        details: { ...queued.details, status: "running" },
        lifecycle: "running",
        timestamps: { ...queued.timestamps, startedAt: "2026-09-06T09:01:00.000Z" },
      };
      view.unmount();
      renderTable([started]);
      const startedRow = screen.getByText("Manual rank check").closest('[role="row"]');
      expect(screen.getByText("Running")).toBeInTheDocument();
      if (desktop)
        expect(startedRow?.querySelector('[data-column-id="when"]')).toHaveTextContent("Started");
      else {
        expect(startedRow?.querySelector("time")).toHaveAttribute(
          "title",
          expect.stringMatching(/^Started:/),
        );
        expect(startedRow?.querySelector("time")).toHaveAttribute(
          "datetime",
          "2026-09-06T09:01:00.000Z",
        );
      }
    },
  );
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
