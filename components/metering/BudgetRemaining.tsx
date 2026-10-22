"use client";

import { usageCapFromBudget } from "@/components/usagekit/usage-cap-pill";
import { UsageTrack } from "@/components/usagekit/usage-meter";
import type { BudgetRow } from "@usagekit/views";

export function BudgetRemaining({ row }: { row: BudgetRow }) {
  const cap = usageCapFromBudget(row);
  if (row.limit === "unlimited" || row.redacted || cap.percent == null) return null;
  const withoutReserved = usageCapFromBudget({
    ...row,
    reserved: { text: "0", unit: row.unit, certainty: "measured" },
  });
  const used = Math.min(100, withoutReserved.percent ?? cap.percent);
  const fill = row.bar?.used ?? String(used);
  const reserved =
    row.bar?.reserved ?? String(Math.max(0, Math.min(100 - used, cap.percent - used)));

  return (
    <UsageTrack
      size="sm"
      level={row.level === "warning" || row.level === "exceeded" ? row.level : "ok"}
      fill={`${fill}%`}
      reserved={reserved ? `${reserved}%` : undefined}
      className="mt-2 w-24"
      aria-hidden
    />
  );
}
