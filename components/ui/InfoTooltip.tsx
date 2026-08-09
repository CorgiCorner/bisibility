"use client";

import Tooltip from "@mui/material/Tooltip";
import { InfoIcon as Info } from "@phosphor-icons/react";

export type InfoTooltipProps = {
  /** Optional destination rendered inside the tooltip, after the text. */
  link?: { href: string; label: string };
  text: string;
};

export function InfoTooltip({ link, text }: InfoTooltipProps) {
  // The button keeps the plain text as its accessible name: a link inside a tooltip is not in
  // the tab order, so it must never be the only way to reach the destination.
  const title = link ? (
    <>
      {text}{" "}
      <a
        className="font-semibold underline underline-offset-2"
        href={link.href}
        rel="noreferrer noopener"
        target="_blank"
      >
        {link.label}
      </a>
    </>
  ) : (
    text
  );

  return (
    <Tooltip title={title}>
      <button
        aria-label={text}
        className="inline-flex h-3 w-3 shrink-0 cursor-help appearance-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-fg-muted transition-colors hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
        type="button"
      >
        <Info aria-hidden size={12} />
      </button>
    </Tooltip>
  );
}
