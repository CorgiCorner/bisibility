"use client";

import { cn } from "@/lib/ui/cn";
import { MOTION_PRESS } from "@/lib/ui/motion";
import { sxArray } from "@/lib/ui/mui-sx";
import ButtonBase, { type ButtonBaseProps } from "@mui/material/ButtonBase";

export type PillProps = ButtonBaseProps & {
  active?: boolean;
  size?: "sm" | "md" | "lg";
};

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
          border: "1px solid var(--border-strong)",
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
