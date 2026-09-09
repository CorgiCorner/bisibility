"use client";

import { cn } from "@/lib/ui/cn";
import { Fragment, type KeyboardEvent, type ReactNode, useId } from "react";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";
import { toolbarControlClassName } from "./toolbar-control-styles";

export type SegmentedControlOption<T extends string> = {
  ariaLabel?: string;
  disabled?: boolean;
  hint?: ReactNode;
  label: ReactNode;
  tooltip?: string;
  value: T;
};

/**
 * @deprecated Both variants now render the same canonical active style.
 * The prop is retained for caller compatibility but has no visual effect.
 */
export type SegmentedControlActiveVariant = "accent" | "neutral";

export type SegmentedControlSize = "default" | "field" | "toolbar" | "xs";

export type SegmentedControlProps<T extends string> = {
  /**
   * @deprecated Both variants now render the same canonical active style.
   * The prop is retained for caller compatibility but has no visual effect.
   */
  activeVariant?: SegmentedControlActiveVariant;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Let each option size itself to its content instead of sharing the available width. */
  fitContent?: boolean;
  label?: ReactNode;
  labelClassName?: string;
  loading?: boolean;
  name?: string;
  onChange: (value: T) => void;
  optionClassName?: string;
  /** Merged onto the selected option; use to swap the default active fill. */
  activeClassName?: string;
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
  ariaLabel,
  className,
  disabled = false,
  fitContent = false,
  label,
  labelClassName,
  loading = false,
  name,
  onChange,
  optionClassName,
  activeClassName,
  options,
  size = "default",
  value,
}: Readonly<SegmentedControlProps<T>>) {
  const generatedId = useId();
  const groupName = name ?? generatedId;
  const busy = disabled || loading;

  function selectOption(index: number) {
    const option = options[index];
    if (!option || busy || option.disabled) {
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
      aria-busy={loading ? true : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("relative border-0 p-0", className)}
      disabled={busy}
    >
      {label ? <legend className={cn("mb-1.5 p-0", labelClassName)}>{label}</legend> : null}
      <div
        className={cn(
          fitContent ? "inline-flex w-fit items-center" : "grid",
          size === "toolbar"
            ? cn(toolbarControlClassName, "gap-0.5 p-[3px]")
            : size === "xs"
              ? "min-h-[30px] gap-0.5 rounded-control border border-border-control bg-transparent p-[2px]"
              : size === "field"
                ? "min-h-10 gap-1 rounded-control border border-border-control bg-transparent p-[3px]"
                : "gap-1 rounded-control border border-border-control bg-transparent p-1",
          loading && "opacity-65",
        )}
        style={
          fitContent
            ? undefined
            : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
        }
      >
        {options.map((option, index) => {
          const active = option.value === value;
          const optionDisabled = busy || option.disabled;
          const descriptionId = `${generatedId}-desc-${index}`;
          const labelEl = (
            <label className={cn("flex", fitContent ? "flex-none" : "min-w-0")} key={option.value}>
              <input
                aria-describedby={option.tooltip ? descriptionId : undefined}
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
                  "flex w-full cursor-pointer flex-col items-center justify-center rounded-control border border-transparent text-center normal-case tracking-normal transition-colors",
                  size === "toolbar"
                    ? "h-[26px] flex-row gap-1.5 px-2.5 py-0.5 text-[12.5px] font-normal"
                    : size === "xs"
                      ? "h-6 flex-row gap-1 px-2.5 text-[12px] font-semibold"
                      : size === "field"
                        ? "min-h-8 px-2 py-1 text-[12.5px] font-semibold"
                        : "min-h-9 px-2 py-1.5 text-[12.5px] font-semibold",
                  active
                    ? cn(
                        "border-border-control text-fg",
                        size === "toolbar" ? "bg-bg-sunken" : "bg-nav-active",
                        activeClassName,
                      )
                    : "text-fg-muted hover:bg-bg-sunken hover:text-fg",
                  optionDisabled &&
                    "cursor-not-allowed text-fg-muted hover:bg-transparent hover:text-fg-muted",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-solid",
                  optionClassName,
                )}
              >
                {option.label}
                {option.hint ? (
                  <span className="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-fg-muted">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
          return option.tooltip ? (
            <Fragment key={option.value}>
              <Tooltip content={option.tooltip} semantics="description">
                {labelEl}
              </Tooltip>
              <span className="sr-only" id={descriptionId}>
                {option.tooltip}
              </span>
            </Fragment>
          ) : (
            labelEl
          );
        })}
      </div>
      {loading ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Spinner size={14} />
        </span>
      ) : null}
    </fieldset>
  );
}
