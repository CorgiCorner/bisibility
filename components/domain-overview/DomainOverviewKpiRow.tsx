import { Card, InfoTooltip } from "@/components/ui";
import type { DateFormat } from "@/lib/dates/format";
import type { DomainRankMetrics } from "@/lib/providers/types";
import { cn } from "@/lib/ui/cn";
import {
  domainOverviewKpis,
  emptyDomainOverviewKpis,
  sourceDateLabel,
} from "./domain-overview-metrics";

const toneClass = {
  negative: "text-red-text",
  neutral: "text-fg-muted",
  positive: "text-green-text",
} as const;

export function DomainOverviewKpiRow({
  dateFormat,
  metrics,
  previous,
  previousSourceSnapshotAt,
  sourceSnapshotAt,
}: Readonly<{
  dateFormat: DateFormat;
  metrics: DomainRankMetrics | null;
  previous: DomainRankMetrics | null;
  previousSourceSnapshotAt: string | null;
  sourceSnapshotAt: string | null;
}>) {
  const definition = metrics
    ? previousSourceSnapshotAt
      ? `Estimated from the DataForSEO index snapshot of ${sourceDateLabel(sourceSnapshotAt, dateFormat)}, compared with ${sourceDateLabel(previousSourceSnapshotAt, dateFormat)}. Not tracked ranking data.`
      : `Estimated from the DataForSEO index snapshot of ${sourceDateLabel(sourceSnapshotAt, dateFormat)}. No prior source snapshot is available yet.`
    : "No indexed organic metrics are available for this domain and market.";
  const kpis = metrics ? domainOverviewKpis(metrics, previous) : emptyDomainOverviewKpis();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => (
        <Card className="min-w-0 rounded-card px-4.5 py-4" key={kpi.label} size="md">
          <div className="flex items-center gap-1.5 font-sans tabular-nums text-[10.5px] uppercase tracking-[0.8px] text-fg-muted">
            <span className="truncate">{kpi.label}</span>
            <InfoTooltip text={definition} />
          </div>
          <div className="mt-[9px] flex items-baseline gap-2 whitespace-nowrap">
            <span
              className={cn(
                "text-[28px] font-bold leading-none tracking-[-0.8px]",
                metrics ? "bv-countup" : null,
                kpi.value === "-" ? "text-fg-muted" : "text-fg",
              )}
            >
              {kpi.value}
            </span>
            {kpi.delta ? (
              <span
                className={cn(
                  "font-sans tabular-nums text-xs font-semibold",
                  toneClass[kpi.deltaTone],
                )}
              >
                {kpi.delta}
              </span>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
