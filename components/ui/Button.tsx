"use client";

import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { MOTION_PRESS } from "@/lib/ui/motion";
import { sxArray } from "@/lib/ui/mui-sx";
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

export type ButtonVariant = "destructive" | "ghost" | "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm" | "xs";

export const buttonXsSx = {
  borderRadius: UI_RADIUS_ROLES.control,
  fontSize: "12px",
  minHeight: 30,
  padding: "4px 10px",
} as const;

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

const secondaryBorder = "1px solid var(--border-control)";

const ghostPadding = {
  lg: "9px 12px",
  md: "7px 9px",
  sm: "5px 6px",
  xs: "5px 11px",
} as const;

function muiSizeFor(size: ButtonSize): "large" | "medium" | "small" {
  if (size === "lg") return "large";
  if (size === "sm" || size === "xs") return "small";
  return "medium";
}

const pressScale = {
  "@media (prefers-reduced-motion: no-preference)": {
    "&:active:not(:focus-visible):not(.Mui-disabled)": { transform: "scale(0.97)" },
  },
} as const;

const variantSx = {
  destructive: {
    "--variant-containedBg": "var(--red)",
    "--variant-containedColor": "var(--mui-palette-error-contrastText)",
    backgroundColor: "var(--red)",
    border: "1px solid var(--red)",
    color: "var(--mui-palette-error-contrastText)",
    "&:hover": { backgroundColor: "var(--red)", opacity: 0.9 },
    ...pressScale,
  },
  ghost: {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--fg-muted)",
    "&:not(.Mui-focusVisible):not(:hover):not(.Mui-disabled)": {
      backgroundColor: "transparent",
      color: "var(--fg-muted)",
    },
    "&.Mui-focusVisible:not(.Mui-disabled)": {
      backgroundColor: "var(--bg-sunken)",
      color: "var(--fg)",
    },
    "@media (hover: hover)": {
      "&:hover:not(.Mui-disabled)": {
        backgroundColor: "var(--bg-sunken)",
        color: "var(--fg)",
      },
    },
  },
  // Brand surface with the cream --accent-on-solid label. Light pair is 3.25:1;
  // see lib/theme/tokens.ts and the pinned ratios in contrast.test.ts.
  primary: {
    "--variant-containedBg": "var(--accent-solid)",
    "--variant-containedColor": "var(--accent-on-solid)",
    backgroundColor: "var(--accent-solid)",
    border: "1px solid var(--accent-solid)",
    color: "var(--accent-on-solid)",
    "&:hover": {
      "--variant-containedBg": "var(--accent-solid-hover)",
      backgroundColor: "var(--accent-solid-hover)",
      border: "1px solid var(--accent-solid-hover)",
    },
    ...pressScale,
  },
  // Elevated fill, 1px --border-control, and --fg so secondary stays a real
  // outline control without competing with the solid primary.
  secondary: {
    backgroundColor: "var(--bg-elev)",
    border: secondaryBorder,
    color: "var(--fg)",
    "&:hover": {
      backgroundColor: "var(--bg-sunken)",
      border: secondaryBorder,
      color: "var(--fg)",
    },
    ...pressScale,
  },
} as const;

function muiVariantFor(variant: ButtonVariant) {
  if (variant === "ghost") return "text";
  if (variant === "secondary") return "outlined";
  return "contained";
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingIndicator,
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
        border: "1px solid var(--border-control)",
        color: "var(--fg-muted)",
        opacity: 1,
      };

  return (
    <MuiButton
      {...props}
      aria-busy={loading ? true : props["aria-busy"]}
      className={cn(size === "xs" && "min-h-[30px]", className)}
      color="inherit"
      disabled={busy}
      disableElevation
      disableRipple
      size={muiSizeFor(size)}
      startIcon={
        loading
          ? (loadingIndicator ?? (
              <CircularProgress aria-hidden color="inherit" size={14} thickness={5} />
            ))
          : startIcon
      }
      sx={[
        {
          borderRadius: UI_RADIUS_ROLES.control,
          fontWeight: 600,
          textTransform: "none",
          transition: `background-color .16s ease, border-color .16s ease, transform ${MOTION_PRESS}ms ease`,
          "&.Mui-disabled": disabledStyle,
        },
        ...(size === "xs" ? [buttonXsSx] : []),
        variant === "ghost"
          ? { ...variantSx.ghost, padding: ghostPadding[size] }
          : variantSx[variant],
        ...additionalSx,
      ]}
      variant={muiVariantFor(variant)}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </MuiButton>
  );
}
