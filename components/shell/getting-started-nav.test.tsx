import {
  GETTING_STARTED_LABEL,
  gettingStartedProgressAriaLabel,
} from "@/components/getting-started/getting-started-copy";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { appPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppThemeRoot } from "./AppThemeRoot";
import { Sidebar } from "./Sidebar";
import { SidebarNav } from "./SidebarNav";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/shell/SidebarFooter", () => ({ SidebarFooter: () => null }));
vi.mock("@/components/shell/WorkspaceSwitcher", () => ({ WorkspaceSwitcher: () => null }));
vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("getting-started navigation", () => {
  it.each([
    ["incomplete", true],
    ["completed state A", true],
    ["acknowledged state B", false],
  ])("shows mobile navigation for %s only until state B", (_state, visible) => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    render(
      <SidebarNav
        projectRef={projectRef}
        setupDoneCount={visible ? 1 : 4}
        setupSettledCount={visible ? 1 : 4}
        setupTotalCount={4}
        showGettingStarted={visible}
      />,
    );
    expect(Boolean(screen.queryByRole("link", { name: GETTING_STARTED_LABEL }))).toBe(visible);
  });

  it("renders the special entry outside normal nav semantics with a calculated ring", () => {
    setNavigationState({ pathname: appPath(projectRef, "getting-started") });
    const { container, rerender } = render(
      <SidebarNav
        projectRef={projectRef}
        setupDoneCount={1}
        setupSettledCount={1}
        setupTotalCount={4}
        showGettingStarted
      />,
    );
    const setupLink = screen.getByRole("link", { name: GETTING_STARTED_LABEL });

    expect(setupLink).toHaveAttribute("data-getting-started-nav");
    expect(setupLink).toHaveClass("border", "rounded-control", "bg-bg-elev");
    expect(setupLink.querySelector("[data-nav-icon]")).toBeNull();
    expect(setupLink.querySelector(".rounded-full.bg-accent-solid")).toBeNull();
    expect(setupLink.querySelector("[data-progress-arc]")).toHaveAttribute(
      "stroke-dasharray",
      "12.6 50.3",
    );
    expect(container.querySelector(`[data-nav-icon="${GETTING_STARTED_LABEL}"]`)).toBeNull();

    rerender(
      <SidebarNav
        projectRef={projectRef}
        setupDoneCount={3}
        setupSettledCount={3}
        setupTotalCount={4}
        showGettingStarted
      />,
    );
    expect(
      screen
        .getByRole("link", { name: GETTING_STARTED_LABEL })
        .querySelector("[data-progress-arc]"),
    ).toHaveAttribute("stroke-dasharray", "37.7 50.3");
  });

  it("keeps a full progress ring when setup is complete but not acknowledged", () => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    render(
      <SidebarNav
        projectRef={projectRef}
        setupCompleted
        setupDoneCount={4}
        setupSettledCount={4}
        setupTotalCount={4}
        showGettingStarted
      />,
    );

    const link = screen.getByRole("link", { name: GETTING_STARTED_LABEL });
    expect(link.querySelector("[data-setup-complete-indicator]")).toBeNull();
    expect(link.querySelector("[data-progress-arc]")).toHaveAttribute(
      "stroke-dasharray",
      "50.3 50.3",
    );
  });

  it("supports the collapsed setup entry with an accessible progress label", () => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    render(
      <SidebarNav
        collapsed
        projectRef={projectRef}
        setupDoneCount={3}
        setupSettledCount={3}
        setupTotalCount={4}
        showGettingStarted
      />,
    );

    const link = screen.getByRole("link", { name: gettingStartedProgressAriaLabel(3, 4) });
    expect(link).toHaveClass("ml-5.5", "mb-2", "h-9", "w-9");
    expect(link).not.toHaveAttribute("title");
    expect(link.querySelector("[data-progress-ring]")).toHaveAttribute("width", "20");
  });

  it.each([
    ["incomplete", true],
    ["completed state A", true],
    ["acknowledged state B", false],
  ])("shows desktop navigation for %s only until state B", (_state, visible) => {
    setNavigationState({ pathname: appPath(projectRef, "dashboard") });
    render(
      <AppThemeRoot defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={projectRef}
          setupDoneCount={visible ? 4 : 4}
          setupSettledCount={4}
          setupTotalCount={4}
          showGettingStarted={visible}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );
    expect(Boolean(screen.queryByRole("link", { name: GETTING_STARTED_LABEL }))).toBe(visible);
  });
});
