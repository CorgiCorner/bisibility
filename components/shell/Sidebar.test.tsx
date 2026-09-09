import { applyTheme } from "@/components/shell/set-theme";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import type { NavContext } from "@/lib/nav/nav-items";
import { appPath, asMarketRef, marketPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppThemeRoot } from "./AppThemeRoot";
import { Sidebar } from "./Sidebar";

vi.mock("@/components/shell/SidebarFooter", () => ({
  SidebarFooter: ({ collapsed }: { collapsed: boolean }) => (
    <span data-testid="sidebar-footer">{collapsed ? "icons" : "labels"}</span>
  ),
}));

vi.mock("@/components/shell/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ className, collapsed }: { className?: string; collapsed?: boolean }) => (
    <span className={className} data-testid="workspace-switcher">
      {collapsed ? "icons" : "labels"}
    </span>
  ),
}));

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

// Nothing in the real rail carries the `new` tag yet, so its colour branch would otherwise be
// dead code. The override map is empty unless a test fills it, so every other test in this file
// still renders the real navigation data.
const navBadgeOverrides = vi.hoisted(
  () => ({}) as Record<string, "new" | "alpha" | "beta" | "experimental" | undefined>,
);

vi.mock("@/lib/nav/nav-items", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nav/nav-items")>();
  return {
    ...actual,
    navItems: (
      projectRef: string,
      context?: NavContext,
      enabledExperimentalModules?: readonly ("timeline" | "competitors")[],
    ) =>
      actual
        .navItems(projectRef, context, enabledExperimentalModules)
        .map((item) =>
          item.label in navBadgeOverrides
            ? { ...item, badge: navBadgeOverrides[item.label] }
            : item,
        ),
  };
});

