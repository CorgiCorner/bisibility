"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes } from "react";
import {
  compactInputClassName,
  compactInputGeometryClassName,
  compactInputTypographyClassName,
  inputClassName,
} from "./input-styles";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export {
  compactInputClassName,
  compactInputGeometryClassName,
  compactInputTypographyClassName,
  inputClassName,
};

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
