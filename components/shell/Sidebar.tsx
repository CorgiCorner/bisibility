"use client";

import { useSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarToggleIcon } from "@/components/shell/SidebarToggleIcon";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { BrandLockup } from "@/components/ui";
import { navItems, RAIL_ICON_SIZE } from "@/lib/nav/nav-items";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarProps = {
  version?: string;
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  projectRef: string;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function Sidebar({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  projectRef,
  showHostedLinks = false,
  user,
  version,
  workspaces,
}: Readonly<SidebarProps>) {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(projectRef);
  // Utilities sit at the foot of the rail, the way every comparable tool places them; primary
  // navigation keeps the top so the reading order matches how often each group is used.
  const items = allItems.filter((item) => item.group !== "utility");
  const utilityItems = allItems.filter((item) => item.group === "utility");

  function renderItem(item: (typeof allItems)[number]) {
    const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
    const Icon = item.icon;

    return (
      <Tooltip key={item.href} placement="right" title={collapsed ? item.label : ""}>
        <Link
          aria-current={active ? "page" : undefined}
          // Collapsed drops the visible label, and a closed tooltip contributes no name,
          // so without this a screen reader announces a bare "link" for every tile.
          aria-label={collapsed ? item.label : undefined}
          className={[
            "relative flex items-center rounded-[9px] text-[13.5px] font-medium transition-colors duration-150",
            // The rows are full-bleed in a narrow column, so an outset ring is clipped against
            // the rail edge. Inset keeps the whole indicator on screen.
            "focus-visible:-outline-offset-2",
            // Collapsed, every row is the same 36px square. The explicit 22px margin (not
            // mx-auto) is what holds the icon axis at 40px from the rail edge in both states.
            collapsed
              ? "ml-[22px] h-9 w-9 justify-center p-0"
              : "ml-2.5 h-9 gap-2.5 pr-[11px] pl-[1px]",
            // The current page carries no fill: the row surface belongs to hover alone, and
            // the page marker is the leading dot plus the filled glyph and 600 label - the
            // same vocabulary as the marketing header. Hover therefore composes with the
            // current page instead of replacing it.
            active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg",
            "hover:bg-nav-active active:bg-bg-inset",
          ].join(" ")}
          href={item.href}
        >
          {/* Current-page dot. Always in the DOM with only opacity changing, so navigation
              never relayouts the column. --accent-solid, not --accent: as a non-text
              indicator it needs 3:1 (SC 1.4.11) and holds 4.28:1 over the hover fill.
              It sits in a gutter beside the row, never on it: on the fill it read as part
              of the hover instead of as the page marker. */}
          <span
            aria-hidden
            className={[
              "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent-solid transition-opacity duration-150",
              // The two states start their rows 2px apart (24px expanded, 22px collapsed), so
              // the offsets differ by 2px to land the dot on the SAME screen x - 14px from the
              // rail edge - in both. Row height is 36px in both states too, which is what stops
              // the dot drifting a further 4px down on every row of the list.
              collapsed ? "-left-2" : "-left-2.5",
              active ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
          {/* Same fixed 30px leading slot as SidebarNav and the workspace switcher tile, so
              every icon in the rail shares one vertical axis. */}
          <span className="grid h-[30px] w-[30px] flex-none place-items-center">
            <Icon
              aria-hidden
              className="text-current"
              size={RAIL_ICON_SIZE}
              weight={active ? "fill" : "regular"}
            />
          </span>
          {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        </Link>
      </Tooltip>
    );
  }

  function handleToggle() {
    setCollapsed(!collapsed);
  }

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "sticky top-0 z-50 hidden h-dvh min-h-dvh flex-col overflow-hidden border-r border-border bg-bg-elev lg:flex",
        // Collapsed drops the horizontal padding entirely: the 22px row margin, not the rail
        // padding, is what positions the tile column.
        collapsed ? "px-0 py-[14px]" : "p-[14px]",
      ].join(" ")}
    >
      <div className="flex-none pb-4">
        {collapsed ? (
          // Collapsed there is no room for a control beside the mark, so the mark IS the
          // control: it swaps for the expand glyph under the cursor. p-0 matters - a <button>
          // carries a UA padding of 1px 6px, which shrank the content box to 24px and pushed
          // the 26px mark 6px off the rail's 40px icon axis.
          <Tooltip enterDelay={0} placement="right" title="Expand sidebar">
            <button
              aria-label="Expand sidebar"
              className="group ml-[22px] grid h-12 w-9 cursor-e-resize place-items-center rounded-[9px] p-0 text-fg focus-visible:-outline-offset-2"
              onClick={handleToggle}
              type="button"
            >
              {/* Both marks occupy the SAME grid cell and cross-fade on opacity. Toggling
                  `display` here is what broke the swap before: BrandLockup writes an inline
                  display on its own element, and an inline style outranks a stylesheet rule. */}
              <span className="grid h-9 w-9 flex-none place-items-center">
                <span
                  className="col-start-1 row-start-1 grid place-items-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                  data-testid="sidebar-logo-mark"
                >
                  <BrandLockup markOnly />
                </span>
                <span
                  className="col-start-1 row-start-1 grid h-9 w-9 place-items-center rounded-[9px] bg-nav-active text-fg-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  data-testid="sidebar-expand-mark"
                >
                  <SidebarToggleIcon aria-hidden data-testid="sidebar-expand-icon" />
                </span>
              </span>
            </button>
          </Tooltip>
        ) : (
          // Expanded, the brand is a label and only the tile is a control. It used to be one
          // button spanning the whole row, so the resize cursor sat on the wordmark too and the
          // affordance pointed at something that was not the thing being operated.
          <div className="flex h-12 w-full items-center gap-2.5 px-[11px]">
            {/* Left-flush inside the row's px-[11px], which is what puts the mark in the same
                column as the nav icons and the workspace switcher tile below. */}
            <span
              className="flex h-[30px] flex-none items-center pl-[2px]"
              data-testid="sidebar-logo-mark"
            >
              <BrandLockup />
            </span>
            <button
              aria-label="Collapse sidebar"
              className="ml-auto grid h-[30px] w-[30px] flex-none cursor-w-resize place-items-center rounded-[9px] p-0 text-fg-muted transition-colors hover:bg-nav-active hover:text-fg focus-visible:-outline-offset-2"
              onClick={handleToggle}
              type="button"
            >
              <SidebarToggleIcon aria-hidden data-testid="sidebar-collapse-icon" />
            </button>
          </div>
        )}
      </div>
      {/* The nav region is the only part of the column allowed to give: on a short viewport it
          scrolls and everything around it keeps its size, so the brand, the switcher and the
          version line stay where the user reaches for them. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
        {items.map(renderItem)}
      </nav>
      {/* Utilities live at the foot of the rail. Distance does the separating - a rule here just
          adds a line to a column that already reads as two groups. */}
      <nav className="mt-auto flex flex-none flex-col gap-0.5 pt-4">
        {utilityItems.map(renderItem)}
      </nav>
      {/* The switcher sits at the foot with the other account-level controls; the top of the rail
          belongs to the brand and to navigation. */}
      <WorkspaceSwitcher
        activeProjectId={activeProjectId}
        canCreateWorkspace={canCreateWorkspace}
        collapsed={collapsed}
        workspaces={workspaces}
      />
      <SidebarFooter
        collapsed={collapsed}
        showHostedLinks={showHostedLinks}
        user={user}
        version={version}
      />
    </aside>
  );
}
