"use client";

import { WorkspaceTile } from "@/components/shell/WorkspaceTile";
import { Tooltip } from "@/components/ui/Tooltip";
import { CaretUpDownIcon as CaretUpDown } from "@phosphor-icons/react/dist/csr/CaretUpDown";
import type { MouseEvent } from "react";

/** `ghost` is what the rail uses: the workspace is context, not a control to hunt for. */
export type WorkspaceTriggerVariant = "boxed" | "ghost";

const VARIANT_BORDER: Record<WorkspaceTriggerVariant, string> = {
  boxed: "border-border-control",
  ghost: "border-transparent",
};

// The resting fill is emitted only when the menu is closed: Tailwind's colour utilities all
// share one specificity, so a co-present `bg-transparent` would out-order the open state.
const VARIANT_FILL: Record<WorkspaceTriggerVariant, string> = {
  boxed: "bg-bg-elev",
  ghost: "bg-transparent",
};

export type WorkspaceSwitcherTriggerProps = {
  collapsed: boolean;
  /** Header switchers use the navigation icon axis rather than the standard row inset. */
  compact?: boolean;
  domain: string;
  menuId: string;
  name: string;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  open: boolean;
  sublabel: string | null;
  variant: WorkspaceTriggerVariant;
};

export function WorkspaceSwitcherTrigger({
  collapsed,
  compact = false,
  domain,
  menuId,
  name,
  onOpen,
  open,
  sublabel,
  variant,
}: Readonly<WorkspaceSwitcherTriggerProps>) {
  // Collapsed the row loses its box entirely and the hover fill moves onto the tile, so the
  // rail stays a column of glyphs rather than growing a second, wider hit target.
  // The collapsed control is a 36px square. Expanding changes only its width, never its
  // height, so the icon keeps the same vertical position and its hover surface simply grows
  // into the project label.
  const shell = collapsed
    ? "ml-5.5 size-9 justify-center p-0 border-transparent bg-transparent"
    : [
        compact ? "h-9 w-full gap-2.5 px-[5px]" : "h-9 w-full gap-2.5 px-[11px]",
        VARIANT_BORDER[variant],
        open ? "bg-bg-sunken" : `${VARIANT_FILL[variant]} hover:bg-bg-sunken`,
        "active:bg-bg-inset",
      ].join(" ");

  return (
    <Tooltip
      content={collapsed ? "Switch project" : ""}
      placement="right"
      wrapperClassName={collapsed ? undefined : "w-full"}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Switch project"
        className={[
          "group flex items-center rounded-control border text-left text-[13.5px] text-fg transition-colors",
          // The focus ring belongs to both modes. It used to sit only in the expanded branch,
          // so a keyboard user on the collapsed rail got outline-none and nothing back.
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid",
          shell,
        ].join(" ")}
        onClick={onOpen}
        type="button"
      >
        <WorkspaceTile
          // Collapsed the hover fill lands on the tile, not on the row: a filled 36px row
          // inside an 80px rail reads as the item growing. The tile already rests on
          // --bg-sunken, which is the open state the expanded row paints on itself.
          className={collapsed ? "group-hover:bg-bg-sunken group-active:bg-bg-inset" : ""}
          domain={domain}
          // One radius in both states. The tile is the same 28px square either way, so a
          // different corner collapsed made the same object look like two objects.
          radius={6}
          size={20}
        />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">{name}</span>
              {/* The sublabel describes state ("New project", "12 keywords"). A brand new
                  project is also NAMED "New project", so the two collide and the second line
                  becomes noise. Drop it rather than print the same words twice. */}
              {sublabel && sublabel !== name ? (
                <span className="block text-[10px] text-fg-muted">{sublabel}</span>
              ) : null}
            </span>
            {/* --fg-muted, not --fg-faint: that token was retired and now aliases muted. */}
            <CaretUpDown
              aria-hidden
              className="flex-none text-fg-muted"
              size={13}
              weight="regular"
            />
          </>
        )}
      </button>
    </Tooltip>
  );
}
