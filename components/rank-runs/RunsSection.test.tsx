import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunsSection } from "./RunsSection";
import { blockedRun, historyPage, historyRun, plannedPage, plannedRun } from "./runs-fixtures";

function renderRuns(initialSegment: "history" | "planned" = "history") {
  return render(
    <RunsSection
      budgetExhausted
      budgetSettingsHref="/app/prj_story/settings/usage?budget=edit"
      initialHistory={historyPage}
      initialPlanned={plannedPage}
      initialSegment={initialSegment}
      projectRef="prj_story"
      schedulesHref="/app/prj_story/runs/schedules"
    />,
  );
}

function jsonResponse(value: unknown) {
  return { json: async () => value, ok: true } as Response;
}

describe("RunsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("plan criterion: Planned | History", () => {
    renderRuns();

    expect(screen.getByRole("radio", { name: "History" })).toBeChecked();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));

    expect(screen.getByRole("radio", { name: "Planned" })).toBeChecked();
    expect(screen.getAllByTestId(/planned-row-/)).toHaveLength(2);
    expect(screen.getByText("2 planned runs")).toBeInTheDocument();
  });

  it("uses the planned subtitle and no obsolete footer", () => {
    renderRuns("planned");

    expect(screen.getByText("Next 7 days · soonest first")).toBeInTheDocument();
    expect(screen.queryByText(/Schedule definitions stay/i)).not.toBeInTheDocument();
  });

  it("plan criterion: blocked row full contrast, one action", () => {
    renderRuns("planned");

    const row = screen.getByTestId(`planned-row-${blockedRun.id}`);
    expect(row).toHaveClass("border-yellow/35", "bg-yellow/10", "text-fg");
    expect(
      within(row).getByText("Targets are paused because the budget was reached."),
    ).toBeInTheDocument();
    expect(within(row).getByText("Blocked").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "attention",
    );
    expect(within(row).getByRole("link", { name: "Edit budget" })).toHaveAttribute(
      "href",
      "/app/prj_story/settings/usage?budget=edit",
    );
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("shows one Manage schedules action without a budget line", () => {
    renderRuns("planned");

    expect(screen.queryByText(/Budget:/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Manage schedules" })).toHaveLength(1);
  });

  it("moves a skipped occurrence from Planned to History", async () => {
    const skipped = {
      ...plannedRun,
      finishedAt: "2026-09-05T06:05:00.000Z",
      skippedBy: { name: "Anna Kowalska" },
      status: "cancelled" as const,
    };
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ data: skipped }));
    vi.stubGlobal("fetch", fetch);
    renderRuns("planned");

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Skip once" })[0] as HTMLElement);
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.queryByTestId(`planned-row-${skipped.id}`)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "History" }));
    expect(screen.getByText("Skipped").closest("[data-status-chip-tone]")).toHaveAttribute(
      "data-status-chip-tone",
      "neutral",
    );
    expect(screen.getByText("Skipped by Anna Kowalska · never sent")).toBeInTheDocument();
  });

  it("wiring: renders budget notices on the runs surface", () => {
    render(
      <RunsSection
        budgetExhausted
        budgetSettingsHref="/app/prj_story/settings/usage?budget=edit"
        initialHistory={historyPage}
        initialPlanned={plannedPage}
        notices={[
          {
            budgetSettingsHref: "/app/prj_story/settings/usage?budget=edit",
            capPeriod: "2026-09",
            kind: "budget-exhausted",
          },
        ]}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    expect(screen.getByLabelText("Run notices")).toBeInTheDocument();
    expect(
      screen.getByText("Targets are paused because the budget was reached."),
    ).toBeInTheDocument();
  });

  it("plan criterion: keyset Load more", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { next_cursor: null } }));
    vi.stubGlobal("fetch", fetch);
    renderRuns();

    expect(screen.getByText("Showing 1 - more available")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load 20 more" }));
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(String(fetch.mock.calls[0]?.[0])).toContain("segment=history");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("cursor=history-cursor");
  });

  it("uses the cursor count copy only when more History is available", () => {
    render(
      <RunsSection
        initialHistory={{
          data: Array.from({ length: 20 }, (_, index) => ({
            ...historyRun,
            id: `rcr_history_${index}`,
          })),
          nextCursor: "history-cursor",
        }}
        initialPlanned={plannedPage}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    expect(screen.getByText("Showing 20 - more available")).toBeInTheDocument();
  });

  it("plan criterion: grid time 80 / title flex / actions 200, vertically centered", () => {
    renderRuns("planned");

    const row = screen.getByTestId(`planned-row-${plannedPage.data[0]?.id}`);
    expect(row).toHaveClass("grid", "grid-cols-[80px_minmax(0,1fr)_200px]", "items-center");
  });

  it("uses count copy and the planned empty copy", () => {
    render(
      <RunsSection
        initialHistory={{ data: [], nextCursor: null }}
        initialPlanned={{ data: [], nextCursor: null }}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    expect(screen.getByText("0 runs")).toBeInTheDocument();
    expect(screen.getByText("Newest first")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No runs yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Runs appear here when a run starts - manually, from a schedule, or through the API.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.queryByText("0 planned runs")).not.toBeInTheDocument();
    const emptyCopy = screen.getByText("No scheduled runs are due in the next 7 days.");
    expect(emptyCopy).toBeInTheDocument();
    expect(emptyCopy.closest("section")?.querySelectorAll(".border-t")).toHaveLength(1);
  });

  it("pluralizes History and Planned run counts", () => {
    const one = render(
      <RunsSection
        initialHistory={{ data: [historyRun], nextCursor: null }}
        initialPlanned={{ data: plannedPage.data.slice(0, 1), nextCursor: null }}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    expect(screen.getByText("1 run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByText("1 planned run")).toBeInTheDocument();

    one.unmount();
    render(
      <RunsSection
        initialHistory={{
          data: [historyRun, { ...historyRun, id: "rcr_history_0002" }],
          nextCursor: null,
        }}
        initialPlanned={{ data: plannedPage.data, nextCursor: null }}
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    expect(screen.getByText("2 runs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByText("2 planned runs")).toBeInTheDocument();
  });

  it("does not render a budget-blocked row without an allocation", () => {
    render(
      <RunsSection
        initialHistory={historyPage}
        initialPlanned={plannedPage}
        initialSegment="planned"
        projectRef="prj_story"
        schedulesHref="/app/prj_story/runs/schedules"
      />,
    );

    const row = screen.getByTestId(`planned-row-${blockedRun.id}`);
    expect(
      within(row).queryByText("Targets are paused because the budget was reached."),
    ).toBeNull();
    expect(within(row).queryByRole("link", { name: "Edit budget" })).toBeNull();
  });
});
