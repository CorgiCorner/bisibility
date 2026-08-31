"use client";

import { cn } from "@/lib/ui/cn";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Inline monospace code chip (Slack-backtick style) for env vars and identifiers
 * shown inside a callout. Exported so other env-var alerts reuse the same chip.
 */
export const inlineCalloutCodeClass =
  "whitespace-nowrap rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg";

export function InlineCode({ children }: Readonly<{ children: ReactNode }>) {
  return <code className={inlineCalloutCodeClass}>{children}</code>;
}

export type InlineCalloutTint = "neutral" | "red" | "yellow";

export type InlineCalloutProps = {
  children: ReactNode;
  /** Extra classes on the callout, e.g. `mt-3` for spacing from the element above. */
  className?: string;
  contentClassName?: string;
  role?: "alert" | "note" | "status";
  tint: InlineCalloutTint;
};

// Tint tokens mirror AlertBanner so the two alert surfaces read as one system.
const tintStyles = {
  neutral: {
    border: "border-border",
    background: "bg-bg-sunken",
    icon: "text-fg-muted",
  },
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
export function InlineCallout({
  children,
  className,
  contentClassName,
  role = "alert",
  tint,
}: Readonly<InlineCalloutProps>) {
  const style = tintStyles[tint];
  return (
    <p
      aria-label={typeof children === "string" ? children : undefined}
      data-tint={tint}
      className={cn(
        "m-0 flex items-start gap-2 rounded-control border px-3 py-2.5 text-[12.5px] leading-[1.5] text-fg-muted",
        style.border,
        style.background,
        className,
      )}
      role={role}
    >
      <WarningCircle
        aria-hidden
        className={cn("mt-0.5 shrink-0", style.icon)}
        size={15}
        weight="regular"
      />
      <span className={cn("min-w-0 break-words", contentClassName)}>{children}</span>
    </p>
  );
}
