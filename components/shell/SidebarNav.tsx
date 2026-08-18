"use client";

import { Tooltip } from "@/components/ui";
import type { NavItem } from "@/lib/nav/nav-items";
import { navItems, RAIL_ICON_SIZE } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarNavProps = {
  activeHref?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  projectRef: string;
};

export function SidebarNav({
  activeHref,
  collapsed = false,
  onNavigate,
  projectRef,
}: Readonly<SidebarNavProps>) {
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname ?? appPath(projectRef, "dashboard");
  const allItems = navItems(projectRef);
  const items = allItems.filter((item) => item.group !== "utility");
  const utilityItems = allItems.filter((item) => item.group === "utility");

  function renderItem(item: NavItem) {
    const active = currentHref === item.href || currentHref.startsWith(`${item.href}/`);
    const Icon = item.icon;

    return (
      <Tooltip key={item.href} placement="right" content={collapsed ? item.label : ""}>
        <Link
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={[
            "relative flex items-center rounded-[9px] text-[13.5px] font-medium transition-colors duration-150",
            // Inset ring: full-bleed rows in a narrow column clip an outset one.
            "focus-visible:-outline-offset-2",
            // Height lives in the branches, not the base: two competing h-* utilities resolve by
            // stylesheet order, not by their order in this string. Expanded the row is inset 10px
            // and gives that back as padding, so the icon axis stays at 40px (see Sidebar.tsx).
            collapsed
              ? "ml-5.5 h-9 w-9 justify-center p-0"
              : "ml-2.5 h-9 gap-2.5 pr-[11px] pl-[1px]",
            // No fill on the current page: the row surface belongs to hover, the page
            // marker is the leading dot + filled glyph + 600 label (see Sidebar.tsx).
            active ? "font-semibold text-fg" : "text-fg-muted hover:text-fg",
            "hover:bg-nav-active active:bg-bg-inset",
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
              size={RAIL_ICON_SIZE}
              weight={active ? "fill" : "regular"}
            />
          </span>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full border border-border-strong bg-bg-elev px-[7px] py-0.5 font-mono text-[9px] uppercase tracking-[0.6px] text-fg-muted">
                  {item.badge}
                </span>
              ) : null}
            </>
          )}
        </Link>
      </Tooltip>
    );
  }

  // Two groups, exactly as the rail: primary navigation, then utilities at the foot with
  // distance doing the separating. The drawer used to concatenate them into one list, so the
  // mobile shell had no notion of the split the desktop shell is built around.
  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-col gap-0.5">{items.map(renderItem)}</nav>
      <nav className="mt-auto flex flex-none flex-col gap-0.5 pt-4">
        {utilityItems.map(renderItem)}
      </nav>
    </div>
  );
}
