import { projectRunRankCheckPath } from "@/lib/routing/project-runs-path";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RunsTable } from "./RunsTable";
import { historyRun } from "./runs-fixtures";

function renderRunsTable() {
  return render(
    <RunsTable
      emptyActionHref="/app/prj_1/runs/schedules"
      projectRef="prj_1"
      rows={[historyRun]}
    />,
  );
}

describe("RunsTable navigation", () => {
  it("keeps queued first checks live and treats unstarted rows as planned", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T16:24:00.000Z"));

    try {
      render(
        <RunsTable
          emptyActionHref="/app/prj_1/runs/schedules"
          projectRef="prj_1"
          rows={[
            {
              ...historyRun,
              costCents: 0,
              estimatedCostCents: 192,
              id: "rcr_queued_0001",
              launchedAt: "2026-09-04T16:24:00.000Z",
              nextCheckAt: "2026-09-04T23:24:00.000Z",
              outcome: null,
              startedAt: null,
              status: "queued",
            },
            {
              ...historyRun,
              blockedReason: "budget_exhausted",
              costCents: 0,
              estimatedCostCents: 192,
              id: "rcr_blocked_unstarted",
              launchedAt: "2026-09-04T16:24:00.000Z",
              startedAt: null,
              status: "blocked",
            },
          ]}
        />,
      );

      expect(screen.getByText("First check in 7h")).toBeInTheDocument();
      expect(screen.getAllByText("Not started")).toHaveLength(2);
      expect(screen.getAllByText("$1.92")).toHaveLength(2);
      expect(screen.getAllByText("estimate")).toHaveLength(2);
      expect(screen.queryByText("actual")).toBeNull();

      act(() => vi.advanceTimersByTime(60 * 60 * 1_000));
      expect(screen.getByText("First check in 6h")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a History row with the canonical run detail path", () => {
    renderRunsTable();

    fireEvent.click(screen.getByRole("row", { name: /Scheduled/ }));

    expect(routerMock.push).toHaveBeenCalledWith(projectRunRankCheckPath("prj_1", historyRun.id));
  });

  it("keeps a canonical title link without also invoking row navigation", () => {
    renderRunsTable();

    const link = screen.getByRole("link", { name: "Scheduled" });
    const opened = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", opened);
    fireEvent.click(link);

    expect(link).toHaveAttribute("href", projectRunRankCheckPath("prj_1", historyRun.id));
    expect(opened).toHaveBeenCalledOnce();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("opens the canonical run page from the title link with Enter", async () => {
    const user = userEvent.setup();
    renderRunsTable();
    const link = screen.getByRole("link", { name: "Scheduled" });
    const opened = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", opened);

    link.focus();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(link);
    expect(opened).toHaveBeenCalledOnce();
  });

  it("opens the row with Enter when the row itself has focus", () => {
    renderRunsTable();

    fireEvent.keyDown(screen.getByRole("row", { name: /Scheduled/ }), { key: "Enter" });

    expect(routerMock.push).toHaveBeenCalledWith(projectRunRankCheckPath("prj_1", historyRun.id));
  });
});
