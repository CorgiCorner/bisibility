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

import { navItems } from "@/lib/nav/nav-items";
import type { ReactNode } from "react";

// The boundary has no project yet, so the rail is built against the literal route pattern.
// Only the row counts are used - the hrefs and labels are discarded.
const railRows = navItems("[project]");
const primaryRowKeys = railRows
  .filter((item) => item.group !== "utility")
  .map((_, index) => `nav-${index}`);
const utilityRowKeys = railRows
  .filter((item) => item.group === "utility")
  .map((_, index) => `utility-${index}`);

function Block({ className }: Readonly<{ className?: string }>) {
  return <div className={`animate-pulse rounded-[9px] bg-bg-sunken ${className ?? ""}`} />;
}

function RailRow({ collapsed }: Readonly<{ collapsed: boolean }>) {
  // Both states are a 36px row on the same 40px icon axis: collapsed a tile held by the
  // explicit 22px margin, expanded a row inset 10px that gives the same 10px back as padding.
  // The skeleton has to match, or the shell visibly resizes the moment it hydrates.
  if (collapsed) {
    return <Block className="ml-[22px] h-9 w-9" />;
  }

  return (
    <div className="ml-2.5 flex h-9 items-center gap-2.5 pr-[11px] pl-[1px]">
      <div className="grid h-[30px] w-[30px] flex-none place-items-center">
        <Block className="h-[18px] w-[18px] rounded-[5px]" />
      </div>
      <Block className="h-3.5 w-[92px] max-w-full" />
    </div>
  );
}

function SidebarSkeleton({ collapsed }: Readonly<{ collapsed: boolean }>) {
  return (
    <div
      className={[
        "sticky top-0 z-50 hidden h-dvh min-h-dvh flex-col overflow-hidden border-r border-border bg-bg-elev lg:flex",
        collapsed ? "px-0 py-[14px]" : "p-[14px]",
      ].join(" ")}
      data-testid="shell-skeleton-sidebar"
    >
      {/* Order mirrors the settled rail: head, nav, utility, switcher, version. */}
      <div className="flex-none pb-4">
        {collapsed ? (
          // The head is 48px tall in both states, so the mark's centre does not move across
          // the toggle; the 22px margin holds it on the rail's icon axis.
          <div className="ml-[22px] grid h-12 w-9 place-items-center">
            <Block className="h-9 w-9" />
          </div>
        ) : (
          <div className="flex h-12 w-full items-center gap-2.5 px-[11px]">
            <div className="flex h-[30px] flex-none items-center pl-[2px]">
              <Block className="h-[26px] w-[26px] rounded-[7px]" />
            </div>
            <Block className="h-4 w-[84px]" />
            <Block className="ml-auto h-[30px] w-[30px] flex-none rounded-[9px]" />
          </div>
        )}
      </div>
      {/* Only the nav region gives; the rest of the column is flex-none. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        {primaryRowKeys.map((key) => (
          <RailRow collapsed={collapsed} key={key} />
        ))}
      </div>
      <div className="mt-auto flex flex-none flex-col gap-1 pt-4">
        {utilityRowKeys.map((key) => (
          <RailRow collapsed={collapsed} key={key} />
        ))}
      </div>
      <div className="mt-[18px] flex-none">
        {collapsed ? (
          <Block className="ml-[22px] h-11 w-9" />
        ) : (
          <div className="flex h-11 w-full items-center gap-2.5 px-[11px]">
            <Block className="h-[30px] w-[30px] flex-none" />
            <Block className="h-3.5 min-w-0 flex-1" />
            <Block className="h-3 w-3 flex-none rounded-[4px]" />
          </div>
        )}
      </div>
      <div className={`flex flex-none pt-2 ${collapsed ? "justify-center" : "justify-end pr-1"}`}>
        <Block className="h-2.5 w-9 rounded-[4px]" />
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div
      className="relative z-40 flex flex-nowrap items-center justify-between gap-2.5 border-b border-border bg-bg px-4 py-3 sm:gap-4 sm:px-5 lg:px-7 lg:py-[14px]"
      data-testid="shell-skeleton-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <Block className="h-[42px] w-[42px] flex-none rounded-xl lg:hidden" />
        <div className="min-w-0 flex-1">
          <Block className="h-[22px] w-[180px] max-w-full sm:h-[26px]" />
          <Block className="mt-1 hidden h-[15px] w-[260px] max-w-full sm:block" />
        </div>
      </div>
      {/* Right cluster order matches AppHeader: [actions] [search][bell][account]. */}
      <div className="flex flex-none items-center gap-6">
        <div className="hidden min-w-[210px] flex-none pt-[3px] md:block">
          <Block className="h-2.5 w-[104px] rounded-[4px]" />
          <Block className="mt-1 h-3 w-[150px] rounded-[4px]" />
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
        collapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]",
      ].join(" ")}
      data-testid="shell-skeleton"
    >
      <SidebarSkeleton collapsed={collapsed} />
      <div className="flex min-w-0 flex-col">
        <HeaderSkeleton />
        {/* A plain div, not <main>: the settled shell owns that landmark and this is inert. */}
        <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-[22px]">{children}</div>
      </div>
    </div>
  );
}
