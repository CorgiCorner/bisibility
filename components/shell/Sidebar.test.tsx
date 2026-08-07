import { applyTheme } from "@/components/shell/set-theme";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
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

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/app/prj_1/overview" }));

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
    expect(logoMark).not.toHaveClass("hidden");
    expect(logoMark).toHaveClass("group-hover:hidden");
    expect(expandMark).toHaveClass("hidden", "group-hover:grid");

    fireEvent.click(expandButton);

    const collapseButton = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseButton.closest("[data-tooltip]")).toHaveAttribute("data-tooltip", "");
    expect(collapseButton.closest("[data-tooltip]")).toHaveAttribute(
      "data-tooltip-placement",
      "right",
    );
    expect(screen.getByText("bisibility")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-logo-mark")).not.toHaveClass("group-hover:hidden");
    expect(screen.queryByTestId("sidebar-expand-mark")).not.toBeInTheDocument();
  });
});
