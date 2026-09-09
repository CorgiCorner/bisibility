import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";
export function Spinner({
  className,
  size = 14,
  ...props
}: ComponentProps<"svg"> & { size?: number }) {
  return (
    <svg
      data-spinner
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("animate-spin motion-reduce:animate-none", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
