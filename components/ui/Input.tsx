"use client";

import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes } from "react";
import {
  compactInputClassName,
  compactInputGeometryClassName,
  compactInputTypographyClassName,
  inputClassName,
  inputControlSizeClassName,
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
        inputControlSizeClassName,
        "w-full rounded-control font-medium normal-case tracking-normal",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
