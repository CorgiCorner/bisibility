"use client";

import { GettingStartedNavLink } from "@/components/shell/GettingStartedNavLink";
import { Tooltip } from "@/components/ui";
import type { NavItem } from "@/lib/nav/nav-items";
import { navItemGroups, navItems, RAIL_ICON_SIZE } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import { FlaskIcon as Flask } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarNavProps = {
  activeHref?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  projectRef: string;
  setupDoneCount?: number;
  setupTotalCount?: number;
  showGettingStarted?: boolean;
};

export function SidebarNav({
  activeHref,
  collapsed = false,
  onNavigate,
  projectRef,
  setupDoneCount = 0,
  setupTotalCount = 4,
  showGettingStarted = false,
}: Readonly<SidebarNavProps>) {
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(projectRef);
  const topItems = allItems.filter((item) => item.group === "top");
  const groupedItems = navItemGroups.map((group) => ({
    ...group,
    items: allItems.filter((item) => item.group === group.id),
  }));
  const utilityItems = allItems.filter((item) => item.group === "utility");

  function renderItem(item: NavItem) {
    const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
    const Icon = item.icon;

    return (
      <Tooltip
        key={`${item.href}:${collapsed ? "collapsed" : "expanded"}`}
        placement="right"
        content={collapsed ? item.label : ""}
      >
        <Link
          aria-current={active ? "page" : undefined}
          aria-label={collapsed || item.badge === "experimental" ? item.label : undefined}
          className={[
            "relative flex items-center rounded-control text-[13.5px] font-medium transition-colors duration-150",
            // Inset ring: full-bleed rows in a narrow column clip an outset one.
            "focus-visible:-outline-offset-2",
            // Height lives in the branches, not the base: two competing h-* utilities resolve by
            // stylesheet order, not by their order in this string. Expanded the row is inset 10px
            // and gives that back as padding, so the icon axis stays at 40px (see Sidebar.tsx).
            collapsed
              ? "ml-5.5 h-9 w-9 justify-center p-0"
              : "ml-2.5 h-9 w-full gap-2.5 pr-[11px] pl-[1px]",
            // No fill on the current page: the row surface belongs to hover, the page
            // marker is the leading dot + filled glyph + 600 label (see Sidebar.tsx).
            active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg",
            "hover:bg-bg-sunken active:bg-bg-inset",
          ].join(" ")}
          href={item.href}
          onClick={onNavigate}
        >
          <span
            aria-hidden
            className={[
              "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent-solid transition-opacity duration-150",
              // The two states start their rows 2px apart (24px expanded, 22px collapsed), so
              // the offsets differ by 2px to put the dot on the SAME screen x - 14px from the
              // rail edge - in both. Row height is 36px in both states too, which is what keeps
              // the dot from drifting further down the list every row.
              collapsed ? "-left-2" : "-left-2.5",
              active ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
          {/* Fixed 30px leading slot. Without it the bare 18px glyph sits flush at the
              row padding, so its centre lands 7px left of the workspace switcher tile
              below it and the rail has no single icon axis. */}
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

  // The drawer shares the rail's grouping data, so mobile cannot reorder the same destinations.
  return (
    <nav className="flex flex-col gap-0.5">
      <div className="flex flex-col gap-0.5">
        {showGettingStarted ? (
          <GettingStartedNavLink
            collapsed={collapsed}
            currentHref={currentHref}
            doneCount={setupDoneCount}
            onNavigate={onNavigate}
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
  );
}
