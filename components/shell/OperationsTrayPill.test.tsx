import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationsTray } from "./OperationsTray";

vi.mock("@/lib/actions/search-insights", () => ({
  pauseSearchInsightsImport: vi.fn(),
  resumeSearchInsightsImport: vi.fn(),
  retrySearchInsightsImport: vi.fn(),
}));

const rankCheck: OperationSnapshot = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 0,
    deferred: 0,
    failed: 0,
    requested: 1,
    skipped: 0,
    total: 1,
  },
  estimatedCostCents: 0,
  etaSeconds: null,
  finishedAt: null,
  id: "rcr_example",
  keywordCount: 1,
  kind: "rank_check",
  nextCheckAt: null,
  outcome: null,
  parentRunId: null,
  plannedFor: null,
  provider: null,
  providerLabel: null,
  selectionKind: "single",
  startedAt: "2026-09-05T12:00:00.000Z",
  status: "running",
  targetCount: 1,
  trigger: "scheduled",
};

function renderTray(operations: OperationSnapshot[]) {
  return render(
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status: "live" }}>
      <OperationsTray defaultOpen={false} projectRef="prj_example" />
    </AppRealtimeContext.Provider>,
  );
}

function dotFor(label: string) {
  return screen.getByRole("button", { name: label }).querySelector(".bg-blue");
}

describe("OperationsTray pill lifecycle", () => {
  it("shows queued work as waiting with a static dot", () => {
    renderTray([
      {
        ...rankCheck,
        hasRunningTargets: false,
        nextCheckAt: "2026-09-05T14:00:00.000Z",
        startedAt: null,
        status: "queued",
      },
    ]);

    expect(
      screen.getByRole("button", { name: "1 waiting operations, open activity" }),
    ).toBeVisible();
    expect(dotFor("1 waiting operations, open activity")).not.toHaveClass(
      "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
    );
  });

  it("shows an active target as running with a breathing dot", () => {
    renderTray([{ ...rankCheck, hasRunningTargets: true }]);

    expect(
      screen.getByRole("button", { name: "1 running operations, open activity" }),
    ).toBeVisible();
    expect(dotFor("1 running operations, open activity")).toHaveClass(
      "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
    );
  });

  it("keeps cancellation running while a target is active", () => {
    renderTray([{ ...rankCheck, hasRunningTargets: true, status: "cancelling" }]);

    expect(
      screen.getByRole("button", { name: "1 running operations, open activity" }),
    ).toBeVisible();
    expect(dotFor("1 running operations, open activity")).toHaveClass(
      "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
    );
  });

  it.each([false, undefined])(
    "keeps cancellation %s targets static and waiting",
    (hasRunningTargets) => {
      renderTray([{ ...rankCheck, hasRunningTargets, status: "cancelling" }]);

      expect(
        screen.getByRole("button", { name: "1 waiting operations, open activity" }),
      ).toBeVisible();
      expect(dotFor("1 waiting operations, open activity")).not.toHaveClass(
        "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
      );
    },
  );

  it("does not count queued and between-check runs as running", () => {
    renderTray([
      { ...rankCheck, hasRunningTargets: true },
      {
        ...rankCheck,
        hasRunningTargets: false,
        id: "rcr_queued",
        startedAt: null,
        status: "queued",
      },
      {
        ...rankCheck,
        hasRunningTargets: false,
        id: "rcr_between_checks",
        nextCheckAt: "2026-09-05T14:00:00.000Z",
      },
    ]);

    expect(
      screen.getByRole("button", { name: "1 running operations, open activity" }),
    ).toBeVisible();
  });

  it("shows a run between distributed checks as waiting with a static dot", () => {
    renderTray([
      {
        ...rankCheck,
        hasRunningTargets: false,
        nextCheckAt: "2026-09-05T14:00:00.000Z",
      },
    ]);

    expect(
      screen.getByRole("button", { name: "1 waiting operations, open activity" }),
    ).toBeVisible();
    expect(dotFor("1 waiting operations, open activity")).not.toHaveClass(
      "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
    );
  });

  it("derives import status from its source state", () => {
    const view = renderTray([
      { id: "import_1", kind: "gsc_import", progress: { done: 0, total: 1 }, state: "queued" },
    ]);

    expect(
      screen.getByRole("button", { name: "1 waiting operations, open activity" }),
    ).toBeVisible();
    view.rerender(
      <AppRealtimeContext.Provider
        value={{
          notifications: null,
          operations: [
            {
              id: "import_1",
              kind: "gsc_import",
              progress: { done: 0, total: 1 },
              state: "running",
            },
          ],
          status: "live",
        }}
      >
        <OperationsTray defaultOpen={false} projectRef="prj_example" />
      </AppRealtimeContext.Provider>,
    );

    expect(
      screen.getByRole("button", { name: "1 running operations, open activity" }),
    ).toBeVisible();
    expect(dotFor("1 running operations, open activity")).toHaveClass(
      "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
    );
  });

  it("does not present a terminal row as running", () => {
    renderTray([
      {
        ...rankCheck,
        finishedAt: "2026-09-05T12:01:00.000Z",
        outcome: "succeeded",
        status: "completed",
      },
    ]);

    expect(screen.getByRole("link", { name: "Runs" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /running operations/ })).not.toBeInTheDocument();
  });
});
