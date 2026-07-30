"use client";

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
  description?: ReactNode;
  inputClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
};

const visualClass = "relative h-5 w-9 shrink-0";

const trackClass =
  "absolute inset-0 rounded-full border border-border-strong bg-bg-sunken transition-colors " +
  "peer-checked:border-accent peer-checked:bg-accent-soft " +
  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 " +
  "peer-focus-visible:outline-accent peer-disabled:opacity-55";

const thumbClass =
  "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-fg-faint transition-transform " +
  "peer-checked:translate-x-4 peer-checked:bg-accent peer-disabled:opacity-55";

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
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
  }

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-[9px] border border-border-strong bg-bg-elev px-3 py-2 text-[12.5px] font-semibold text-fg-muted",
        description && "items-start",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
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
        <span aria-hidden className={trackClass} />
        <span aria-hidden className={thumbClass} />
      </span>
      {label || description ? (
        <span className={cn("min-w-0", labelClassName)}>
          {label ? <span className="block">{label}</span> : null}
          {description ? (
            <span className="mt-0.5 block text-[11.5px] font-medium leading-5 text-fg-faint">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
});
