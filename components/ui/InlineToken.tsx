"use client";

import { XIcon as X } from "@phosphor-icons/react";
import { clsx } from "clsx";

export type InlineTokenProps = {
  className?: string;
  dismissLabel?: string;
  onDismiss?: () => void;
  value: string;
};

export function InlineToken({
  className,
  dismissLabel,
  onDismiss,
  value,
}: Readonly<InlineTokenProps>) {
  return (
    <span
      className={clsx(
        "inline-flex h-[26px] items-center gap-1 rounded-control border border-border bg-bg-elev py-1 ps-2 pe-1 text-[12px] font-medium leading-4",
        className,
      )}
    >
      <span>{value}</span>
      {onDismiss ? (
        <button
          aria-label={dismissLabel ?? `Remove ${value}`}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden size={14} weight="bold" />
        </button>
      ) : null}
    </span>
  );
}
