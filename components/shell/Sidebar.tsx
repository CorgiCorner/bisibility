"use client";

import { CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { GettingStartedNavLink } from "@/components/shell/GettingStartedNavLink";
import { useSidebarCollapsed } from "@/components/shell/SidebarCollapsedState";
import type { ShellUser } from "@/components/shell/SidebarFooter";
import { SidebarFooter } from "@/components/shell/SidebarFooter";
import { SidebarToggleIcon } from "@/components/shell/SidebarToggleIcon";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { Tooltip } from "@/components/ui";
import { navItemGroups, navItems, RAIL_ICON_SIZE } from "@/lib/nav/nav-items";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { FlaskIcon as Flask } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarProps = {
  version?: string;
  activeHref?: string;
  activeProjectId: string;
  canCreateWorkspace: boolean;
  projectRef: string;
  setupDoneCount?: number;
  setupTotalCount?: number;
  showGettingStarted?: boolean;
  showHostedLinks?: boolean;
  user?: ShellUser;
  workspaces: WorkspaceSummary[];
};

export function Sidebar({
  activeHref,
  activeProjectId,
  canCreateWorkspace,
  projectRef,
  setupDoneCount = 0,
  setupTotalCount = 4,
  showGettingStarted = false,
  showHostedLinks = false,
  user,
  version,
  workspaces,
}: Readonly<SidebarProps>) {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(projectRef);
  const topItems = allItems.filter((item) => item.group === "top");
  const groupedItems = navItemGroups.map((group) => ({
    ...group,
    items: allItems.filter((item) => item.group === group.id),
  }));
  const utilityItems = allItems.filter((item) => item.group === "utility");

  function renderItem(item: (typeof allItems)[number]) {
    const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
    const Icon = item.icon;

    return (
      <Tooltip
        key={`${item.href}:${collapsed ? "collapsed" : "expanded"}`}
        placement="right"
        content={collapsed ? item.label : ""}
        wrapperClassName={collapsed ? undefined : "w-full"}
      >
        <Link
          aria-current={active ? "page" : undefined}
          // Collapsed drops the visible label, and a closed tooltip contributes no name,
          // so without this a screen reader announces a bare "link" for every tile.
          aria-label={collapsed ? item.label : undefined}
          className={[
            "relative flex items-center rounded-control text-[13.5px] font-medium transition-colors duration-150",
            // The rows are full-bleed in a narrow column, so an outset ring is clipped against
            // the rail edge. Inset keeps the whole indicator on screen.
            "focus-visible:-outline-offset-2",
            // Collapsed, every row is the same 36px square. The explicit 22px margin (not
            // mx-auto) is what holds the icon axis at 40px from the rail edge in both states.
            collapsed
              ? "ml-5.5 h-9 w-9 justify-center p-0"
              : "ml-2.5 h-9 w-full gap-2.5 pr-[11px] pl-[1px]",
            // The current page carries no fill: the row surface belongs to hover alone, and
            // the page marker is the leading dot plus the filled glyph and 600 label - the
            // same vocabulary as the marketing header. Hover therefore composes with the
            // current page instead of replacing it.
            active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg",
            "hover:bg-bg-sunken active:bg-bg-inset",
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
              data-nav-icon={item.label}
              data-weight={active ? "fill" : "regular"}
              size={RAIL_ICON_SIZE}
              weight={active ? "fill" : "regular"}
            />
          </span>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge === "experimental" ? (
                <Tooltip content="Experimental" placement="top" semantics="description">
                  <span
                    aria-label="Experimental"
                    className="grid h-[30px] w-[30px] shrink-0 place-items-center text-fg-muted transition-colors hover:text-fg"
                    role="img"
                  >
                    <Flask
                      aria-hidden
                      className="shrink-0 text-current"
                      data-experimental-badge-flask
                      data-weight="regular"
                      size={14}
                      weight="regular"
                    />
                  </span>
                </Tooltip>
              ) : item.badge ? (
                <span
                  // Decorative status, and the row's accessible name is the label alone: without
                  // this the expanded link announces as "Search Consolealpha".
                  aria-hidden
                  className={[
                    "inline-flex flex-none items-center rounded-full px-[7px] py-0.5 font-mono text-[9.5px] font-semibold",
                    item.badge === "new"
                      ? "bg-accent-soft text-accent-text"
                      : "bg-nav-active text-fg-muted",
                  ].join(" ")}
                >
                  {item.badge}
                </span>
              ) : null}
            </>
          )}
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
        collapsed ? "px-0 py-3.5" : "p-3.5",
      ].join(" ")}
    >
      <div className="flex-none">
        {collapsed ? (
          <Tooltip placement="right" content="Expand sidebar">
            <button
              aria-label="Expand sidebar"
              className="ml-5.5 grid size-9 cursor-e-resize place-items-center rounded-control p-0 text-fg transition-colors hover:bg-bg-sunken focus-visible:-outline-offset-2"
              onClick={handleToggle}
              type="button"
            >
              <SidebarToggleIcon aria-hidden data-testid="sidebar-expand-icon" />
            </button>
          </Tooltip>
        ) : (
          <div className="flex h-9 w-full items-center gap-2 px-[11px]">
            <WorkspaceSwitcher
              activeProjectId={activeProjectId}
              canCreateWorkspace={canCreateWorkspace}
              className="mt-0 min-w-0 flex-1"
              collapsed={collapsed}
              compact
              workspaces={workspaces}
            />
            <div className="ml-auto flex flex-none items-center gap-2">
              <CommandPaletteTrigger variant="sidebar" />
              <button
                aria-label="Collapse sidebar"
                className="grid h-[30px] w-[30px] flex-none cursor-w-resize place-items-center rounded-control p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:-outline-offset-2"
                onClick={handleToggle}
                type="button"
              >
                <SidebarToggleIcon aria-hidden data-testid="sidebar-collapse-icon" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* The nav region is the only part of the column allowed to give: on a short viewport it
          scrolls and everything around it keeps its size, so the brand, the switcher and the
          version line stay where the user reaches for them. */}
      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
        <div className="flex flex-col gap-0.5">
          {showGettingStarted ? (
            <GettingStartedNavLink
              collapsed={collapsed}
              currentHref={currentHref}
              doneCount={setupDoneCount}
              projectRef={projectRef}
              totalCount={setupTotalCount}
            />
          ) : null}
          {topItems.map(renderItem)}
        </div>
        {groupedItems.map((group) => (
          <div className={`flex flex-col gap-0.5 ${collapsed ? "pt-[30px]" : ""}`} key={group.id}>
            {/* 14 + 10 + 4 = a 28px heading box. `block` and `leading-none` pin the line box to
                the 10px font size; preflight is off (app/styles/base-reset.css), so without them
                a UA line-height makes the settled heading taller than its ShellSkeleton
                placeholder and the rail shifts on hydration. */}
            {collapsed ? null : (
              <span className="block px-[11px] pt-3.5 pb-1 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.5px] text-fg-muted">
                {group.label}
              </span>
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
        <div className="flex flex-col gap-0.5 pt-4">{utilityItems.map(renderItem)}</div>
      </nav>
      <SidebarFooter
        collapsed={collapsed}
        showBrand
        showHostedLinks={showHostedLinks}
        user={user}
        version={version}
      />
    </aside>
  );
}
