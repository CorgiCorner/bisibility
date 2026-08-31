"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { inputClassName } from "./input-styles";

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
        inputClassName,
        "min-h-[122px] w-full rounded-control px-[13px] py-3 text-[13px] leading-[1.7] placeholder:text-[13px] placeholder:leading-[1.7] placeholder:text-fg-muted",
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
