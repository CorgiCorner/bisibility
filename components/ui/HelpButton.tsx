"use client";

import { cn } from "@/lib/ui/cn";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import type { ComponentProps } from "react";

/** Matches InfoTooltip; callers retain their hover help and optional details action. */
export function HelpButton({
  className,
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        "inline-grid h-6 w-6 shrink-0 cursor-help appearance-none place-items-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid",
        className,
      )}
    >
      <Info aria-hidden size={12} weight="regular" />
    </button>
  );
}
