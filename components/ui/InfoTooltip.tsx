"use client";

import { InfoIcon as Info } from "@phosphor-icons/react";
import { Tooltip } from "./Tooltip";

export type InfoTooltipProps = {
  text: string;
};

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <Tooltip content={text} placement="top" semantics="description">
      <button
        aria-label={text}
        className="inline-grid h-6 w-6 shrink-0 cursor-help appearance-none place-items-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
        type="button"
      >
        <Info aria-hidden size={12} />
      </button>
    </Tooltip>
  );
}
