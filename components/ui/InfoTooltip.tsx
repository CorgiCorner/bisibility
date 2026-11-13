"use client";

import { cn } from "@/lib/ui/cn";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { Tooltip } from "./Tooltip";

export type InfoTooltipProps = {
  text: string;
  size?: "default" | "label";
};

export function InfoTooltip({ text, size = "default" }: InfoTooltipProps) {
  return (
    <Tooltip content={text} placement="top" semantics="description">
      <button
        aria-label={text}
        className={cn(
          "inline-grid shrink-0 cursor-help appearance-none place-items-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid",
          size === "label" ? "size-4" : "h-6 w-6",
        )}
        type="button"
      >
        <Info aria-hidden size={12} weight="regular" />
      </button>
    </Tooltip>
  );
}
