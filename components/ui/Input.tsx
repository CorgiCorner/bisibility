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

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  density?: "default" | "compact";
};
const inputDensityClasses = {
  default: inputControlSizeClassName,
  compact: `${inputControlSizeClassName} ${compactInputClassName}`,
};

export {
  compactInputClassName,
  compactInputGeometryClassName,
  compactInputTypographyClassName,
  inputClassName,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, density = "default", ...props },
  ref,
) {
  return (
    <input
      className={cn(
        inputClassName,
        inputDensityClasses[density],
        "w-full rounded-control font-medium normal-case tracking-normal",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
