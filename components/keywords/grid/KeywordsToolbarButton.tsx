import { Button, type ButtonProps } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { cn } from "@/lib/ui/cn";
export const toolbarSecondaryIconClassName = "text-fg-muted";

type KeywordsToolbarButtonProps = ButtonProps & {
  iconOnly?: boolean;
  label: string;
  labelFrom?: "always" | "lg";
  showTooltip: boolean;
};

export function KeywordsToolbarButton({
  children,
  iconOnly = false,
  label,
  labelFrom = "lg",
  showTooltip,
  size = "sm",
  style,
  className,
  ...props
}: KeywordsToolbarButtonProps) {
  const labelClassName = iconOnly ? null : labelFrom === "always" ? "inline" : "hidden lg:inline";
  const button = (
    <span className="inline-flex shrink-0">
      <Button
        aria-label={label}
        className={cn(
          "shrink-0 whitespace-nowrap",
          iconOnly
            ? "size-8.5 min-w-0 gap-0 p-0"
            : labelFrom === "lg" && "w-8.5 min-w-0 gap-0 px-0 lg:w-auto lg:gap-2 lg:px-3",
          props.variant === "secondary" && toolbarControlClassName,
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
        variant={props.variant === "secondary" ? "outline" : props.variant}
      >
        {labelClassName ? (
          <span className={labelClassName} data-toolbar-label="">
            {label}
          </span>
        ) : null}
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