afterEach(() => {
  for (const key of Object.keys(navBadgeOverrides)) {
    delete navBadgeOverrides[key];
  }
});

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
  it("keeps Timeline out of the desktop rail while restoring enabled module rows", () => {
    const disabled = render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={[]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    expect(disabled.queryByRole("link", { name: "Timeline" })).not.toBeInTheDocument();
    expect(disabled.queryByRole("link", { name: "Competitors" })).not.toBeInTheDocument();
    disabled.unmount();

    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    expect(screen.queryByRole("link", { name: "Timeline" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Competitors" })).toBeInTheDocument();
  });

  it("keeps the exact standalone and headed order on the desktop rail", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    expect(screen.queryByText("Activity")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      [
        "dashboard",
        "rank-tracker",
        "competitors",
        "keyword-research",
        "domain-overview",
        "backlinks",
        "search-console",
        "markets",
        "alerts",
        "runs",
        "integrations",
        "install",
        "settings",
      ].map((segment) => appPath(mockWorkspaces[0].publicId, segment)),
    );
  });

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

  it("uses the sidebar expand icon as the collapsed expand control", () => {
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
    expect(expandButton.closest("[data-tooltip]")).toHaveAttribute(
      "data-tooltip",
      "Expand sidebar",
    );
    expect(expandButton).toHaveClass("ml-5.5", "size-9", "cursor-e-resize", "p-0");
    expect(expandButton).not.toHaveClass("h-12", "w-9");
    expect(expandButton).not.toHaveAttribute("aria-haspopup");
    expect(expandButton.querySelector('[data-testid="sidebar-expand-icon"]')).toBeInTheDocument();
    expect(expandButton.querySelector('[data-testid="workspace-tile-favicon"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch project" })).toBeNull();
    expect((expandButton.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(/keywords?/i);

    fireEvent.click(expandButton);

    const expandedSwitcher = screen.getByTestId("workspace-switcher");
    expect(expandedSwitcher).toHaveTextContent("labels");
    const collapseButton = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseButton).toHaveClass("h-[30px]", "w-[30px]", "cursor-w-resize");
    expect(expandedSwitcher).toBeInTheDocument();
  });

  it("keeps the compact header switcher narrow enough for search and collapse", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const switcher = screen.getByTestId("workspace-switcher");
    expect(switcher).toHaveClass("min-w-0", "flex-1");
    expect(screen.getByRole("button", { name: "Search" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  it("places search immediately before collapse while expanded and hides it in the collapsed rail", () => {
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

    const expanded = render(shell(false));
    const search = expanded.getByRole("button", { name: "Search" });
    const collapse = expanded.getByRole("button", { name: "Collapse sidebar" });
    expect(search).toHaveClass(
      "grid",
      "h-[30px]",
      "w-[30px]",
      "place-items-center",
      "p-0",
      "text-fg-muted",
      "transition-colors",
      "hover:bg-bg-sunken",
      "hover:text-fg",
      "focus-visible:-outline-offset-2",
    );
    expect(search).toHaveClass("hover:bg-bg-sunken");
    expect(search.className).not.toMatch(/(?:^|\s)(?:border|border-[^\s]+|bg-bg-elev)(?:\s|$)/);
    expect(search).not.toHaveClass("cursor-w-resize", "cursor-e-resize");
    expect(collapse).toHaveClass(
      "grid",
      "h-[30px]",
      "w-[30px]",
      "cursor-w-resize",
      "place-items-center",
      "rounded-control",
      "p-0",
      "text-fg-muted",
      "transition-colors",
      "hover:bg-bg-sunken",
      "hover:text-fg",
      "focus-visible:-outline-offset-2",
    );
    expect(collapse).toHaveClass("hover:bg-bg-sunken");
    expect(search.compareDocumentPosition(collapse)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expanded.unmount();

    const collapsed = render(shell(true));
    expect(collapsed.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
  });

  it("keeps the current-page marker while the reader is inside a market", () => {
    // A market URL is the same rail destination one level down. Matching the pathname against
    // the project-level href marked nothing at all on every market-scoped page.
    setNavigationState({
      pathname: marketPath(mockWorkspaces[0].publicId, asMarketRef("pmkt_one"), "rank-tracker"),
    });
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const current = screen.getByRole("link", { name: "Rank Tracker" });

    expect(current).toHaveAttribute(
      "href",
      marketPath(mockWorkspaces[0].publicId, asMarketRef("pmkt_one"), "rank-tracker"),
    );
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("font-semibold", "text-fg");
    expect(current.querySelector("svg")).toHaveAttribute("data-weight", "fill");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
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
    expect(current).toHaveClass("font-semibold", "text-fg", "hover:bg-bg-sunken");
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

  it("separates collapsed navigation groups with their 80px tags", () => {
    render(
      <AppThemeRoot data-collapsed="true" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    expect(screen.queryByText("ACTIVITY")).toBeNull();
    for (const [tag, firstRow] of [
      ["MODULES", "Rank Tracker"],
      ["PROJECT", "Markets"],
    ] as const) {
      const tagNode = screen.getByText(tag);
      const row = screen.getByRole("link", { name: firstRow });

      // The collapsed rail is 80px wide, and the tag spans it rather than sitting on the 40px
      // icon axis: it is a caption for the block below, not another tile in the column.
      expect(tagNode).toHaveClass("block", "w-20", "text-center", "pt-3.5", "pb-1");
      expect(row.closest("[class*='flex-col']")).toContainElement(tagNode);
      expect(tagNode.compareDocumentPosition(row)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }

    // The tag box separates the groups in both states now, so the collapsed-only 30px pad that
    // used to stand in for a missing heading is gone.
    expect(
      screen.getByRole("link", { name: "Rank Tracker" }).closest("[class*='flex-col']"),
    ).not.toHaveClass("pt-[30px]");
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
    expect(expanded.container.querySelector("aside")).toHaveClass("p-3.5");
    expect(expanded.getByRole("link", { name: "Dashboard" })).toHaveClass("ml-2.5", "pl-[1px]");
    expect(
      expanded.getByRole("link", { name: "Dashboard" }).querySelector(".w-\\[30px\\]"),
    ).not.toBeNull();
    expanded.unmount();

    // Collapsed: 0 rail padding + 22 row margin + 18 (half the 36px tile) = 40. The margin is
    // explicit rather than mx-auto precisely so the two states cannot drift apart.
    const collapsed = render(shell(true));
    expect(collapsed.container.querySelector("aside")).toHaveClass("px-0", "py-3.5");
    expect(collapsed.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "ml-5.5",
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

  it("makes expanded navigation tooltip wrappers span the row only", () => {
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

    const expanded = render(shell(false));
    const expandedDashboard = expanded.getByRole("link", { name: "Dashboard" });
    expect(expandedDashboard.closest("[data-tooltip]")).toHaveClass("w-full");
    expect(expandedDashboard).toHaveClass("w-full");
    expanded.unmount();

    const collapsed = render(shell(true));
    const collapsedDashboard = collapsed.getByRole("link", { name: "Dashboard" });
    expect(collapsedDashboard.closest("[data-tooltip]")).not.toHaveClass("w-full");
    expect(collapsedDashboard).not.toHaveClass("w-full");
  });

  it("keeps the desktop switcher and navigation spacing intentional", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const switcher = screen.getByTestId("workspace-switcher");
    const dashboardNav = screen.getByRole("link", { name: "Dashboard" }).closest("nav");

    expect(switcher).toHaveTextContent("labels");
    expect(dashboardNav).toHaveClass("mt-4");
  });

  it("orders the switcher before navigation, with the footer last", () => {
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
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    const footer = screen.getByTestId("sidebar-footer");

    expect(switcher.compareDocumentPosition(dashboard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(dashboard.compareDocumentPosition(footer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("uses Ranking fill on the active Rank Tracker row in both rail states", () => {
    function shell(collapsed: boolean, segment: "dashboard" | "rank-tracker") {
      return (
        <AppThemeRoot data-collapsed={collapsed ? "true" : "false"} defaultTheme="light">
          <Sidebar
            activeHref={appPath(mockWorkspaces[0].publicId, segment)}
            activeProjectId={mockWorkspaces[0].id}
            canCreateWorkspace
            projectRef={mockWorkspaces[0].publicId}
            workspaces={mockWorkspaces}
          />
        </AppThemeRoot>
      );
    }

    function rankingIcon(view: ReturnType<typeof render>) {
      return view.getByRole("link", { name: "Rank Tracker" }).querySelector("svg");
    }

    const expandedActive = render(shell(false, "rank-tracker"));
    expect(rankingIcon(expandedActive)).toHaveAttribute("data-nav-icon", "Rank Tracker");
    expect(rankingIcon(expandedActive)).toHaveAttribute("data-weight", "fill");
    expandedActive.unmount();

    const expandedIdle = render(shell(false, "dashboard"));
    expect(rankingIcon(expandedIdle)).toHaveAttribute("data-weight", "regular");
    expandedIdle.unmount();

    const collapsedActive = render(shell(true, "rank-tracker"));
    expect(rankingIcon(collapsedActive)).toHaveAttribute("data-weight", "fill");
    collapsedActive.unmount();

    const collapsedIdle = render(shell(true, "dashboard"));
    expect(rankingIcon(collapsedIdle)).toHaveAttribute("data-weight", "regular");
  });

  it("keeps Dashboard above the two headed groups in desktop and collapsed rails", () => {
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

    const expanded = render(shell(false));
    const modules = expanded.getByText("Modules");
    expect(expanded.queryByText("Activity")).toBeNull();
    expect(expanded.getByText("Modules")).toBeInTheDocument();
    expect(expanded.getByText("Project")).toBeInTheDocument();
    expect(modules.closest("a")).toBeNull();
    expect(modules).not.toHaveAttribute("tabindex");

    // A heading is a caption, not a destination: a focusable or role-bearing element here would
    // put three extra stops in the rail's tab order.
    expect(modules.tagName).toBe("SPAN");
    expect(modules).not.toHaveAttribute("role");
    expect(modules).not.toHaveAttribute("href");
    // 14 + 10 + 4 = the 28px box ShellSkeleton reserves. `leading-none` is what pins the line
    // box to the font size - preflight is off, so a UA line-height would make it taller.
    expect(modules).toHaveClass(
      "block",
      "px-[11px]",
      "pt-3.5",
      "pb-1",
      "text-[10px]",
      "leading-none",
    );
    // What scopes a group covers is in the heading's tooltip, never a subtitle under it.
    expect(modules.closest("[data-tooltip]")).toHaveAttribute(
      "data-tooltip",
      "Market modules follow the selected market. The rest keep their own axis.",
    );
    expect(expanded.queryByText(/^ACTIVITY$/)).toBeNull();

    // The pill lives inside the <a>. Without aria-hidden the row's accessible name becomes
    // "Search Consolebeta", so this query is the guard, not a convenience.
    const gcsInsights = expanded.getByRole("link", { name: "Search Console" });
    const beta = within(gcsInsights).getByText("beta");
    expect(beta).toHaveAttribute("aria-hidden", "true");
    expect(beta).toHaveClass(
      "inline-flex",
      "flex-none",
      "rounded-full",
      "px-[7px]",
      "py-0.5",
      "text-[9.5px]",
      "font-semibold",
      "bg-bg-sunken",
      "text-fg-muted",
    );
    expect(beta).not.toHaveClass("font-mono");
    expanded.unmount();

    const collapsed = render(shell(true));
    expect(collapsed.queryByText("ACTIVITY")).toBeNull();
    expect(collapsed.getByText("MODULES")).toBeInTheDocument();
    expect(collapsed.getByText("PROJECT")).toBeInTheDocument();
    expect(collapsed.queryByText("Activity")).toBeNull();
    expect(collapsed.queryByText("beta")).toBeNull();
    expect(collapsed.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "Dashboard",
      "Rank Tracker",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Search Console",
      "Markets",
      "Alerts",
      "Runs",
      "Integrations",
      "Install",
      "Settings",
    ]);
  });

  it("renders Markets with the folded map and no count, subtitle or hairline", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const markets = screen.getByRole("link", { name: "Markets" });
    expect(markets).toHaveAttribute("href", appPath(mockWorkspaces[0].publicId, "markets"));
    expect(markets.querySelector("svg")).toHaveAttribute("data-nav-icon", "Markets");
    expect(markets).toHaveTextContent("Markets");
    // No count anywhere in the rail, and no rule drawn between the groups.
    const nav = markets.closest("nav") as HTMLElement;
    expect(nav.textContent).not.toMatch(/\d/u);
    expect(nav.querySelectorAll("hr, [role='separator']")).toHaveLength(0);
    for (const group of nav.querySelectorAll("[data-rail-group-heading]")) {
      const container = group.closest("[class*='flex-col']") as HTMLElement;
      expect(container.className).not.toMatch(/border|divide/u);
    }
  });

  it("marks Install current and fills only its glyph", () => {
    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeHref={appPath(mockWorkspaces[0].publicId, "install")}
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const install = screen.getByText("Install").closest("a");
    const dashboard = screen.getByRole("link", { name: "Dashboard" });

    expect(install).toHaveAttribute("aria-current", "page");
    expect(install?.querySelector("svg")).toHaveAttribute("data-weight", "fill");
    expect(dashboard.querySelector("svg")).toHaveAttribute("data-weight", "regular");
  });

  it("renders the expanded Competitors experimental badge as a Flask tooltip trigger", () => {
    navBadgeOverrides.Dashboard = "new";

    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          enabledExperimentalModules={["timeline", "competitors"]}
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const competitors = screen.getByText("Competitors").closest("a");
    expect(competitors).not.toBeNull();
    expect(within(competitors as HTMLAnchorElement).queryByText("experimental")).toBeNull();

    const experimentalTooltip = competitors?.querySelector('[data-tooltip="Experimental"]');
    expect(experimentalTooltip).toBeInTheDocument();
    const trigger = experimentalTooltip?.querySelector('[role="img"]');
    expect(trigger).toHaveAttribute("aria-label", "Experimental");

    const flask = trigger?.querySelector("[data-experimental-badge-flask]");
    expect(flask).toHaveAttribute("data-weight", "regular");

    const gcsInsights = screen.getByRole("link", { name: "Search Console" });
    expect(within(gcsInsights).getByText("beta")).toHaveClass("bg-bg-sunken", "text-fg-muted");
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(within(dashboard).getByText("new")).toHaveClass("bg-accent-soft", "text-accent-text");
  });

  it("paints the new tag with the accent pair rather than the muted one", () => {
    navBadgeOverrides.Dashboard = "new";

    render(
      <AppThemeRoot data-collapsed="false" defaultTheme="light">
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
      </AppThemeRoot>,
    );

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    const pill = within(dashboard).getByText("new");

    expect(pill).toHaveAttribute("aria-hidden", "true");
    expect(pill).toHaveClass("px-[7px]", "py-0.5", "bg-accent-soft", "text-accent-text");
  });
});
