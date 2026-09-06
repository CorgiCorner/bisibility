import { Button, type ButtonProps, Tooltip } from "@/components/ui";
import { sxArray } from "@/lib/ui/mui-sx";
import type { SxProps, Theme } from "@mui/material/styles";

const mobileIconOnlyButtonSx = {
  "@media (max-width:1023px)": {
    minWidth: 40,
    "& .MuiButton-startIcon": {
      marginLeft: 0,
      marginRight: 0,
    },
  },
} satisfies SxProps<Theme>;

const compactIconOnlyButtonSx = {
  "@media (max-width:1279px)": {
    minWidth: 40,
    "&& .MuiButton-startIcon": {
      marginLeft: 0,
      marginRight: 0,
    },
  },
} satisfies SxProps<Theme>;

const secondaryIconSx = {
  "& .MuiButton-startIcon": { color: "var(--fg-muted)" },
  "& .MuiButton-startIcon > svg": { color: "var(--fg-muted)" },
} satisfies SxProps<Theme>;

const primaryIconSx = {
  "& .MuiButton-startIcon > svg": { color: "currentColor" },
} satisfies SxProps<Theme>;

const labeledSecondaryButtonSx = {
  color: "var(--fg)",
  fontSize: "12.5px",
  fontWeight: 400,
} satisfies SxProps<Theme>;

export const toolbarSecondaryIconClassName = "text-fg-muted";

type LabelFrom = "sm" | "lg" | "xl";

function labelVisibilityClass(
  compactBelowXl: boolean,
  iconOnly: boolean,
  labelFrom?: LabelFrom,
): string | null {
  if (iconOnly) return null;
  const breakpoint = labelFrom ?? (compactBelowXl ? "xl" : "lg");
  if (breakpoint === "sm") return "hidden sm:inline";
  if (breakpoint === "xl") return "hidden xl:inline";
  return "hidden lg:inline";
}

type KeywordsToolbarButtonProps = Omit<ButtonProps, "sx"> & {
  compactBelowXl?: boolean;
  iconOnly?: boolean;
  label: string;
  labelFrom?: LabelFrom;
  showTooltip: boolean;
  sx?: SxProps<Theme>;
};

export function KeywordsToolbarButton({
  children,
  compactBelowXl = false,
  iconOnly = false,
  label,
  labelFrom,
  showTooltip,
  size = "sm",
  sx,
  ...props
}: KeywordsToolbarButtonProps) {
  const buttonSx = sxArray(sx);
  const labelClassName = labelVisibilityClass(compactBelowXl, iconOnly, labelFrom);
  const button = (
    <span className="inline-flex shrink-0">
      <Button
        aria-label={label}
        className="shrink-0 whitespace-nowrap"
        size={size}
        sx={[
          iconOnly || compactBelowXl ? compactIconOnlyButtonSx : mobileIconOnlyButtonSx,
          props.variant === "secondary" ? secondaryIconSx : primaryIconSx,
          ...buttonSx,
          !iconOnly && props.variant === "secondary" ? labeledSecondaryButtonSx : false,
        ]}
        {...props}
      >
        {labelClassName ? <span className={labelClassName}>{label}</span> : null}
        {children}
      </Button>
    </span>
  );

  if (props.disabled || !showTooltip) return button;
  return (
    <span className="inline-flex shrink-0" data-toolbar-tooltip="true" data-tooltip-label={label}>
      <Tooltip content={label} placement="bottom">
        {button}
      </Tooltip>
    </span>
  );
}
