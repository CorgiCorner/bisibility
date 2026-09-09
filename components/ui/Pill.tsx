"use client";

import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";
import { Button, type ButtonProps } from "./Button";

export type PillProps = Omit<ButtonProps, "size"> & {
  active?: boolean;
  size?: "sm" | "md" | "lg";
};

export type PillBadgeProps = ComponentProps<"span"> & {
  size?: "xs" | "sm";
};

const pillBadgeSizeClassName = {
  xs: "px-[7px] py-px text-[9.5px] font-semibold tracking-[0.04em]",
  sm: "px-2 py-0.5 text-ui-micro",
} as const;

/** A non-interactive pill label for use inside other interactive controls. */
export function PillBadge({ className, size = "sm", ...props }: Readonly<PillBadgeProps>) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border bg-bg-sunken uppercase tracking-wide text-fg-muted",
        pillBadgeSizeClassName[size],
        className,
      )}
      {...props}
    />
  );
}

const pillSizes = {
  sm: "min-h-7 gap-1 px-2.5 text-[11px]",
  md: "min-h-8.5 gap-1.5 px-3 text-[12px]",
  lg: "min-h-10 gap-2 px-4 text-[13px]",
};
export function Pill({ active = false, className, size = "md", style, ...props }: PillProps) {
  return (
    <Button
      {...props}
      size="xs"
      variant="secondary"
      className={cn("rounded-full whitespace-nowrap font-semibold", pillSizes[size], className)}
      style={{
        "--control-press-scale": ".98",
        "--control-background-color": active ? "var(--accent-soft)" : "var(--bg-elev)",
        "--control-color": active ? "var(--accent)" : "var(--fg-muted)",
        "--control-hover-background-color": active
          ? "color-mix(in srgb, var(--accent) 18%, var(--bg-elev))"
          : "var(--bg-sunken)",
        "--control-hover-border-color": active ? "var(--accent-hover)" : "var(--accent)",
        "--control-hover-color": active ? "var(--accent-hover)" : "var(--accent)",
        ...style,
      }}
    />
  );
}
