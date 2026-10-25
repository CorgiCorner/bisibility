import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationsTray } from "./OperationsTray";

const mocks = vi.hoisted(() => ({ dismiss: vi.fn(async () => ({ dismissed: true })) }));
vi.mock("@/lib/actions/run-tray", () => ({ dismissTrayRun: mocks.dismiss }));
vi.mock("@/lib/actions/search-insights", () => ({
  pauseSearchInsightsImport: vi.fn(),
  resumeSearchInsightsImport: vi.fn(),
  retrySearchInsightsImport: vi.fn(),
}));
const recent: OperationSnapshot = {
  kind: "rank_check",
  id: "rcr_abcdefghijklmnopqrstuvwx",
  status: "completed",
  outcome: "failed",
  trigger: "manual",
  selectionKind: "all",
  counts: {
    requested: 4,
    total: 4,
    completed: 2,
    failed: 2,
    deferred: 0,
    cancelled: 0,
    skipped: 0,
  },
  keywordCount: 4,
  targetCount: 4,
  estimatedCostCents: 0,
  costCents: null,
  blockedReason: null,
  plannedFor: null,
  nextCheckAt: null,
  startedAt: null,
  finishedAt: "2026-10-24T07:00:00Z",
  parentRunId: null,
  recent: {
    up: 1,
    down: 1,
    underReview: 1,
    incidentHref: "/app/prj_test/runs?view=checks&incidentId=incident",
  },
};
function tray(operations: OperationSnapshot[]) {
  return render(
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status: "live" }}>
      <OperationsTray projectRef="prj_test" />
    </AppRealtimeContext.Provider>,
  );
}
describe("UI-7 recent operations", () => {
  it("opens idle recent popup, shows outcome, counts and incident, and persists dismissal", async () => {
    tray([recent]);
    fireEvent.click(screen.getByRole("button", { name: "Recent runs" }));
    expect(screen.getByRole("link", { name: "Manual run · 4 keywords" })).toHaveAttribute(
      "href",
      "/app/prj_test/runs/rank-checks/rcr_abcdefghijklmnopqrstuvwx",
    );
    expect(screen.getByText("Failed").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "critical",
    );
    expect(document.querySelector(`time[datetime="${recent.finishedAt}"]`)).not.toBeNull();
    expect(screen.getByText("2 completed · 1 up · 1 down · 2 failed")).toBeVisible();
    expect(screen.getByRole("link", { name: "View incident" })).toHaveAttribute(
      "href",
      recent.kind === "rank_check" ? recent.recent?.incidentHref : "",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(mocks.dismiss).toHaveBeenCalledWith({
        projectId: "prj_test",
        runId: "rcr_abcdefghijklmnopqrstuvwx",
      }),
    );
    await waitFor(() => expect(screen.getByRole("link", { name: "Runs" })).toBeVisible());
  });
  it("places active rows before the recent section", () => {
    tray([
      recent,
      {
        ...recent,
        id: "rcr_bbcdefghijklmnopqrstuvwx",
        recent: undefined,
        status: "running",
        outcome: null,
        finishedAt: null,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /running operation/ }));
    const section = screen.getByRole("region", { name: "Recent runs" });
    expect(section.previousElementSibling).toHaveTextContent("Manual run");
  });
  it("never makes a finished failure an attention pill", () => {
    tray([{ ...recent, recent: undefined }]);
    expect(screen.getByRole("link", { name: "Runs" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /failed operation/ })).toBeNull();
  });
  it("reserves attention for active blocked work even with finished failures", () => {
    tray([
      recent,
      {
        ...recent,
        id: "rcr_bbcdefghijklmnopqrstuvwx",
        recent: undefined,
        status: "blocked",
        finishedAt: null,
        outcome: null,
        blockedReason: "budget_exhausted",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "1 blocked operation, open activity" }),
    ).toBeVisible();
  });
});
