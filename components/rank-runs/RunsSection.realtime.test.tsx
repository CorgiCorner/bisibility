import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunsSection } from "./RunsSection";
import { historyPage, historyRun, plannedPage } from "./runs-fixtures";

const mocks = vi.hoisted(() => ({ operations: [] as object[] }));

vi.mock("@/components/shell/AppRealtimeProvider", () => ({
  useAppRealtime: () => ({ notifications: null, operations: mocks.operations, status: "live" }),
}));

function renderRuns() {
  return render(
    <RunsSection
      budgetExhausted
      budgetSettingsHref="/app/prj_story/settings/usage?budget=edit"
      initialHistory={historyPage}
      initialPlanned={plannedPage}
      projectRef="prj_story"
      schedulesHref="/app/prj_story/runs/schedules"
    />,
  );
}

function jsonResponse(value: unknown) {
  return { json: async () => value, ok: true } as Response;
}

describe("RunsSection realtime", () => {
  beforeEach(() => {
    mocks.operations = [];
    vi.unstubAllGlobals();
  });

  it("plan criterion: new-runs pill", () => {
    mocks.operations = [
      {
        ...historyRun,
        finishedAt: null,
        id: "rcr_realtime_0001",
        outcome: null,
        startedAt: "2026-09-03T07:00:00.000Z",
        status: "running",
      },
    ];
    renderRuns();

    expect(screen.getByTestId("new-runs-pill")).toHaveTextContent(
      "1 run started while you were reading",
    );
  });

  it("keeps the new-runs pill after that realtime operation finishes", async () => {
    const realtimeRun = {
      ...historyRun,
      finishedAt: null,
      id: "rcr_realtime_finished",
      outcome: null,
      startedAt: "2026-09-03T07:00:00.000Z",
      status: "running" as const,
    };
    mocks.operations = [realtimeRun];
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ ...realtimeRun, outcome: "succeeded", status: "completed" }],
        meta: { next_cursor: null },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const view = renderRuns();

    expect(screen.getByTestId("new-runs-pill")).toBeInTheDocument();
    mocks.operations = [];
    view.rerender(
      <RunsSection
        budgetExhausted
        budgetSettingsHref="/app/prj_story/settings/usage?budget=edit"
        initialHistory={historyPage}
        initialPlanned={plannedPage}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByTestId("new-runs-pill")).toHaveTextContent(
      "1 run started while you were reading",
    );
  });

  it("merges active History snapshots and refreshes a row after it exits realtime", async () => {
    mocks.operations = [
      {
        ...historyRun,
        completedCount: undefined,
        counts: { ...historyRun.counts, completed: 5 },
        etaSeconds: 120,
        finishedAt: null,
        outcome: null,
        snapshotAt: "2026-09-03T06:01:00.000Z",
        status: "running",
      },
    ];
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ ...historyRun, outcome: "succeeded", status: "completed" }],
        meta: { next_cursor: null },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const view = renderRuns();

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("5 / 24 targets")).toBeInTheDocument();

    mocks.operations = [];
    view.rerender(
      <RunsSection
        budgetExhausted
        budgetSettingsHref="/app/prj_story/settings/usage?budget=edit"
        initialHistory={historyPage}
        initialPlanned={plannedPage}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("24 / 24 targets")).toBeInTheDocument();
  });
});
