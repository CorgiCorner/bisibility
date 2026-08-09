import type { StatusKind } from "@/components/ui";

const statusMeta = {
  connected: {
    background: "color-mix(in srgb, var(--green) 12%, transparent)",
    color: "var(--green-text)",
    label: "Connected",
  },
  needs_reauth: {
    background: "color-mix(in srgb, var(--red) 12%, transparent)",
    color: "var(--red)",
    label: "Reconnect required",
  },
  optional: { background: "var(--bg-sunken)", color: "var(--fg-muted)", label: "Optional" },
  planned: {
    background: "color-mix(in srgb, var(--purple) 12%, transparent)",
    color: "var(--purple)",
    label: "Planned",
  },
  ready: {
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
    color: "var(--blue)",
    label: "Ready to connect",
  },
} satisfies Record<StatusKind, { background: string; color: string; label: string }>;

export function ProviderStatusBadge({ status }: Readonly<{ status: StatusKind }>) {
  const meta = statusMeta[status];

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.3px]"
      style={{ backgroundColor: meta.background, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}
