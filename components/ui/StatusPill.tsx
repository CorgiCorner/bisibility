import { cn } from "@/lib/ui/cn";
import type { StatusKind } from "@/lib/ui/status-kind";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

export type { StatusKind } from "@/lib/ui/status-kind";

export type StatusPillProps = {
  status: StatusKind;
  primary?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  icon?: ReactNode;
  showDot?: boolean;
};

// HANDOFF-12 §5: one quiet pattern everywhere a live status shows - a neutral chip
// (bg-sunken + thin border) with a colored status dot; the healthy dot pulses.
const statusMeta = {
  connected: { label: "Connected", color: "var(--green)", healthy: true },
  needs_reauth: { label: "Reconnect required", color: "var(--red)", healthy: false },
  ready: { label: "Ready", color: "var(--blue)", healthy: false },
  planned: { label: "Planned", color: "var(--yellow)", healthy: false },
  optional: { label: "Optional", color: "var(--fg-muted)", healthy: false },
} satisfies Record<StatusKind, { label: string; color: string; healthy: boolean }>;

const chipVariants = cva(
  "inline-flex items-center rounded-full border border-border bg-bg-sunken font-mono font-semibold leading-none tracking-[0.3px] text-fg-muted",
  {
    variants: {
      size: {
        sm: "h-5 gap-1.5 px-1.5 text-[9px]",
        md: "h-6 gap-1.5 px-2 text-[10px]",
        lg: "h-7 gap-2 px-2.5 text-[11px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function StatusDot({ color, healthy }: Readonly<{ color: string; healthy: boolean }>) {
  return (
    <span
      aria-hidden
      className={cn("h-[6px] w-[6px] flex-none rounded-full", healthy && "bv-ping")}
      style={{ backgroundColor: color, color }}
    />
  );
}

export function StatusPill({
  status,
  primary = false,
  size = "md",
  label,
  icon,
  showDot,
}: Readonly<StatusPillProps>) {
  const meta = statusMeta[status];
  const shouldShowDot = showDot ?? status !== "planned";
  return (
    <span className={cn("inline-flex items-center", size === "lg" ? "gap-2" : "gap-1.5")}>
      <span className={cn(chipVariants({ size }))}>
        {icon}
        {shouldShowDot ? <StatusDot color={meta.color} healthy={meta.healthy} /> : null}
        {label ?? meta.label}
      </span>
      {primary ? (
        <span className={cn(chipVariants({ size }))}>
          {shouldShowDot ? <StatusDot color="var(--accent)" healthy={false} /> : null}
          Primary
        </span>
      ) : null}
    </span>
  );
}
