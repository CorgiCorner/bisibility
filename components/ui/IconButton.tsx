"use client";
import { cn } from "@/lib/ui/cn";
import { Button, type ButtonProps } from "./Button";
export type IconButtonProps = Omit<ButtonProps, "size"> & { size?: "small" | "medium" | "large" };
export function IconButton({ size = "medium", className, ...props }: IconButtonProps) {
  return (
    <Button
      variant="ghost"
      size="xs"
      className={cn(
        "min-w-0 rounded-full",
        size === "small" ? "min-h-7 p-1.25" : size === "large" ? "min-h-11 p-3" : "min-h-9 p-2",
        className,
      )}
      {...props}
    />
  );
}
