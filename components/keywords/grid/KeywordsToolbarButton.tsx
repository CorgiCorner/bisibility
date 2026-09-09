import { Button, type ButtonProps } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/ui/cn";
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

type KeywordsToolbarButtonProps = ButtonProps & {
  compactBelowXl?: boolean;
  iconOnly?: boolean;
  label: string;
  labelFrom?: LabelFrom;
  showTooltip: boolean;
};

export function KeywordsToolbarButton({
  children,
  compactBelowXl = false,
  iconOnly = false,
  label,
  labelFrom,
  showTooltip,
  size = "sm",
  style,
  className,
  ...props
}: KeywordsToolbarButtonProps) {
  const labelClassName = labelVisibilityClass(compactBelowXl, iconOnly, labelFrom);
  const button = (
    <span className="inline-flex shrink-0">
      <Button
        aria-label={label}
        className={cn(
          "shrink-0 whitespace-nowrap",
          iconOnly || compactBelowXl
            ? "max-xl:min-w-10 max-xl:gap-0"
            : "max-lg:min-w-10 max-lg:gap-0",
          props.variant === "secondary" && "[&_[data-button-start-icon]]:text-fg-muted",
          className,
        )}
        size={size}
        style={{
          ...style,
          ...(!iconOnly && props.variant === "secondary"
            ? { color: "var(--fg)", fontSize: "12.5px", fontWeight: 400 }
            : {}),
        }}
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
