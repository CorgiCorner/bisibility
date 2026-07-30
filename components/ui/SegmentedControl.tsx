"use client";

import { cn } from "@/lib/ui/cn";
import { type KeyboardEvent, type ReactNode, useId } from "react";
import { toolbarControlClassName } from "./toolbar-control-styles";

export type SegmentedControlOption<T extends string> = {
  ariaLabel?: string;
  disabled?: boolean;
  hint?: ReactNode;
  label: ReactNode;
  tooltip?: string;
  value: T;
};

export type SegmentedControlActiveVariant = "accent" | "neutral";
export type SegmentedControlSize = "default" | "field" | "toolbar" | "xs";

export type SegmentedControlProps<T extends string> = {
  /** Neutral is a quiet inset selection; accent is the solid primary treatment. */
  activeVariant?: SegmentedControlActiveVariant;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Let each option size itself to its content instead of sharing the available width. */
  fitContent?: boolean;
  label?: ReactNode;
  labelClassName?: string;
  name?: string;
  onChange: (value: T) => void;
  optionClassName?: string;
  options: readonly SegmentedControlOption<T>[];
  /**
   * Extra-small matches 30px buttons; toolbar matches the shared 34px MenuSelect
   * spec; field matches the 40px form fieldClass height.
   */
  size?: SegmentedControlSize;
  value: T;
};

function enabledIndex<T extends string>(
  options: readonly SegmentedControlOption<T>[],
  startIndex: number,
  direction: 1 | -1,
) {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }
  return startIndex;
}

export function SegmentedControl<T extends string>({
  activeVariant = "neutral",
  ariaLabel,
  className,
  disabled = false,
  fitContent = false,
  label,
  labelClassName,
  name,
  onChange,
  optionClassName,
  options,
  size = "default",
  value,
}: Readonly<SegmentedControlProps<T>>) {
  const generatedId = useId();
  const groupName = name ?? generatedId;

  function selectOption(index: number) {
    const option = options[index];
    if (!option || disabled || option.disabled) {
      return;
    }
    onChange(option.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = enabledIndex(options, index, 1);
      selectOption(nextIndex);
      document.getElementById(`${generatedId}-${nextIndex}`)?.focus();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = enabledIndex(options, index, -1);
      selectOption(nextIndex);
      document.getElementById(`${generatedId}-${nextIndex}`)?.focus();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectOption(index);
    }
  }

  return (
    <fieldset
      aria-label={label ? undefined : ariaLabel}
      className={cn("border-0 p-0", className)}
      disabled={disabled}
    >
      {label ? <legend className={cn("mb-1.5 p-0", labelClassName)}>{label}</legend> : null}
      <div
        className={cn(
          fitContent ? "inline-flex w-fit items-center" : "grid",
          size === "toolbar"
            ? cn(toolbarControlClassName, "gap-0.5 p-[3px]")
            : size === "xs"
              ? "min-h-[30px] gap-0.5 rounded-[8px] border border-border-strong bg-bg-sunken p-[2px]"
              : size === "field"
                ? "min-h-10 gap-1 rounded-[9px] border border-border-strong bg-bg-sunken p-[3px]"
                : "gap-1 rounded-[10px] border border-border-strong bg-bg-sunken p-1",
        )}
        style={
          fitContent
            ? undefined
            : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
        }
      >
        {options.map((option, index) => {
          const active = option.value === value;
          const optionDisabled = disabled || option.disabled;
          return (
            <label
              className={fitContent ? "flex-none" : "min-w-0"}
              key={option.value}
              title={option.tooltip}
            >
              <input
                aria-label={option.ariaLabel}
                checked={active}
                className="peer sr-only"
                disabled={optionDisabled}
                id={`${generatedId}-${index}`}
                name={groupName}
                onChange={() => selectOption(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                type="radio"
                value={option.value}
              />
              <span
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-[7px] border border-transparent text-center normal-case tracking-normal outline-none transition-colors",
                  size === "toolbar"
                    ? "h-[26px] flex-row gap-1.5 px-2.5 py-0.5 text-[12.5px] font-medium"
                    : size === "xs"
                      ? "h-6 flex-row gap-1 px-2.5 text-[12px] font-semibold"
                      : size === "field"
                        ? "min-h-8 px-2 py-1 text-[12.5px] font-semibold"
                        : "min-h-9 px-2 py-1.5 text-[12.5px] font-semibold",
                  active
                    ? activeVariant === "accent"
                      ? "border-accent bg-accent text-white"
                      : size === "toolbar"
                        ? "border-border-strong bg-nav-active text-fg"
                        : "border-border-strong bg-bg-elev text-fg"
                    : "text-fg-muted hover:bg-nav-active hover:text-fg",
                  optionDisabled &&
                    "cursor-not-allowed opacity-55 hover:bg-transparent hover:text-fg-muted",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  optionClassName,
                )}
              >
                {option.label}
                {option.hint ? (
                  <span className="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-fg-faint">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
