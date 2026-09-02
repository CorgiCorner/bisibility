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

const labeledSecondaryButtonSx = {
  color: "var(--fg)",
  fontSize: "12.5px",
  fontWeight: 400,
} satisfies SxProps<Theme>;

type KeywordsToolbarButtonProps = Omit<ButtonProps, "sx"> & {
  compactBelowXl?: boolean;
  iconOnly?: boolean;
  label: string;
  showTooltip: boolean;
  sx?: SxProps<Theme>;
};

export function KeywordsToolbarButton({
  children,
  compactBelowXl = false,
  iconOnly = false,
  label,
  showTooltip,
  size = "sm",
  sx,
  ...props
}: KeywordsToolbarButtonProps) {
  const buttonSx = sxArray(sx);
  const button = (
    <span className="inline-flex shrink-0">
      <Button
        aria-label={label}
        className="shrink-0 whitespace-nowrap"
        size={size}
        sx={[
          iconOnly || compactBelowXl ? compactIconOnlyButtonSx : mobileIconOnlyButtonSx,
          { "& .MuiButton-startIcon > svg": { color: "currentColor" } },
          ...buttonSx,
          !iconOnly && props.variant === "secondary" ? labeledSecondaryButtonSx : false,
        ]}
        {...props}
      >
        {iconOnly ? null : (
          <span className={compactBelowXl ? "hidden xl:inline" : "hidden lg:inline"}>{label}</span>
        )}
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
