"use client";

// The one renderer for the navigation rail. The desktop Sidebar, the mobile SidebarNav drawer
// and (as a static picture) ShellSkeleton all draw the same geometry, and it used to live as
// three hand-maintained copies: a row change had to land three times or the two live surfaces
// silently drifted. Sidebar and SidebarNav now compose this; ShellSkeleton mirrors its boxes.

import { Tooltip } from "@/components/ui";
import type { NavItem, NavItemGroupDescriptor } from "@/lib/nav/nav-items";
import { navItemGroups, RAIL_ICON_SIZE } from "@/lib/nav/nav-items";
import { FlaskIcon as Flask } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export type SidebarRailRowProps = {
  collapsed: boolean;
  currentHref: string;
  item: NavItem;
  onNavigate?: () => void;
};

export function SidebarRailRow({
  collapsed,
  currentHref,
  item,
  onNavigate,
}: Readonly<SidebarRailRowProps>) {
  const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Tooltip
      placement="right"
      content={collapsed ? item.label : ""}
      wrapperClassName={collapsed ? undefined : "w-full"}
    >
      <Link
        aria-current={active ? "page" : undefined}
        // Collapsed drops the visible label, and a closed tooltip contributes no name, so
        // without this a screen reader announces a bare "link" for every tile. Expanded, an
        // experimental row still needs it: the Flask trigger inside the row would otherwise
        // append "Experimental" to the row's own accessible name.
        aria-label={collapsed || item.badge === "experimental" ? item.label : undefined}
        className={[
          "relative flex items-center rounded-control text-[13.5px] font-medium transition-colors duration-150",
          // The rows are full-bleed in a narrow column, so an outset ring is clipped against
          // the rail edge. Inset keeps the whole indicator on screen.
          "focus-visible:-outline-offset-2",
          // Height lives in the branches, not the base: two competing h-* utilities resolve by
          // stylesheet order, not by their order in this string. Collapsed, every row is the
          // same 36px square, and the explicit 22px margin (not mx-auto) is what holds the icon
          // axis at 40px from the rail edge in both states.
          collapsed
            ? "ml-5.5 h-9 w-9 justify-center p-0"
            : "ml-2.5 h-9 w-full gap-2.5 pr-[11px] pl-[1px]",
          // The current page carries no fill: the row surface belongs to hover alone, and the
          // page marker is the leading dot plus the filled glyph and 600 label - the same
          // vocabulary as the marketing header. Hover therefore composes with the current page
          // instead of replacing it.
          active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg",
          "hover:bg-bg-sunken active:bg-bg-inset",
        ].join(" ")}
        href={item.href}
        onClick={onNavigate}
      >
        {/* Current-page dot. Always in the DOM with only opacity changing, so navigation never
            relayouts the column. --accent-solid, not --accent: as a non-text indicator it needs
            3:1 (SC 1.4.11) and holds 4.28:1 over the hover fill. It sits in a gutter beside the
            row, never on it: on the fill it read as part of the hover instead of as the page
            marker. */}
        <span
          aria-hidden
          className={[
            "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent-solid transition-opacity duration-150",
            // The two states start their rows 2px apart (24px expanded, 22px collapsed), so the
            // offsets differ by 2px to land the dot on the SAME screen x - 14px from the rail
            // edge - in both. Row height is 36px in both states too, which is what stops the dot
            // drifting a further 4px down on every row of the list.
            collapsed ? "-left-2" : "-left-2.5",
            active ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        {/* Same fixed 30px leading slot as the workspace switcher tile, so every icon in the
            rail shares one vertical axis. Without it the bare 18px glyph sits flush at the row
            padding, 7px left of the tile below it. */}
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
            <SidebarRailBadge badge={item.badge} />
          </>
        )}
      </Link>
    </Tooltip>
  );
}

function SidebarRailBadge({ badge }: Readonly<{ badge?: NavItem["badge"] }>) {
  if (badge === "experimental") {
    return (
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
    );
  }

  if (!badge) return null;

  return (
    <span
      // Decorative status, and the row's accessible name is the label alone: without this the
      // expanded link announces as "Search Consolealpha".
      aria-hidden
      className={[
        "inline-flex flex-none items-center rounded-full px-[7px] py-0.5 text-[9.5px] font-semibold",
        badge === "new" ? "bg-accent-soft text-accent-text" : "bg-bg-sunken text-fg-muted",
      ].join(" ")}
    >
      {badge}
    </span>
  );
}

export function SidebarRailGroupHeading({
  collapsed,
  group,
}: Readonly<{ collapsed: boolean; group: NavItemGroupDescriptor }>) {
  return (
    // The scopes a group covers live here, in the heading's tooltip. Under the heading they
    // would be a second line of type in a 28px box and the rail would gain a subtitle rhythm it
    // does not have. `description` semantics keeps the visible caption as the accessible name.
    <Tooltip
      content={group.tooltip}
      placement="right"
      semantics="description"
      wrapperClassName={collapsed ? "w-20" : "w-full"}
    >
      {/* 14 + 10 + 4 = a 28px heading box in BOTH states. `block` and `leading-none` pin the line
          box to the 10px font size; preflight is off (app/styles/base-reset.css), so without them
          a UA line-height makes the settled heading taller than its ShellSkeleton placeholder and
          the rail shifts on hydration. Collapsed the box is the full 80px rail width and carries
          the group's tag instead of its label. */}
      <span
        className={[
          "block pt-3.5 pb-1 text-[10px] font-semibold uppercase leading-none tracking-[0.5px] text-fg-muted",
          collapsed ? "w-20 text-center" : "px-[11px]",
        ].join(" ")}
        data-rail-group-heading={group.id}
      >
        {collapsed ? group.tag : group.label}
      </span>
    </Tooltip>
  );
}

export type SidebarRailGroupsProps = {
  collapsed: boolean;
  currentHref: string;
  items: readonly NavItem[];
  onNavigate?: () => void;
};

/**
 * The three groups, in model order, each headed by its caption. Every rail destination is in
 * exactly one group, so there is no ungrouped block above or below this.
 */
export function SidebarRailGroups({
  collapsed,
  currentHref,
  items,
  onNavigate,
}: Readonly<SidebarRailGroupsProps>) {
  return (
    <>
      {navItemGroups.map((group) => (
        <div className="flex flex-col gap-0.5" key={group.id}>
          <SidebarRailGroupHeading collapsed={collapsed} group={group} />
          {items
            .filter((item) => item.group === group.id)
            .map((item) => (
              <SidebarRailRow
                collapsed={collapsed}
                currentHref={currentHref}
                item={item}
                // Collapsing remounts the row rather than re-rendering it, so a tooltip that was
                // warm in the other state cannot open without fresh pointer or focus input.
                key={`${item.href}:${collapsed ? "collapsed" : "expanded"}`}
                onNavigate={onNavigate}
              />
            ))}
        </div>
      ))}
    </>
  );
}
