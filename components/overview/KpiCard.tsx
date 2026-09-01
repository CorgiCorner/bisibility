import { Card, InfoTooltip } from "@/components/ui";
import { rankTrackerTabPath } from "@/lib/routing/app-path";
import Link from "next/link";
import type { KpiDeltaTone, OverviewKpi } from "./types";

export type KpiCardProps = OverviewKpi & {
  description?: string;
  detail?: string;
  projectRef?: string;
};

const deltaToneClassName = {
  positive: "text-green-text",
  negative: "text-red-text",
  neutral: "text-fg-muted",
} satisfies Record<KpiDeltaTone, string>;

export function KpiCard({
  label,
  value,
  delta,
  deltaAction,
  deltaTone,
  description,
  detail,
  projectRef,
}: Readonly<KpiCardProps>) {
  const valueClassName = value === "-" || value === "–" ? "text-fg-muted" : "text-fg";

  return (
    <Card className="min-w-0 rounded-card px-4.5 py-4" size="md">
      <div className="flex min-h-6 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.8px] text-fg-muted">
        <span className="truncate">{label}</span>
        {description ? <InfoTooltip text={description} /> : null}
      </div>
      <div className="mt-[9px] flex items-end gap-3">
        <span className="min-w-0">
          <span
            className={`bv-countup text-[28px] font-bold leading-none tracking-[-0.8px] ${valueClassName}`}
          >
            {value}
          </span>
          {deltaAction === "check_runs" && projectRef ? (
            <Link
              className={`ml-2 align-baseline font-mono text-xs font-semibold hover:underline ${deltaToneClassName[deltaTone]}`}
              href={rankTrackerTabPath(projectRef, "checks")}
            >
              {delta}
            </Link>
          ) : (
            <span
              className={`ml-2 align-baseline font-mono text-xs font-semibold ${deltaToneClassName[deltaTone]}`}
            >
              {delta}
            </span>
          )}
        </span>
      </div>
      {detail ? (
        <div className="mt-2 font-mono text-[11px] leading-normal text-fg-muted">{detail}</div>
      ) : null}
    </Card>
  );
}
