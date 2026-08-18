import { Tooltip } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import * as rankDepth from "@/lib/serp/rank-depth";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CircleIcon as Circle,
} from "@phosphor-icons/react";

function deltaFor(row: KeywordRow) {
  if (row.positionBaseline === null) return null;
  const change = row.positionBaseline - row.position;
  if (change > 0) {
    return {
      color: "var(--green-text)",
      icon: ArrowUp,
      label: String(change),
      title: `Up ${change}`,
    };
  }
  if (change < 0) {
    return {
      color: "var(--red)",
      icon: ArrowDown,
      label: String(Math.abs(change)),
      title: `Down ${Math.abs(change)}`,
    };
  }
  return { color: "var(--fg-muted)", icon: Circle, label: "0", title: "No change" };
}

export function KeywordChangeCell({ row }: Readonly<{ row: KeywordRow }>) {
  if (!rankDepth.hasTrackedPosition(row)) return null;
  if (row.positionBaseline === null) {
    return (
      <span
        aria-label="First observation"
        className="inline-flex h-auto shrink-0 self-center items-center whitespace-nowrap rounded-full border border-border bg-accent-soft px-2.5 py-1 font-mono text-[11px] font-semibold leading-none text-accent-text"
      >
        New
      </span>
    );
  }

  const delta = deltaFor(row);
  if (!delta) return null;
  const Icon = delta.icon;
  return (
    <Tooltip content={delta.title}>
      <span
        aria-label={delta.title}
        className="inline-flex items-center gap-1 font-mono text-xs font-semibold"
        style={{ color: delta.color }}
      >
        <Icon size={delta.label === "0" ? 7 : 12} weight={delta.label === "0" ? "fill" : "bold"} />
        {delta.label}
      </span>
    </Tooltip>
  );
}
