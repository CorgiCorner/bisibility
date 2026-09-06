import { SidebarNav } from "@/components/shell/SidebarNav";
import type { NavBadge, NavContext } from "@/lib/nav/nav-items";
import { appPath, asMarketRef, marketPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/mui-tooltip"));

// Nothing in the real rail carries the `new` tag yet, so its colour branch would otherwise be
// dead code. The override map is empty unless a test fills it, so every other test here still
// renders the real navigation data.
const navBadgeOverrides = vi.hoisted(() => ({}) as Record<string, NavBadge | undefined>);

vi.mock("@/lib/nav/nav-items", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nav/nav-items")>();
  return {
    ...actual,
    // The context is forwarded, not dropped: `navItems` accepts one and can emit market-scoped
    // hrefs from it, so a double that swallowed the argument would hide exactly the regression
    // the market-level test below exists to catch.
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

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("SidebarNav", () => {
  it("keeps disabled experimental rows out of the mobile drawer and restores enabled rows", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    const disabled = render(<SidebarNav enabledExperimentalModules={[]} projectRef="prj_1" />);

    expect(disabled.queryByRole("link", { name: "Timeline" })).not.toBeInTheDocument();
    expect(disabled.queryByRole("link", { name: "Competitors" })).not.toBeInTheDocument();
    disabled.unmount();

    render(
      <SidebarNav enabledExperimentalModules={["timeline", "competitors"]} projectRef="prj_1" />,
    );

    expect(screen.getByRole("link", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Competitors" })).toBeInTheDocument();
  });

  it("makes expanded navigation links span the drawer width", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    render(<SidebarNav enabledExperimentalModules={["competitors"]} projectRef="prj_1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("w-full");
  });

  it("keeps the current-page marker on a market-scoped URL", () => {
    // The market is a level of the SAME destination, so the row that rendered the page must
    // stay marked. Comparing the raw pathname against the project-level href left every row
    // unmarked, which reads as "you are nowhere" rather than as a different page.
    setNavigationState({
      pathname: marketPath("prj_1", asMarketRef("pmkt_one"), "rank-tracker"),
    });
    render(
      <SidebarNav enabledExperimentalModules={["timeline", "competitors"]} projectRef="prj_1" />,
    );

    const current = screen.getByRole("link", { name: "Rank Tracker" });

    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.querySelector("svg")).toHaveAttribute("data-weight", "fill");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("keeps routed drawer links in the current market and unrouted links at project level", () => {
    setNavigationState({
      pathname: marketPath("prj_1", asMarketRef("pmkt_one"), "rank-tracker"),
    });
    render(<SidebarNav enabledExperimentalModules={["competitors"]} projectRef="prj_1" />);

    const current = screen.getByRole("link", { name: "Rank Tracker" });
    expect(current).toHaveAttribute(
      "href",
      marketPath("prj_1", asMarketRef("pmkt_one"), "rank-tracker"),
    );
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Competitors" })).toHaveAttribute(
      "href",
      appPath("prj_1", "competitors"),
    );
  });

  it("keeps account-route drawer links at project level", () => {
    setNavigationState({ pathname: "/app/account/preferences" });
    render(
      <SidebarNav enabledExperimentalModules={["timeline", "competitors"]} projectRef="prj_1" />,
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/app\/prj_1\//u);
      expect(link.getAttribute("href")).not.toContain("/m/");
    }
  });

  it("uses the rising chart and active fill for Search Console", () => {
    setNavigationState({ pathname: appPath("prj_1", "search-console") });
    render(<SidebarNav projectRef="prj_1" />);

    const current = screen.getByRole("link", { name: "Search Console" }).querySelector("svg");
    const other = screen.getByRole("link", { name: "Dashboard" }).querySelector("svg");

    expect(current).toHaveAttribute("data-nav-icon", "Search Console");
    expect(current).toHaveAttribute("data-weight", "fill");
    expect(current?.querySelectorAll("path")).not.toHaveLength(0);
    expect(other).toHaveAttribute("data-weight", "regular");
  });

  it("uses Ranking fill on the active Rank Tracker row", () => {
    setNavigationState({ pathname: appPath("prj_1", "rank-tracker") });
    render(<SidebarNav projectRef="prj_1" />);

    const current = screen.getByRole("link", { name: "Rank Tracker" }).querySelector("svg");
    const other = screen.getByRole("link", { name: "Dashboard" }).querySelector("svg");

    expect(current).toHaveAttribute("data-nav-icon", "Rank Tracker");
    expect(current).toHaveAttribute("data-weight", "fill");
    expect(other).toHaveAttribute("data-weight", "regular");
  });

  it("shows group headings and module tags in the expanded drawer, tags when collapsed", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    const expanded = render(<SidebarNav projectRef="prj_1" />);

    expect(expanded.getByText("Activity")).toBeInTheDocument();
    expect(expanded.getByText("Modules")).toBeInTheDocument();
    expect(expanded.getByText("Project")).toBeInTheDocument();

    const gcsInsights = expanded.getByText("Search Console").closest("a");
    expect(gcsInsights).not.toBeNull();
    expect(within(gcsInsights as HTMLAnchorElement).getByText("alpha")).toHaveClass(
      "inline-flex",
      "flex-none",
      "rounded-full",
      "text-[9.5px]",
      "font-semibold",
    );
    expect(within(gcsInsights as HTMLAnchorElement).getByText("alpha")).not.toHaveClass(
      "font-mono",
    );
    expanded.unmount();

    const collapsed = render(<SidebarNav collapsed projectRef="prj_1" />);
    expect(collapsed.queryByText("Activity")).toBeNull();
    expect(collapsed.queryByText("Modules")).toBeNull();
    expect(collapsed.queryByText("Project")).toBeNull();
    expect(collapsed.getByText("ACTIVITY")).toHaveClass("w-20", "text-center");
    expect(collapsed.getByText("MODULES")).toHaveClass("w-20", "text-center");
    expect(collapsed.getByText("PROJECT")).toHaveClass("w-20", "text-center");
    expect(collapsed.queryByText("alpha")).toBeNull();
  });

  it("keeps group headings inert and on the settled 28px box", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    render(<SidebarNav projectRef="prj_1" />);

    const heading = screen.getByText("Activity");

    // A heading is a caption, not a destination: a focusable or role-bearing element here would
    // put three extra stops in the rail's tab order.
    expect(heading.tagName).toBe("SPAN");
    expect(heading).not.toHaveAttribute("role");
    expect(heading).not.toHaveAttribute("href");
    expect(heading).not.toHaveAttribute("tabindex");
    expect(heading.closest("a")).toBeNull();

    // 14 + 10 + 4 = the 28px box ShellSkeleton reserves. `leading-none` is what pins the line
    // box to the font size - preflight is off, so a UA line-height would make it taller.
    expect(heading).toHaveClass(
      "block",
      "px-[11px]",
      "pt-3.5",
      "pb-1",
      "text-[10px]",
      "leading-none",
    );
  });

  it("keeps every destination inside a group and nothing pinned below them", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    render(<SidebarNav projectRef="prj_1" />);

    // Alerts and Settings used to be an ungrouped block after the last heading. They are now
    // ordinary rows of Activity and Project, still in normal flow and still not pinned.
    const activity = screen.getByText("Activity");
    const alerts = screen.getByRole("link", { name: "Alerts" });
    const project = screen.getByText("Project");
    const settings = screen.getByRole("link", { name: "Settings" });

    expect(activity.compareDocumentPosition(alerts)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(alerts.compareDocumentPosition(project)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(project.compareDocumentPosition(settings)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(alerts.parentElement).not.toHaveClass("mt-auto");
    expect(settings.parentElement).not.toHaveClass("mt-auto");
    // Settings is the last row of the rail, so nothing sits outside the three groups.
    const rows = screen.getAllByRole("link");
    expect(rows[rows.length - 1]).toBe(settings);
  });

  it("renders experimental navigation as an icon with an accessible tooltip", () => {
    navBadgeOverrides.Dashboard = "new";
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    render(
      <SidebarNav enabledExperimentalModules={["timeline", "competitors"]} projectRef="prj_1" />,
    );

    // Text tags are decorative: they must not alter the containing row's accessible name.
    const gcsInsights = screen.getByRole("link", { name: "Search Console" });
    const alpha = within(gcsInsights).getByText("alpha");
    expect(alpha).toHaveAttribute("aria-hidden", "true");
    expect(alpha).toHaveClass("px-[7px]", "py-0.5", "bg-bg-sunken", "text-fg-muted");

    const competitors = screen.getByRole("link", { name: "Competitors" });
    expect(competitors.querySelector("[data-experimental-badge-flask]")).toBeInTheDocument();

    const timeline = screen.getByRole("link", { name: "Timeline" });
    expect(within(timeline).queryByText("experimental")).toBeNull();

    const experimentalTooltip = timeline.querySelector('[data-tooltip="Experimental"]');
    expect(experimentalTooltip).toBeInTheDocument();
    const trigger = experimentalTooltip?.querySelector('[role="img"]');
    expect(trigger).toHaveAttribute("aria-label", "Experimental");
    expect(trigger).toHaveClass(
      "grid",
      "h-[30px]",
      "w-[30px]",
      "shrink-0",
      "place-items-center",
      "text-fg-muted",
      "hover:text-fg",
    );

    const flask = trigger?.firstElementChild;
    expect(flask).toHaveAttribute("data-experimental-badge-flask");
    expect(flask?.tagName).toBe("svg");
    expect(flask).toHaveAttribute("width", "14");
    expect(flask).toHaveAttribute("height", "14");
    expect(flask).toHaveClass("shrink-0", "text-current");
    expect(alpha.querySelector("[data-experimental-badge-flask]")).toBeNull();

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(within(dashboard).getByText("new")).toHaveClass(
      "px-[7px]",
      "py-0.5",
      "bg-accent-soft",
      "text-accent-text",
    );
  });
});
