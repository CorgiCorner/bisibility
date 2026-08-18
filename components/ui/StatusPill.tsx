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

// HANDOFF-12 §5: one quiet pattern everywhere a status shows - a neutral chip
// (bg-sunken + thin border) with a colored status dot.
const statusMeta = {
  connected: { label: "Connected", color: "var(--green)" },
  needs_reauth: { label: "Reconnect required", color: "var(--red)" },
  ready: { label: "Ready", color: "var(--blue)" },
  planned: { label: "Planned", color: "var(--yellow)" },
  optional: { label: "Optional", color: "var(--fg-muted)" },
  success: { label: "Success", color: "var(--green)" },
  failed: { label: "Failed", color: "var(--red)" },
  matches: { label: "Matches", color: "var(--green)" },
  wrong_url: { label: "Wrong URL", color: "var(--yellow)" },
  primary: { label: "Primary", color: "var(--accent)" },
  disabled: { label: "Disabled", color: "var(--fg-muted)" },
  create: { label: "CREATE", color: "var(--green)" },
  update: { label: "UPDATE", color: "var(--yellow)" },
  delete: { label: "DELETE", color: "var(--red)" },
  import: { label: "IMPORT", color: "var(--blue)" },
  export: { label: "EXPORT", color: "var(--blue)" },
  login: { label: "LOGIN", color: "var(--purple)" },
} satisfies Record<StatusKind, { label: string; color: string }>;

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

function StatusDot({ color }: Readonly<{ color: string }>) {
  return (
    <span
      aria-hidden
      className="h-[6px] w-[6px] flex-none rounded-full"
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
        {shouldShowDot ? <StatusDot color={meta.color} /> : null}
        {label ?? meta.label}
      </span>
      {primary ? (
        <span className={cn(chipVariants({ size }))}>
          {shouldShowDot ? <StatusDot color="var(--accent)" /> : null}
          Primary
        </span>
      ) : null}
    </span>
  );
}
