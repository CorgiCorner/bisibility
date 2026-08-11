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
  /** Anchor attributes, valid whenever `href` is set - external links need both. */
  rel?: string;
  size?: ButtonSize;
  target?: string;
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
    color: "var(--mui-palette-error-contrastText)",
    "&:hover": { backgroundColor: "var(--red)", opacity: 0.9 },
  },
  ghost: {
    backgroundColor: "transparent",
    border: "1px solid transparent",
    color: "var(--fg-muted)",
    "&:hover": { backgroundColor: "var(--bg-sunken)", color: "var(--fg)" },
  },
  // The solid pair, not --accent. --accent is the light brand hue and cannot carry a light
  // label: --accent-on-solid over --accent lands at 2.9:1, over --accent-solid at 4.7:1. See the
  // note on the pair in globals.css and the surface assertions in lib/theme/contrast.test.ts.
  primary: {
    backgroundColor: "var(--accent-solid)",
    border: "1px solid var(--accent-solid)",
    color: "var(--mui-palette-primary-contrastText)",
    "&:hover": {
      backgroundColor: "var(--accent-solid-hover)",
      border: "1px solid var(--accent-solid-hover)",
    },
  },
  // Deliberately quieter than primary: the outline already carries the shape, so a
  // full-weight full-contrast label made secondary read as the louder of the two.
  // Muted still clears 4.5:1 on both surfaces, and hover restores full contrast.
  secondary: {
    backgroundColor: "var(--bg-elev)",
    border: "1px solid var(--border-strong)",
    color: "var(--fg-muted)",
    fontWeight: 500,
    "&:hover": {
      backgroundColor: "var(--bg-sunken)",
      border: "1px solid var(--border-strong)",
      color: "var(--fg)",
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
  const disabledStyle = loading
    ? {
        backgroundColor: variantSx[variant].backgroundColor,
        border: variantSx[variant].border,
        color: variantSx[variant].color,
        opacity: 0.65,
      }
    : {
        backgroundColor: "var(--bg-sunken)",
        border: "1px solid var(--border-strong)",
        color: "var(--fg-muted)",
        opacity: 1,
      };

  return (
    <MuiButton
      {...props}
      aria-busy={loading ? true : props["aria-busy"]}
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
          transition: "background-color .16s ease, border-color .16s ease",
          "&.Mui-disabled": disabledStyle,
        },
        sizeSx[size],
        variantSx[variant],
        ...additionalSx,
      ]}
      variant={muiVariantFor(variant)}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </MuiButton>
  );
}
