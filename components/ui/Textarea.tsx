"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { inputClassName } from "./Input";

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
        "min-h-[122px] w-full rounded-[10px] px-[13px] py-3 text-[13px] leading-[1.7]",
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
