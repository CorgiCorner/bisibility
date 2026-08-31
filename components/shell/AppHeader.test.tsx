import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

vi.mock("./AppHeaderTitle", () => ({
  AppHeaderTitle: () => <div>Header title</div>,
}));
vi.mock("./CommandPalette", () => ({
  CommandPaletteTrigger: ({ variant }: { variant?: string }) => (
    <button data-variant={variant} type="button">
      Search
    </button>
  ),
}));
vi.mock("./MobileNav", () => ({
  MobileNav: () => <button type="button">Navigation</button>,
}));
vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));

describe("AppHeader", () => {
  it("keeps 24px between provider spend and the utility controls", () => {
    render(
      <AppHeader
        actions={<div data-testid="provider-spend">Provider spend</div>}
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="project-example"
        workspaces={[]}
      />,
    );

    expect(screen.getByTestId("provider-spend").parentElement).toHaveClass("gap-6");
    expect(screen.getByTestId("provider-spend").parentElement).not.toHaveClass("gap-5");
  });

  it("keeps the search trigger available only below the desktop breakpoint", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="project-example"
        workspaces={[]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Search" });
    expect(trigger.parentElement).toHaveClass("lg:hidden");
    expect(trigger).toHaveAttribute("data-variant", "header");
  });
});
