import { cn } from "@/lib/ui/cn";
import type { Icon } from "@phosphor-icons/react";

export type ModuleMarkVariant = "soft" | "halo";

export type ModuleMarkProps = {
  bordered?: boolean;
  className?: string;
  compact?: boolean;
  icon: Icon;
  label?: string;
  variant?: ModuleMarkVariant;
};

export function ModuleMark({
  bordered = false,
  className,
  compact = false,
  icon: Glyph,
  label,
  variant = "soft",
}: Readonly<ModuleMarkProps>) {
  const accessibilityProps = label
    ? { "aria-label": label, role: "img" as const }
    : { "aria-hidden": true as const };
  const glyphSize = compact ? 20 : 25;

  if (variant === "soft") {
    return (
      <span
        className={cn(
          "grid place-items-center bg-accent-soft text-accent-solid",
          compact ? "h-10 w-10 rounded-control" : "h-[54px] w-[54px] rounded-[13px]",
          bordered ? "border border-accent/30" : null,
          className,
        )}
        data-module-mark="soft"
        {...accessibilityProps}
      >
        <Glyph aria-hidden data-icon-weight="regular" size={glyphSize} weight="regular" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid place-items-center [background:color-mix(in_srgb,var(--accent-soft)_52%,var(--bg-elev))]",
        compact ? "h-10 w-10 rounded-control" : "h-[54px] w-[54px] rounded-[13px]",
        bordered ? "border border-accent/30" : null,
        className,
      )}
      data-module-mark="halo"
      {...accessibilityProps}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center bg-accent-soft text-accent-solid",
          "[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--accent-solid)_12%,transparent),inset_0_1px_2px_-0.5px_var(--module-mark-top),inset_0_-1px_2.5px_-0.5px_var(--module-mark-bottom)]",
          compact ? "h-8 w-8 rounded-control" : "h-11 w-11 rounded-control",
        )}
      >
        <Glyph aria-hidden data-icon-weight="regular" size={glyphSize} weight="regular" />
      </span>
    </span>
  );
}
