"use client";

import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";
import {
  ToggleGroupItem as ToggleGroupItemPrimitive,
  ToggleGroup as ToggleGroupPrimitive,
} from "./primitives/toggle-group";
import { toggleControlClassName } from "./toggle-control-styles";

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive>) {
  return (
    <ToggleGroupPrimitive className={cn("inline-flex w-max items-center", className)} {...props} />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupItemPrimitive>) {
  return (
    <ToggleGroupItemPrimitive
      className={cn(
        toggleControlClassName,
        "-ml-px rounded-none first:ml-0 first:rounded-l-control last:rounded-r-control",
        className,
      )}
      {...props}
    />
  );
}
