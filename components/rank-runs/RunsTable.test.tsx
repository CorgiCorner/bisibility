import { DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { rankTrackerRunsPath } from "@/lib/routing/rank-tracker-runs-path";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RunsTable } from "./RunsTable";
import { historyRun } from "./runs-fixtures";

describe("RunsTable", () => {
  it("uses run labels without repeating run", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[
          historyRun,
          { ...historyRun, id: "rcr_manual", trigger: "manual" },
          { ...historyRun, id: "rcr_retry", trigger: "retry" },
          { ...historyRun, id: "rcr_api", trigger: "api" },
        ]}
      />,
    );

    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Manual run")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("API")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Copy run ID ${historyRun.id}` }),
    ).toBeInTheDocument();
  });

  it("shows a compact run ID while retaining the full copy value and tooltip", () => {
    const run = { ...historyRun, id: "rcr_9d2e41abcdef" };
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[run]}
      />,
    );

    expect(screen.getByText("rcr_9d2e41").parentElement).toHaveAttribute("title", run.id);
    expect(screen.getByRole("button", { name: `Copy run ID ${run.id}` })).toBeInTheDocument();
  });

  it("formats Started with the user date preference", () => {
    render(
      <DateFormatProvider value="day_first">
        <RunsTable
          emptyActionHref="/app/prj_1/rank-tracker/schedules"
          projectRef="prj_1"
          rows={[historyRun]}
        />
      </DateFormatProvider>,
    );

    expect(screen.getByText("3 Sep, 06:00")).toBeInTheDocument();
  });

  it("shows the terminal outcome as the one History badge", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[{ ...historyRun, outcome: "partial", status: "completed" }]}
      />,
    );

    const badge = screen.getByText("Partial").closest("[data-status-chip-tone]");
    expect(badge).toHaveAttribute("data-status-chip-tone", "attention");
  });

  it("does not repeat a one-to-one keyword and target selection", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[historyRun]}
      />,
    );

    expect(screen.queryByText(/24 keywords.*24 targets/)).toBeNull();
  });

  it("shows both counts when a selection expands to more targets", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[{ ...historyRun, keywordCount: 1, targetCount: 2 }]}
      />,
    );

    expect(screen.getByText("1 keyword · 2 targets")).toBeInTheDocument();
  });

  it("uses the blocked presentation instead of the stored reason code", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[{ ...historyRun, blockedReason: "temporal_unavailable", status: "blocked" }]}
      />,
    );

    expect(screen.getByText("Waiting for the background worker")).toBeInTheDocument();
    expect(screen.queryByText("temporal_unavailable")).toBeNull();
  });

  it("shows the effective first slot while a running run has claimed nothing", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[
          {
            ...historyRun,
            counts: {
              cancelled: 0,
              completed: 0,
              deferred: 0,
              failed: 0,
              requested: 0,
              skipped: 0,
              total: 1,
            },
            finishedAt: null,
            nextCheckAt: "2026-09-04T23:24:00.000Z",
            outcome: null,
            snapshotAt: "2026-09-04T16:24:00.000Z",
            status: "running",
          },
        ]}
      />,
    );

    expect(screen.getByText("0 / 1 targets")).toBeInTheDocument();
    expect(screen.getByText("Next check in 7h")).toBeInTheDocument();
  });

  it("shows actual cost for a blocked run that already launched", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[
          {
            ...historyRun,
            blockedReason: "budget_exhausted",
            costCents: 192,
            estimatedCostCents: 0,
            status: "blocked",
          },
        ]}
      />,
    );

    expect(screen.getByText("$1.92")).toBeInTheDocument();
    expect(screen.getByText("actual")).toBeInTheDocument();
    expect(screen.queryByText("estimate")).toBeNull();
  });

  it("shows an estimate for an unlaunched blocked run", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[
          {
            ...historyRun,
            blockedReason: "budget_exhausted",
            costCents: 0,
            estimatedCostCents: 192,
            launchedAt: null,
            startedAt: null,
            status: "blocked",
          },
        ]}
      />,
    );

    expect(screen.getByText("$1.92")).toBeInTheDocument();
    expect(screen.getByText("estimate")).toBeInTheDocument();
    expect(screen.queryByText("actual")).toBeNull();
  });

  it("opens a History row with the canonical run detail path", () => {
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[historyRun]}
      />,
    );

    fireEvent.click(screen.getByRole("row", { name: /Scheduled/ }));

    expect(routerMock.push).toHaveBeenCalledWith(rankTrackerRunsPath("prj_1", historyRun.id));
  });

  it("opens the canonical run page with Tab and Enter", async () => {
    const user = userEvent.setup();
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[historyRun]}
      />,
    );
    const link = screen.getByRole("link", { name: "Scheduled" });
    const opened = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", opened);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(link);
    expect(opened).toHaveBeenCalledOnce();
  });

  it("shows a person avatar and keeps Schedule and API launches text-only", () => {
    const userRun = {
      ...historyRun,
      requestedBy: {
        avatarUrl: "https://example.com/marta.png",
        initials: "ME",
        name: "Marta Example",
      },
    };
    const initialsRun = {
      ...historyRun,
      id: "rcr_initials",
      requestedBy: { avatarUrl: null, initials: "MK", name: "Marta Kowalska" },
    };
    const scheduledRun = { ...historyRun, id: "rcr_scheduled", requestedBy: null };
    const apiRun = { ...historyRun, id: "rcr_api", requestedBy: null, trigger: "api" as const };
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[userRun, initialsRun, scheduledRun, apiRun]}
      />,
    );

    const userActor = screen.getByTestId(`run-actor-${userRun.id}`);
    expect(within(userActor).getByText("ME")).toBeInTheDocument();
    expect(within(userActor).getByText("Marta Example")).toBeInTheDocument();
    expect(userActor.querySelector("img")).toHaveAttribute("src", "https://example.com/marta.png");
    expect(
      within(screen.getByTestId(`run-actor-${initialsRun.id}`)).getByText("MK"),
    ).toBeInTheDocument();

    const scheduledActor = screen.getByTestId(`run-actor-${scheduledRun.id}`);
    expect(within(scheduledActor).getByText("Schedule")).toBeInTheDocument();
    expect(scheduledActor.querySelector("img")).toBeNull();
    const apiActor = screen.getByTestId(`run-actor-${apiRun.id}`);
    expect(within(apiActor).getByText("API")).toBeInTheDocument();
    expect(apiActor.querySelector("img")).toBeNull();
  });

  it("renders a skipped occurrence as an audit-only History row", () => {
    const skippedRun = {
      ...historyRun,
      checkScheduleName: "Daily 06:00",
      costCents: 192,
      counts: {
        cancelled: 0,
        completed: 0,
        deferred: 0,
        failed: 0,
        requested: 24,
        skipped: 0,
        total: 24,
      },
      finishedAt: "2026-09-05T06:05:00.000Z",
      id: "rcr_skipped_0001",
      launchedAt: null,
      outcome: null,
      plannedFor: "2026-09-05T06:00:00.000Z",
      requestedBy: null,
      skippedBy: { name: "Anna Kowalska" },
      startedAt: null,
      status: "cancelled" as const,
    };
    render(
      <RunsTable
        emptyActionHref="/app/prj_1/rank-tracker/schedules"
        projectRef="prj_1"
        rows={[skippedRun]}
      />,
    );

    expect(screen.getByText("Skipped").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "neutral",
    );
    expect(screen.getByText("Daily 06:00")).toBeInTheDocument();
    expect(screen.getByText("Skipped by Anna Kowalska · never sent")).toBeInTheDocument();
    expect(screen.getByText("0 / 24 targets")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("nothing billed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scheduled" })).toHaveAttribute(
      "href",
      rankTrackerRunsPath("prj_1", skippedRun.id),
    );
  });
});
