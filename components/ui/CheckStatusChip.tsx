import { cn } from "@/lib/ui/cn";
import { CheckStatusChipText, type CheckStatusMessageKey } from "./CheckStatusChipText";

export type CheckStatusKind = "completed" | "failed" | "pending" | "running";

export type CheckStatusChipProps = {
  kind: CheckStatusKind;
  label?: string;
};

const statusMeta = {
  completed: { color: "var(--green)", messageKey: "completed", pulse: false },
  failed: { color: "var(--red)", messageKey: "failed", pulse: false },
  pending: { color: "var(--yellow)", messageKey: "pending", pulse: false },
  running: { color: "var(--blue)", messageKey: "running", pulse: true },
} satisfies Record<
  CheckStatusKind,
  { color: string; messageKey: CheckStatusMessageKey; pulse: boolean }
>;

export function CheckStatusChip({ kind, label }: Readonly<CheckStatusChipProps>) {
  const meta = statusMeta[kind];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[4px] text-[10.5px] font-semibold leading-none"
      style={{
        backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        color: "var(--fg)",
      }}
    >
      <span
        aria-hidden
        className={cn("relative h-[6px] w-[6px] flex-none rounded-full", meta.pulse && "bv-ping")}
        style={{ backgroundColor: meta.color, color: meta.color }}
      />
      {label ?? <CheckStatusChipText messageKey={meta.messageKey} />}
    </span>
  );
}
