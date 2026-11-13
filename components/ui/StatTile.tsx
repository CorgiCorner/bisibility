"use client";

import { cn } from "@/lib/ui/cn";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/dist/csr/ArrowDownRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import type { ReactNode } from "react";

export type StatTileDirection = "down" | "flat" | "up";

export type StatTileProps = {
  caption?: ReactNode;
  className?: string;
  delta?: { direction: StatTileDirection; label: string };
  density?: "compact" | "regular";
  empty?: boolean;
  href?: string;
  label: string;
  source?: string;
  value: string;
  /** Replaces the value line when the tile holds more than one figure. */
  valueNode?: ReactNode;
  /** Chart, table, or breakdown rendered under the caption, inside the same tile. */
  children?: ReactNode;
};

const DELTA_ARROW = { down: ArrowDownRight, flat: null, up: ArrowUpRight } as const;

/** One stat tile: label, tabular value, optional delta, caption, and source chip. */
export function StatTile({
  caption,
  className,
  delta,
  density = "regular",
  empty = false,
  href,
  label,
  children,
  source,
  value,
  valueNode,
}: Readonly<StatTileProps>) {
  const compact = density === "compact";
  const Arrow = delta ? DELTA_ARROW[delta.direction] : null;
  const Component = href ? "a" : "div";
  return (
    <Component
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border bg-bg-elev text-fg",
        compact ? "gap-1 p-3" : "gap-1.5 px-4 pb-4 pt-3.5",
        href && "no-underline hover:bg-bg-sunken",
        className,
      )}
      data-density={density}
      data-empty={empty || undefined}
      data-stat-tile=""
      href={href}
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-balance font-sans text-ui-micro uppercase tracking-wide text-fg-muted">
          {label}
        </span>
        {source ? (
          <span className="shrink-0 rounded-full bg-bg-sunken px-1.5 py-px font-sans tabular-nums text-ui-micro tracking-wide text-fg-muted">
            {source}
          </span>
        ) : null}
      </span>
      {valueNode ?? (
        <span
          className={cn(
            "font-sans tabular-nums",
            empty
              ? "text-ui-body text-fg-muted"
              : compact
                ? "text-ui-body font-semibold text-fg"
                : "text-ui-h1 text-fg",
          )}
        >
          {value}
        </span>
      )}
      {delta && !empty ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-sans tabular-nums text-ui-caption",
            delta.direction === "up" ? "text-green-text" : "text-fg-muted",
          )}
        >
          {Arrow ? <Arrow aria-hidden className="shrink-0" size={12} weight="regular" /> : null}
          {delta.label}
        </span>
      ) : null}
      {caption ? <span className="font-sans text-ui-micro text-fg-muted">{caption}</span> : null}
      {children}
    </Component>
  );
}
