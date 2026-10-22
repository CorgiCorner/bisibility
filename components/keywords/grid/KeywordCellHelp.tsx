"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

/** A compact value remains a keyboard/touch-accessible help trigger. */
export function KeywordCellHelp({
  children,
  description,
  label,
  className,
}: Readonly<{
  children: ReactNode;
  description: string;
  label?: string;
  className?: string;
}>) {
  return (
    <Tooltip content={description} semantics="description">
      <button
        aria-label={label}
        className={cn(
          "block min-w-0 max-w-full cursor-help appearance-none truncate border-0 bg-transparent p-0 text-inherit text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
        type="button"
      >
        {children}
      </button>
    </Tooltip>
  );
}
