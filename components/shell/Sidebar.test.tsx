import { applyTheme } from "@/components/shell/set-theme";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { appPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppThemeRoot } from "./AppThemeRoot";
import { Sidebar } from "./Sidebar";

vi.mock("@/components/shell/SidebarFooter", () => ({
  SidebarFooter: ({ collapsed }: { collapsed: boolean }) => (
    <span data-testid="sidebar-footer">{collapsed ? "icons" : "labels"}</span>
  ),
}));

vi.mock("@/components/shell/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ collapsed }: { collapsed: boolean }) => (
    <span data-testid="workspace-switcher">{collapsed ? "icons" : "labels"}</span>
  ),
}));

vi.mock("@mui/material/Tooltip", () => import("@/tests/mui-tooltip"));

// Forwards the rest of the props: the row's aria-current and className are what the
// current-page indicator is asserted through, and a href-only stub silently drops them.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_1/dashboard" });
});

describe("Sidebar", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
    document.cookie = "theme=light; path=/";
    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
  });

  it("keeps the shell width and content collapsed through theme and shell re-renders", () => {
    function shell(sessionKey: string, defaultTheme: "dark" | "light") {
      return (
        <AppThemeRoot
          data-collapsed="false"
          data-shell-root
          data-testid="shell-root"
          defaultTheme={defaultTheme}
        >
          <div key={sessionKey}>
            <Sidebar
              activeProjectId={mockWorkspaces[0].id}
              canCreateWorkspace
              projectRef={mockWorkspaces[0].publicId}
              workspaces={mockWorkspaces}
            />
          </div>
        </AppThemeRoot>
      );
    }

    const { rerender } = render(shell("project-a", "light"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByTestId("shell-root")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("bisibility")).not.toBeInTheDocument();

    // SessionSpendProvider remounts this subtree when the active workspace changes.
    rerender(shell("project-b", "dark"));

    act(() => applyTheme("dark"));

    expect(screen.getByTestId("shell-root")).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("shell-root")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("bisibility")).not.toBeInTheDocument();
  });

  it("keeps the collapsed logo visible until hover reveals the expand affordance", () => {
    function shell(collapsed: boolean) {
      return (
        <AppThemeRoot data-collapsed={collapsed ? "true" : "false"} defaultTheme="light">
          <Sidebar
            activeProjectId={mockWorkspaces[0].id}
            canCreateWorkspace
            projectRef={mockWorkspaces[0].publicId}
            workspaces={mockWorkspaces}
          />
        </AppThemeRoot>
      );
    }

    render(shell(true));

    const expandButton = screen.getByRole("button", { name: "Expand sidebar" });
    const logoMark = screen.getByTestId("sidebar-logo-mark");
    const expandMark = screen.getByTestId("sidebar-expand-mark");
    expect(expandButton.closest("[data-tooltip]")).toHaveAttribute(
      "data-tooltip",
      "Expand sidebar",
    );
    expect(expandButton.closest("[data-tooltip]")).toHaveAttribute(
      "data-tooltip-placement",
      "right",
    );
    expect(expandButton.closest("[data-tooltip]")).toHaveAttribute("data-tooltip-enter-delay", "0");
    expect(expandButton).toHaveClass("group");
    expect(expandButton).toHaveClass("h-12", "w-9", "cursor-e-resize");
    // Both marks share one grid cell and cross-fade on opacity. `display` toggling is banned
    // here: BrandLockup carries an inline display that outranks a stylesheet rule, so a
    // `hidden`/`group-hover:grid` swap silently stops working.
    expect(logoMark).not.toHaveClass("hidden");
    expect(logoMark).toHaveClass(
      "col-start-1",
      "row-start-1",
      "group-hover:opacity-0",
      "group-focus-visible:opacity-0",
    );
    expect(expandMark).toHaveClass(
      "col-start-1",
      "row-start-1",
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-visible:opacity-100",
    );
    expect(expandMark).not.toHaveClass("hidden");
    expect(screen.getByTestId("sidebar-expand-icon")).toBeInTheDocument();

    fireEvent.click(expandButton);

    // Expanded, the brand is a label and only the 30px tile is the control: the resize cursor
    // has to sit on the thing it operates, not on the wordmark next to it.
    const collapseButton = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseButton).toHaveClass("h-[30px]", "w-[30px]", "cursor-w-resize");
    expect(collapseButton.closest("[data-tooltip]")).toBeNull();
    expect(screen.getByTestId("sidebar-logo-mark").closest("button")).toBeNull();
    expect(screen.getByText("bisibility")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-logo-mark")).not.toHaveClass("group-hover:opacity-0");
    expect(screen.queryByTestId("sidebar-expand-mark")).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar-collapse-icon")).toBeInTheDocument();
  });

  it("marks the current page with a dot that is always mounted, and never with a fill", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeHref={appPath(mockWorkspaces[0].publicId, "dashboard")}
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const current = screen.getByRole("link", { name: "Dashboard" });
    const other = screen.getByRole("link", { name: "Rank Tracker" });

    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("font-semibold", "text-fg", "hover:bg-nav-active");
    // A tinted row would make the current page a second surface competing with hover.
    expect(current.className).not.toContain("bg-accent-soft");
    // Pressed state reuses --bg-inset; the ring is inset because the rows are full-bleed.
    expect(current).toHaveClass("active:bg-bg-inset", "focus-visible:-outline-offset-2");

    // The dot is mounted on EVERY row and only its opacity changes, so navigating never
    // relayouts the column.
    for (const row of [current, other]) {
      const dot = row.querySelector("span[aria-hidden]");
      expect(dot).toHaveClass("h-1.5", "w-1.5", "bg-accent-solid", "-left-2.5");
    }
    expect(current.querySelector("span[aria-hidden]")).toHaveClass("opacity-100");
    expect(other.querySelector("span[aria-hidden]")).toHaveClass("opacity-0");
  });

  it("holds the icon axis at 40px from the rail edge in both states", () => {
    function shell(collapsed: boolean) {
      return (
        <AppThemeRoot data-collapsed={collapsed ? "true" : "false"} defaultTheme="light">
          <Sidebar
            activeProjectId={mockWorkspaces[0].id}
            canCreateWorkspace
            projectRef={mockWorkspaces[0].publicId}
            workspaces={mockWorkspaces}
          />
        </AppThemeRoot>
      );
    }

    // Expanded: 14 rail padding + 10 row margin + 1 row padding + 15 (half the 30px leading
    // slot) = 40. The row is inset by its margin and gives the same 10px back as a smaller
    // left padding, so the hover fill clears the current-page dot without moving the axis.
    const expanded = render(shell(false));
    expect(expanded.container.querySelector("aside")).toHaveClass("p-[14px]");
    expect(expanded.getByRole("link", { name: "Dashboard" })).toHaveClass("ml-2.5", "pl-[1px]");
    expect(
      expanded.getByRole("link", { name: "Dashboard" }).querySelector(".w-\\[30px\\]"),
    ).not.toBeNull();
    expanded.unmount();

    // Collapsed: 0 rail padding + 22 row margin + 18 (half the 36px tile) = 40. The margin is
    // explicit rather than mx-auto precisely so the two states cannot drift apart.
    const collapsed = render(shell(true));
    expect(collapsed.container.querySelector("aside")).toHaveClass("px-0", "py-[14px]");
    expect(collapsed.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "ml-[22px]",
      "h-9",
      "w-9",
      "p-0",
    );

    // The dot lands on the same screen x in both states. The rows start 2px apart, so the
    // offsets differ by 2px; equal row heights keep it from drifting further on every row.
    expect(
      collapsed.getByRole("link", { name: "Dashboard" }).querySelector("span[aria-hidden]"),
    ).toHaveClass("-left-2");
  });

  it("keeps the switcher below the utility group and the version line last", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          version="9.9.9"
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const switcher = screen.getByTestId("workspace-switcher");
    const footer = screen.getByTestId("sidebar-footer");
    const settings = screen.getByRole("link", { name: "Settings" });

    expect(settings.compareDocumentPosition(switcher)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(switcher.compareDocumentPosition(footer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
