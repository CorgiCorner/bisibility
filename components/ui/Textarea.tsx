"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
  invalid?: boolean;
  monospace?: boolean;
  resize?: "both" | "none" | "vertical";
};

const resizeClass = {
  both: "resize",
  none: "resize-none",
  vertical: "resize-y",
} as const;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, disabled, invalid = false, monospace = true, resize = "vertical", ...props },
  ref,
) {
  return (
    <textarea
      className={cn(
        "min-h-[122px] w-full rounded-[10px] border border-border-strong bg-bg-sunken px-[13px] py-3 text-[13px] leading-[1.7] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent disabled:cursor-not-allowed disabled:opacity-60",
        monospace && "font-mono",
        resizeClass[resize],
        invalid && "border-red focus:border-red",
        className,
      )}
      disabled={disabled}
      ref={ref}
      {...props}
    />
  );
});
