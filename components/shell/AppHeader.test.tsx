import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
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
  it("keeps personal activity immediately before the account menu", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        projectRef="prj_example"
        workspaces={[]}
        user={{ name: "Preview", email: "preview@example.com" }}
        accountActions={<a href="/app/account/activity">Activity streak</a>}
      />,
    );
    const activity = screen.getByRole("link", { name: "Activity streak" });
    const account = screen.getByRole("button", { name: "Account menu" });
    expect(activity.parentElement).toHaveClass("hidden", "xl:inline-flex");
    expect(activity.parentElement?.nextElementSibling).toBe(account);
    expect(screen.getByRole("button", { name: "Notifications" }).nextElementSibling).toBe(
      activity.parentElement,
    );
  });
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

    expect(screen.getByTestId("provider-spend").parentElement).toHaveClass("gap-1.5", "sm:gap-2.5");
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
    // Below `sm` only the context takes the second grid row, spanning all three columns.
    expect(slot.parentElement).toHaveClass("col-span-3", "col-start-1", "row-start-2");
  });

  it("keeps the page title on the menu row below the small breakpoint", () => {
    render(
      <AppHeader
        activeProjectId="proj_example"
        canCreateWorkspace={false}
        context={<div data-testid="context-slot">United States</div>}
        projectRef="prj_example"
        workspaces={[]}
      />,
    );

    const cell = screen.getByTestId("header-title-cell");
    expect(cell).toContainElement(screen.getByTestId("header-title"));
    // The flexible middle column of row 1, between the menu button and the utilities.
    expect(cell).toHaveClass("col-start-2", "row-start-1", "min-w-0");
    expect(cell).not.toHaveClass("row-start-2");
    expect(screen.getByRole("banner")).toContainElement(cell);
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
