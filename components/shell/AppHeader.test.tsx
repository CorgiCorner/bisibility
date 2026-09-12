import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));
vi.mock("./AppHeaderTitle", () => ({
  AppHeaderTitle: () => <div data-testid="header-title">Header title</div>,
}));
vi.mock("./CommandPalette", () => ({
  CommandPaletteTrigger: ({ variant }: { variant?: string }) => (
    <button data-variant={variant} type="button">
      Search
    </button>
  ),
}));
vi.mock("./MobileNav", () => ({
  MobileNav: ({
    enabledExperimentalModules,
    setupDoneCount,
    setupTotalCount,
  }: {
    enabledExperimentalModules?: readonly string[];
    setupDoneCount?: number;
    setupTotalCount?: number;
  }) => (
    <button
      data-enabled-modules={enabledExperimentalModules?.join(",") ?? ""}
      data-setup-progress={`${setupDoneCount}/${setupTotalCount}`}
      type="button"
    >
      Navigation
    </button>
  ),
}));
vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));

describe("AppHeader", () => {
  it("threads setup progress into mobile navigation", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="prj_example"
        setupDoneCount={3}
        setupTotalCount={4}
        showGettingStarted
        workspaces={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Navigation" })).toHaveAttribute(
      "data-setup-progress",
      "3/4",
    );
  });

  it("threads enabled experimental modules into mobile navigation", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        enabledExperimentalModules={["timeline"]}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Navigation" })).toHaveAttribute(
      "data-enabled-modules",
      "timeline",
    );
  });

  it("keeps the spend pill close to the utility controls", () => {
    render(
      <AppHeader
        actions={<div data-testid="provider-spend">Provider spend</div>}
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    expect(screen.getByTestId("provider-spend").parentElement).toHaveClass("gap-2.5");
    expect(screen.getByTestId("provider-spend").parentElement).not.toHaveClass("gap-6");
  });

  it("keeps the search trigger available only below the desktop breakpoint", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Search" });
    expect(trigger.parentElement).toHaveClass("lg:hidden");
    expect(trigger).toHaveAttribute("data-variant", "header");
  });
  it("puts the context selects immediately after the page title", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        context={<div data-testid="context-slot">United States</div>}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    const title = screen.getByTestId("header-title");
    const slot = screen.getByTestId("context-slot");
    expect(title.compareDocumentPosition(slot)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(title.parentElement).toContainElement(slot);
  });

  it("renders no context slot when the route matched none", () => {
    // The account layout mounts this same header for three routes that have no context, and
    // every project-scoped route matches a slot default that renders nothing.
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    expect(screen.queryByTestId("context-slot")).toBeNull();
    expect(screen.queryByRole("group", { name: "Change context" })).toBeNull();
  });
});
