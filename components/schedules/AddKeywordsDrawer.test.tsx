import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AddKeywordsDrawer, type ScheduleKeywordCandidate } from "./AddKeywordsDrawer";

const candidates: ScheduleKeywordCandidate[] = [
  {
    device: "Mobile",
    id: "kw_content",
    keyword: "contentful alternative",
    market: "Spain",
    tags: ["commercial"],
    checks: "2",
  },
  {
    device: "Desktop",
    id: "kw_headless",
    keyword: "headless cms",
    market: "Spain",
    sourceName: "Daily 06:00",
    tags: ["commercial", "product"],
    checks: "2",
  },
  {
    assigned: true,
    device: "Desktop",
    id: "kw_assigned",
    keyword: "cms comparison chart",
    market: "United Kingdom",
    tags: ["docs"],
    checks: "2",
  },
];

function renderDrawer(overrides: Partial<ComponentProps<typeof AddKeywordsDrawer>> = {}) {
  const assignKeywordsAction = vi.fn().mockResolvedValue({ updated: 2 });
  const onClose = vi.fn();
  render(
    <AddKeywordsDrawer
      assignKeywordsAction={assignKeywordsAction}
      candidates={candidates}
      onClose={onClose}
      open
      projectId="prj_abcdefghijklmnopqrstuvwx"
      scheduleId="sch_abcdefghijklmnopqrstuvwx"
      scheduleName="Daily 06:00"
      {...overrides}
    />,
  );
  return { assignKeywordsAction, onClose };
}

describe("AddKeywordsDrawer", () => {
  it("provides search plus Tag, Market, and Device controls", () => {
    renderDrawer();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search keywords" }), {
      target: { value: "contentful" },
    });

    expect(screen.getByText("contentful alternative")).toBeVisible();
    expect(screen.queryByText("headless cms")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tag" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Market" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Device" })).toBeVisible();
  });

  it("shows the filter note only with an active filter", () => {
    const { unmount } = render(
      <AddKeywordsDrawer
        candidates={candidates}
        onClose={() => undefined}
        open
        projectId="prj_abcdefghijklmnopqrstuvwx"
        scheduleId="sch_abcdefghijklmnopqrstuvwx"
        scheduleName="Daily 06:00"
      />,
    );

    expect(screen.queryByText(/New keywords will not join automatically/)).not.toBeInTheDocument();

    unmount();
    render(
      <AddKeywordsDrawer
        candidates={candidates}
        initialFilters={{ tag: "commercial" }}
        onClose={() => undefined}
        open
        projectId="prj_abcdefghijklmnopqrstuvwx"
        scheduleId="sch_abcdefghijklmnopqrstuvwx"
        scheduleName="Daily 06:00"
      />,
    );

    expect(
      screen.getByText("Matches 2 now. New keywords will not join automatically."),
    ).toBeVisible();
  });

  it("shows checks and each keyword membership state", () => {
    renderDrawer();

    expect(screen.getAllByText("2 checks")).toHaveLength(3);
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.getByText("on Daily 06:00")).toBeVisible();
    expect(screen.getByText("Already here")).toBeVisible();
  });

  it("selects all N matching and Clear removes the selection", () => {
    renderDrawer({ initialFilters: { tag: "commercial" } });

    fireEvent.click(screen.getByRole("button", { name: "Select all 2 matching" }));

    expect(screen.getByRole("button", { name: "Clear selection (2)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "All" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Selected (2)" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Selected (2)" })).not.toBeInTheDocument();
  });

  it("submits selected keywords through the audited schedule membership action", async () => {
    const { assignKeywordsAction, onClose } = renderDrawer({
      initialFilters: { tag: "commercial" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Select all 2 matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 keywords" }));

    await waitFor(() =>
      expect(assignKeywordsAction).toHaveBeenCalledWith({
        keywordIds: ["kw_content", "kw_headless"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        scheduleId: "sch_abcdefghijklmnopqrstuvwx",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Choose keywords to add to this schedule.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add keywords" })).toBeDisabled();
  });

  it("clears selection when the drawer closes before reopening", () => {
    const { onClose } = renderDrawer({ initialFilters: { tag: "commercial" } });

    fireEvent.click(screen.getByRole("button", { name: "Select all 2 matching" }));
    expect(screen.getByRole("button", { name: "Add 2 keywords" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("Choose keywords to add to this schedule.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add keywords" })).toBeDisabled();
  });
});
