import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";
export function ButtonGroup({
  className,
  variant = "primary",
  ...props
}: ComponentProps<"fieldset"> & { variant?: "primary" | "secondary" }) {
  return (
    <fieldset
      className={cn(
        "m-0 min-w-0 border-0 p-0 inline-flex [&>button:first-child]:rounded-r-none [&>button:last-child]:rounded-l-none [&>button+button]:-ml-px",
        variant === "primary"
          ? "[&>button+button]:border-l-accent-solid-hover"
          : "[&>button+button]:border-l-border-control",
        className,
      )}
      {...props}
    />
  );
}
