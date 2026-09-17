import { cn } from "@/lib/ui/cn";
import type { StatusKind } from "@/lib/ui/status-kind";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { type StatusPillMessageKey, StatusPillText } from "./StatusPillText";

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
  connected: { labelKey: "connected", color: "var(--green)" },
  needs_reauth: { labelKey: "needsReauth", color: "var(--red)" },
  ready: { labelKey: "ready", color: "var(--green)" },
  planned: { labelKey: "planned", color: "var(--yellow)" },
  optional: { labelKey: "optional", color: "var(--fg-muted)" },
  success: { labelKey: "success", color: "var(--green)" },
  failed: { labelKey: "failed", color: "var(--red)" },
  matches: { labelKey: "matches", color: "var(--green)" },
  wrong_url: { labelKey: "wrongUrl", color: "var(--yellow)" },
  primary: { labelKey: "primary", color: "var(--accent)" },
  disabled: { labelKey: "disabled", color: "var(--fg-muted)" },
  create: { labelKey: "create", color: "var(--green)" },
  update: { labelKey: "update", color: "var(--yellow)" },
  delete: { labelKey: "delete", color: "var(--red)" },
  import: { labelKey: "import", color: "var(--blue)" },
  export: { labelKey: "export", color: "var(--blue)" },
  login: { labelKey: "login", color: "var(--purple)" },
} as const satisfies Record<StatusKind, { labelKey: StatusPillMessageKey; color: string }>;

const chipVariants = cva(
  "inline-flex items-center rounded-full border border-border bg-bg-sunken font-semibold leading-none tracking-[0.3px] text-fg-muted",
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
        {label ?? <StatusPillText messageKey={meta.labelKey} />}
      </span>
      {primary ? (
        <span className={cn(chipVariants({ size }))}>
          {shouldShowDot ? <StatusDot color="var(--accent)" /> : null}
          <StatusPillText messageKey="primary" />
        </span>
      ) : null}
    </span>
  );
}
