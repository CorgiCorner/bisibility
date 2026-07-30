"use client";

import Tooltip from "@mui/material/Tooltip";
import { InfoIcon as Info } from "@phosphor-icons/react";

export type InfoTooltipProps = {
  text: string;
};

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <Tooltip title={text}>
      <button
        aria-label={text}
        className="inline-flex h-3 w-3 shrink-0 cursor-help appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-fg-faint transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        type="button"
      >
        <Info aria-hidden size={12} />
      </button>
    </Tooltip>
  );
}
