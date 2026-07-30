"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  containerClassName?: string;
  controlClassName?: string;
  description?: ReactNode;
  inputClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
};

const inputClass =
  "peer col-start-1 row-start-1 m-0 size-full cursor-pointer appearance-none rounded-[5px] " +
  "border-[1.5px] border-border-strong bg-bg-sunken outline-none transition-colors " +
  "hover:border-accent checked:border-accent checked:bg-accent focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed " +
  "disabled:hover:border-border-strong";

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    className,
    containerClassName,
    controlClassName,
    description,
    disabled,
    id,
    inputClassName,
    label,
    labelClassName,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = (
    <span
      className={cn(
        "relative inline-grid size-4 shrink-0 place-items-center",
        disabled && "opacity-55",
        controlClassName,
      )}
    >
      <input
        className={cn(inputClass, inputClassName)}
        disabled={disabled}
        id={inputId}
        ref={ref}
        type="checkbox"
        {...props}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 size-[68%] text-white opacity-0 transition-opacity peer-checked:opacity-100"
        fill="none"
        focusable="false"
        viewBox="0 0 16 16"
      >
        <path
          d="m3.2 8.3 3 2.8 6.6-6.2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
        />
      </svg>
    </span>
  );

  if (!label && !description) {
    return input;
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 text-fg",
        disabled && "cursor-not-allowed opacity-60",
        containerClassName,
        className,
      )}
      htmlFor={inputId}
    >
      {input}
      <span className={cn("min-w-0", labelClassName)}>
        {label ? (
          <span className="block text-[13.5px] font-semibold leading-5">{label}</span>
        ) : null}
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-fg-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
});
