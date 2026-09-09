"use client";

import { track } from "@/lib/analytics/client";
import { type AnalyticsControlId, analyticsControlModule } from "@/lib/analytics/controls";
import { cn } from "@/lib/ui/cn";
import {
  type ChangeEvent,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from "react";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "role" | "size" | "type"> & {
  analytics?: { control: AnalyticsControlId };
  description?: ReactNode;
  inputClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  thumbClassName?: string;
  thumbContent?: ReactNode;
  trackClassName?: string;
  trackContent?: ReactNode;
};

const visualClass = "relative h-[18px] w-8 shrink-0";

const trackClass =
  "absolute inset-0 rounded-full border border-border-control bg-transparent transition-colors duration-[var(--motion-tooltip)] ease-[ease] " +
  "peer-checked:border-accent peer-checked:bg-accent-soft " +
  "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 " +
  "peer-disabled:border-border-control peer-disabled:bg-bg-inset";

const thumbClass =
  "absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-fg-muted transition-transform duration-[var(--motion-tooltip)] ease-[var(--ease-in-out)] motion-reduce:transition-none " +
  "peer-checked:translate-x-3.5 peer-checked:bg-accent " +
  "peer-disabled:bg-fg-muted/55 peer-checked:peer-disabled:bg-accent/55";

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    analytics,
    checked,
    className,
    defaultChecked,
    description,
    disabled,
    id,
    inputClassName,
    label,
    labelClassName,
    onChange,
    thumbClassName,
    thumbContent,
    trackClassName,
    trackContent,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
  const isChecked = checked ?? internalChecked;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (checked === undefined) {
      setInternalChecked(event.currentTarget.checked);
    }
    onChange?.(event);
    if (analytics) {
      track("ui_option_selected", {
        control: analytics.control,
        module: analyticsControlModule(analytics.control),
        value: event.currentTarget.checked,
      });
    }
  }

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-control border border-border-control bg-bg-elev px-3 py-2 text-[12.5px] font-semibold text-fg-muted",
        description && "items-start",
        disabled ? "cursor-not-allowed text-fg-muted" : "cursor-pointer",
        className,
      )}
      htmlFor={inputId}
    >
      <span className={visualClass}>
        <input
          aria-checked={isChecked}
          className={cn("peer sr-only", inputClassName)}
          checked={checked}
          defaultChecked={defaultChecked}
          disabled={disabled}
          id={inputId}
          onChange={handleChange}
          ref={ref}
          role="switch"
          type="checkbox"
          {...props}
        />
        <span aria-hidden className={cn(trackClass, trackClassName)}>
          {trackContent}
        </span>
        <span aria-hidden className={cn(thumbClass, thumbClassName)}>
          {thumbContent}
        </span>
      </span>
      {label || description ? (
        <span className={cn("min-w-0", labelClassName)}>
          {label ? <span className="block">{label}</span> : null}
          {description ? (
            <span className="mt-0.5 block text-[11.5px] font-medium leading-5 text-fg-muted">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
});
