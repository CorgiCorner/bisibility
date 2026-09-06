// Static shape of the app shell for the loading boundaries that sit ABOVE it.
//
// The shell is rendered by app/app/(workspace)/[project]/layout.tsx (and the account
// layout), so every `loading.tsx` at or above app/app renders OUTSIDE it: a boundary only
// covers its segment's page and the tree below, never the layouts that enclose it. Without
// this shape a cold load drops the sidebar and header entirely and the navigation reads as
// a full page reload.
//
// Shape convention follows OverviewSkeleton: the chrome frames are real frames (the same
// border, fill and radius as the settled shell) and only the blocks INSIDE them pulse, so
// the geometry does not move when data lands.
//
// This is a picture of the shell, not a working one: no links, no nav labels, no client
// components. The row counts come from the real rail so the two cannot drift.

import { navItemGroups, navItems } from "@/lib/nav/nav-items";
import { Fragment, type ReactNode } from "react";

// The boundary has no project yet, so the rail is built against the literal route pattern.
// Only the row counts are used - the hrefs and labels are discarded.
const railRows = navItems("[project]");
const groupedRailRows = navItemGroups.map((group) => ({
  ...group,
  rows: railRows
    .filter((item) => item.group === group.id)
    .map((_, index) => `${group.id}-${index}`),
}));

function Block({ className }: Readonly<{ className?: string }>) {
  return <div className={`animate-pulse rounded-control bg-bg-sunken ${className ?? ""}`} />;
}

function RailRow({ collapsed }: Readonly<{ collapsed: boolean }>) {
  // Both states are a 36px row on the same 40px icon axis: collapsed a tile held by the
  // explicit 22px margin, expanded a row inset 10px that gives the same 10px back as padding.
  // The skeleton has to match, or the shell visibly resizes the moment it hydrates.
  if (collapsed) {
    return <Block className="ml-5.5 h-9 w-9" />;
  }

  return (
    <div className="ml-2.5 flex h-9 items-center gap-2.5 pr-[11px] pl-[1px]">
      <div className="grid h-[30px] w-[30px] flex-none place-items-center">
        <Block className="h-[18px] w-[18px] rounded-control" />
      </div>
      <Block className="h-3.5 w-[92px] max-w-full" />
    </div>
  );
}

function RailHeading({ collapsed }: Readonly<{ collapsed: boolean }>) {
  // Same 28px box as the settled group heading, in both states: 14px top padding, a 10px line
  // box (the heading's `text-[10px] leading-none`, mirrored here as the block's height), 4px
  // bottom. Collapsed the settled heading is the group's tag across the full 80px rail, so the
  // placeholder centres its block in the same width instead of disappearing.
  return (
    <div
      className={collapsed ? "flex w-20 justify-center pt-3.5 pb-1" : "px-[11px] pt-3.5 pb-1"}
      data-testid="shell-skeleton-nav-heading"
    >
      <Block className="h-2.5 w-10" />
    </div>
  );
}

function SidebarSkeleton({ collapsed }: Readonly<{ collapsed: boolean }>) {
  return (
    <div
      className={[
        "sticky top-0 z-50 hidden h-dvh min-h-dvh flex-col overflow-hidden border-r border-border bg-bg-elev lg:flex",
        collapsed ? "px-0 py-3.5" : "p-3.5",
      ].join(" ")}
      data-testid="shell-skeleton-sidebar"
    >
      {/* Order mirrors the settled rail: top control, switcher, scrollable nav, footer. */}
      <div className="flex-none">
        {collapsed ? (
          <div className="ml-5.5 grid h-12 w-9 place-items-center">
            <Block className="h-5 w-5 rounded-control" />
          </div>
        ) : (
          <div className="flex h-12 w-full items-center px-[11px]">
            <Block className="ml-auto h-[30px] w-[30px] flex-none rounded-control" />
          </div>
        )}
      </div>
      {collapsed ? null : (
        <div className="mt-3 flex h-11 w-full items-center gap-2.5 px-[11px]">
          <Block className="h-5 w-5 flex-none rounded-control" />
          <Block className="h-3.5 min-w-0 flex-1" />
          <Block className="h-3 w-3 flex-none rounded-control" />
        </div>
      )}
      {/* Only the nav region gives; the footer is the only pinned area. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {groupedRailRows.map((group) => (
          <Fragment key={group.id}>
            <RailHeading collapsed={collapsed} />
            {group.rows.map((key) => (
              <RailRow collapsed={collapsed} key={key} />
            ))}
          </Fragment>
        ))}
      </div>
      <div
        className={`flex flex-none items-center pt-2 ${collapsed ? "justify-center" : "justify-between px-[11px]"}`}
      >
        <Block className="h-[18px] w-[18px] rounded-control" />
        <Block className="ml-auto h-2.5 w-9 rounded-control" />
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div
      className="relative z-40 flex flex-nowrap items-center justify-between gap-2.5 border-b border-border bg-bg px-4 py-3 sm:gap-4 sm:px-5 lg:px-7 lg:py-3.5"
      data-testid="shell-skeleton-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <Block className="h-[42px] w-[42px] flex-none rounded-card lg:hidden" />
        <div className="min-w-0 flex-1">
          <Block className="h-[22px] w-[180px] max-w-full sm:h-[26px]" />
          <Block className="mt-1 hidden h-[15px] w-[260px] max-w-full sm:block" />
        </div>
      </div>
      {/* Right cluster order matches AppHeader: [actions] [search][bell][account]. */}
      <div className="flex flex-none items-center gap-6">
        <div className="hidden min-w-[210px] flex-none pt-[3px] md:block">
          <Block className="h-2.5 w-[104px] rounded-control" />
          <Block className="mt-1 h-3 w-[150px] rounded-control" />
        </div>
        <div className="flex items-center gap-2">
          <Block className="h-8 w-8" />
          <Block className="h-8 w-8" />
          <Block className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}

export type ShellSkeletonProps = {
  children: ReactNode;
  /** Mirrors the `sidebar-collapsed` cookie the settled shell reads, so the rail width matches. */
  collapsed?: boolean;
};

export function ShellSkeleton({ children, collapsed = false }: Readonly<ShellSkeletonProps>) {
  return (
    <div
      aria-hidden
      className={[
        "min-h-dvh bg-bg text-fg lg:grid",
        collapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[270px_minmax(0,1fr)]",
      ].join(" ")}
      data-testid="shell-skeleton"
    >
      <SidebarSkeleton collapsed={collapsed} />
      <div className="flex min-w-0 flex-col">
        <HeaderSkeleton />
        {/* A plain div, not <main>: the settled shell owns that landmark and this is inert. */}
        <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-5.5">{children}</div>
      </div>
    </div>
  );
}
