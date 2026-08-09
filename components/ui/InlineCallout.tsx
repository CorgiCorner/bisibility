"use client";

import { cn } from "@/lib/ui/cn";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Inline monospace code chip (Slack-backtick style) for env vars and identifiers
 * shown inside a callout. Exported so other env-var alerts reuse the same chip.
 */
export const inlineCalloutCodeClass =
  "rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg";

export function InlineCode({ children }: Readonly<{ children: ReactNode }>) {
  return <code className={inlineCalloutCodeClass}>{children}</code>;
}

export type InlineCalloutTint = "red" | "yellow";

export type InlineCalloutProps = {
  children: ReactNode;
  /** Extra classes on the callout, e.g. `mt-3` for spacing from the element above. */
  className?: string;
  tint: InlineCalloutTint;
};

// Tint tokens mirror AlertBanner so the two alert surfaces read as one system.
const tintStyles = {
  red: {
    border: "border-red",
    background: "bg-[color-mix(in_srgb,var(--red)_7%,transparent)]",
    icon: "text-red-text",
  },
  yellow: {
    border: "border-yellow",
    background: "bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)]",
    icon: "text-yellow-text",
  },
} satisfies Record<InlineCalloutTint, { background: string; border: string; icon: string }>;

/** Free-form inline callout, distinct from the structured full-width AlertBanner. */
export function InlineCallout({ children, className, tint }: Readonly<InlineCalloutProps>) {
  const style = tintStyles[tint];
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-[1.5] text-fg-muted",
        style.border,
        style.background,
        className,
      )}
      role="alert"
    >
      <WarningCircle
        aria-hidden
        className={cn("mt-0.5 shrink-0", style.icon)}
        size={15}
        weight="fill"
      />
      <span>{children}</span>
    </p>
  );
}
