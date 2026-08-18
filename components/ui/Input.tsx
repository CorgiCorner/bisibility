"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const inputClassName =
  "border border-border-strong bg-transparent text-fg outline-none transition-colors placeholder:text-fg-muted focus:border-accent disabled:cursor-not-allowed disabled:text-fg-muted";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      className={cn(
        inputClassName,
        "min-h-10 w-full rounded-control px-[13px] py-[9px] text-ui-body font-medium",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
