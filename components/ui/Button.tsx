"use client";

import { sxArray } from "@/lib/ui/mui-sx";
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

export type ButtonVariant = "destructive" | "ghost" | "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm" | "xs";

export type ButtonProps = Omit<MuiButtonProps, "color" | "size" | "variant"> & {
  download?: string;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const sizeSx = {
  lg: { borderRadius: "10px", fontSize: "14.5px", minHeight: 44, padding: "11px 18px" },
  md: { borderRadius: "9px", fontSize: "13px", minHeight: 36, padding: "8px 16px" },
  sm: { borderRadius: "9px", fontSize: "12.5px", minHeight: 34, padding: "6px 12px" },
  xs: { borderRadius: "7px", fontSize: "12px", minHeight: 30, padding: "4px 10px" },
} as const;

const variantSx = {
  destructive: {
    backgroundColor: "var(--red)",
    border: "1px solid var(--red)",
    color: "#fff",
    "&:hover": { backgroundColor: "var(--red)", opacity: 0.9 },
  },
  ghost: {
    backgroundColor: "transparent",
    border: "1px solid transparent",
    color: "var(--fg-muted)",
    "&:hover": { backgroundColor: "var(--bg-sunken)", color: "var(--fg)" },
  },
  primary: {
    backgroundColor: "var(--accent)",
    border: "1px solid var(--accent)",
    color: "#fff",
    "&:hover": { backgroundColor: "var(--accent-hover)" },
  },
  secondary: {
    backgroundColor: "var(--bg-elev)",
    border: "1px solid var(--border-strong)",
    color: "var(--fg)",
    "&:hover": {
      backgroundColor: "var(--bg-sunken)",
      border: "1px solid var(--border-strong)",
    },
  },
} as const;

function muiVariantFor(variant: ButtonVariant) {
  if (variant === "ghost") return "text";
  if (variant === "secondary") return "outlined";
  return "contained";
}

export function Button({
  children,
  disabled,
  loading = false,
  loadingLabel,
  size = "md",
  startIcon,
  sx,
  variant = "primary",
  ...props
}: ButtonProps) {
  const busy = loading || disabled;
  const additionalSx = sxArray(sx);

  return (
    <MuiButton
      color="inherit"
      disabled={busy}
      disableElevation
      startIcon={
        loading ? (
          <CircularProgress aria-hidden color="inherit" size={14} thickness={5} />
        ) : (
          startIcon
        )
      }
      sx={[
        {
          fontWeight: 600,
          textTransform: "none",
          transition: "background-color .16s ease, border-color .16s ease, opacity .16s ease",
          "&.Mui-disabled": {
            backgroundColor: variantSx[variant].backgroundColor,
            border: variantSx[variant].border,
            color: variantSx[variant].color,
            opacity: 0.55,
          },
        },
        sizeSx[size],
        variantSx[variant],
        ...additionalSx,
      ]}
      variant={muiVariantFor(variant)}
      {...props}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </MuiButton>
  );
}
