import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import { relativePast } from "@/lib/format/relative-time";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { sourceDateLabel } from "./domain-overview-metrics";
import { cacheHoursRemaining } from "./domain-overview-workspace-model";

type DomainOverviewContextBarProps = {
  report: DomainOverviewReport;
};

export function DomainOverviewContextBar({ report }: Readonly<DomainOverviewContextBarProps>) {
  const now = new Date();
  const hours = cacheHoursRemaining(report.cachedUntil, now);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[11px] border border-border bg-bg-elev px-3.5 py-2.5 font-mono text-[11px] text-fg-muted">
      <span>DataForSEO</span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span>index snapshot {sourceDateLabel(report.sourceSnapshotAt)}</span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span>fetched {relativePast(new Date(report.fetchedAt), now)}</span>
      <span className="ml-0.5 inline-flex items-center gap-1 rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[10.5px] font-semibold text-green-text">
        <CheckCircle aria-hidden size={11} weight="fill" />
        cached, free for {hours}h
      </span>
    </div>
  );
}
