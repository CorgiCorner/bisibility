import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEditorMembers } from "./ScheduleEditorMembers";

describe("ScheduleEditorMembers", () => {
  it("renders stored and pending members in the existing framed surface", () => {
    render(
      <ScheduleEditorMembers
        memberCount={2}
        onOpenDrawer={vi.fn()}
        pendingMembers={[
          {
            name: "static site generator",
            pending: true,
            publicId: "kw_pending",
            sourceName: "Daily 06:00",
            targetCount: 2,
          },
        ]}
        scheduleName="Commercial daily"
        storedMembers={[{ name: "api first cms", publicId: "kw_stored", targetCount: 3 }]}
      />,
    );

    const table = screen.getByRole("table", { name: "Schedule members" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Keyword", "Checks", "Pending"]);
    expect(within(table).getByText("api first cms")).toBeVisible();
    expect(within(table).getByText("Moves from Daily 06:00")).toBeVisible();
    expect(
      screen.getByText("Saving moves 1 keyword from other schedules into Commercial daily."),
    ).toBeVisible();
  });

  it("preserves the empty state and opens the keyword drawer", () => {
    const onOpenDrawer = vi.fn();
    render(
      <ScheduleEditorMembers
        memberCount={0}
        onOpenDrawer={onOpenDrawer}
        pendingMembers={[]}
        scheduleName="Commercial daily"
        storedMembers={[]}
      />,
    );

    expect(screen.queryByRole("table", { name: "Schedule members" })).not.toBeInTheDocument();
    expect(screen.getByText("No keywords yet. Add some to start scheduled checks.")).toBeVisible();
    screen.getByRole("button", { name: "Add keywords" }).click();
    expect(onOpenDrawer).toHaveBeenCalledOnce();
  });
});
