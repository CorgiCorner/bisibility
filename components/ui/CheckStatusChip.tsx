import { cn } from "@/lib/ui/cn";

export type CheckStatusKind = "completed" | "failed" | "pending" | "running";

export type CheckStatusChipProps = {
  kind: CheckStatusKind;
  label?: string;
};

const statusMeta = {
  completed: { color: "var(--green)", label: "Completed", pulse: false },
  failed: { color: "var(--red)", label: "Failed", pulse: false },
  pending: { color: "var(--yellow-strong)", label: "Pending", pulse: false },
  running: { color: "var(--blue)", label: "Running", pulse: true },
} satisfies Record<CheckStatusKind, { color: string; label: string; pulse: boolean }>;

export function CheckStatusChip({ kind, label }: Readonly<CheckStatusChipProps>) {
  const meta = statusMeta[kind];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[4px] font-mono text-[10.5px] font-semibold leading-none"
      style={{
        backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        color: meta.color,
      }}
    >
      <span
        aria-hidden
        className={cn("h-[6px] w-[6px] flex-none rounded-full", meta.pulse && "bv-ping")}
        style={{ backgroundColor: meta.color, color: meta.color }}
      />
      {label ?? meta.label}
    </span>
  );
}
