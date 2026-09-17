import {
  StoredResultFreshness,
  type StoredResultFreshness as StoredResultFreshnessData,
} from "@/components/demo-research/StoredResultFreshness";
import type { DateFormat } from "@/lib/dates/format";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";
import { relativePastLabel, sourceDateLabel } from "./domain-overview-metrics";
import { cacheHoursRemaining } from "./domain-overview-workspace-model";

type DomainOverviewContextBarProps = {
  dateFormat: DateFormat;
  report: Pick<DomainOverviewReport, "fetchedAt" | "provider" | "sourceSnapshotAt"> &
    Partial<Pick<DomainOverviewReport, "cachedUntil">>;
  storedFreshness?: StoredResultFreshnessData;
};

export function DomainOverviewContextBar({
  dateFormat,
  report,
  storedFreshness,
}: Readonly<DomainOverviewContextBarProps>) {
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const now = new Date();
  const cacheHours = report.cachedUntil ? cacheHoursRemaining(report.cachedUntil, now) : 0;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-control border border-border bg-bg-elev px-3.5 py-2.5 font-sans tabular-nums text-[11px] text-fg-muted">
      <span>DataForSEO</span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span>
        {t("providerSnapshot", { date: sourceDateLabel(report.sourceSnapshotAt, dateFormat, t) })}
      </span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span>
        {t("fetched", { relative: relativePastLabel(new Date(report.fetchedAt), now, t) })}
      </span>
      {storedFreshness ? (
        <StoredResultFreshness {...storedFreshness} />
      ) : (
        <span className="ml-0.5 inline-flex items-center gap-1 rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[10.5px] font-semibold text-green-text">
          <CheckCircle aria-hidden size={11} weight="regular" />
          {t("cacheAvailable", { hours: cacheHours })}
        </span>
      )}
    </div>
  );
}
