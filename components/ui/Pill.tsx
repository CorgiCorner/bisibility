"use client";

import { cn } from "@/lib/ui/cn";
import { MOTION_PRESS } from "@/lib/ui/motion";
import { sxArray } from "@/lib/ui/mui-sx";
import ButtonBase, { type ButtonBaseProps } from "@mui/material/ButtonBase";
import type { ComponentProps } from "react";

export type PillProps = ButtonBaseProps & {
  active?: boolean;
  size?: "sm" | "md" | "lg";
};

export type PillBadgeProps = ComponentProps<"span"> & {
  size?: "xs" | "sm";
};

const pillBadgeSizeClassName = {
  xs: "px-1.5 py-0.5 text-[10px]",
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

const sizeSx = {
  sm: { borderRadius: "9999px", columnGap: "4px", fontSize: "11px", minHeight: 28, px: "10px" },
  md: { borderRadius: "9999px", columnGap: "6px", fontSize: "12px", minHeight: 34, px: "12px" },
  lg: { borderRadius: "9999px", columnGap: "8px", fontSize: "13px", minHeight: 40, px: "16px" },
} as const;

export function Pill({ active = false, className, size = "md", sx, ...props }: PillProps) {
  const additionalSx = sxArray(sx);

  return (
    <ButtonBase
      className={cn("inline-flex items-center whitespace-nowrap font-semibold", className)}
      sx={[
        {
          backgroundColor: active ? "var(--accent-soft)" : "var(--bg-elev)",
          border: "1px solid var(--border-control)",
          color: active ? "var(--accent)" : "var(--fg-muted)",
          fontWeight: 600,
          transition: `background-color .16s ease, border-color .16s ease, color .16s ease, transform ${MOTION_PRESS}ms ease`,
          "&:hover": {
            backgroundColor: active
              ? "color-mix(in srgb, var(--accent) 18%, var(--bg-elev))"
              : "var(--bg-sunken)",
            borderColor: active ? "var(--accent-hover)" : "var(--accent)",
            color: active ? "var(--accent-hover)" : "var(--accent)",
          },
          "@media (prefers-reduced-motion: no-preference)": {
            "&:active:not(:focus-visible):not(.Mui-disabled)": { transform: "scale(0.98)" },
          },
        },
        sizeSx[size],
        ...additionalSx,
      ]}
      {...props}
    />
  );
}
