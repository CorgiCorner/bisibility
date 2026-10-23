import {
  StoredResultFreshness,
  type StoredResultFreshness as StoredResultFreshnessData,
} from "@/components/demo-research/StoredResultFreshness";
import { Button } from "@/components/ui/Button";
import type { DateFormat } from "@/lib/dates/format";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { HistoricalOverviewRow } from "@/lib/providers/types";
import { wholeSecondsRemaining } from "@/lib/ui/format-duration";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { relativePastLabel, sourceDateLabel } from "./domain-overview-metrics";
import { downloadDomainOverviewSummary } from "./domain-overview-table-export";

type DomainOverviewContextBarProps = {
  countryCode?: string;
  dateFormat: DateFormat;
  history?: readonly HistoricalOverviewRow[] | null;
  refresh?: { busy?: boolean; onClick: () => void; price?: ReactNode };
  report: Pick<
    DomainOverviewReport,
    | "fetchedAt"
    | "languageCode"
    | "locationCode"
    | "overview"
    | "previousOverview"
    | "provider"
    | "scope"
    | "sourceSnapshotAt"
    | "target"
  > &
    Partial<Pick<DomainOverviewReport, "cachedUntil" | "payment" | "originalPayment">>;
  storedFreshness?: StoredResultFreshnessData;
};

export function DomainOverviewContextBar({
  countryCode,
  dateFormat,
  history = null,
  refresh,
  report,
  storedFreshness,
}: Readonly<DomainOverviewContextBarProps>) {
  const analyze = useTranslations("projectDomainOverview.workspace.analyze");
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const formatDuration = useFormatDuration();
  const now = new Date();
  const cacheSeconds = report.cachedUntil
    ? Math.max(0, wholeSecondsRemaining(report.cachedUntil, now))
    : 0;
  function exportSummary() {
    if (!report.overview) return;
    downloadDomainOverviewSummary({
      countryCode,
      fetchedAt: report.fetchedAt,
      history,
      languageCode: report.languageCode,
      locationCode: report.locationCode,
      overview: report.overview,
      previousOverview: report.previousOverview,
      provider: report.provider,
      scope: report.scope,
      sourceSnapshotAt: report.sourceSnapshotAt,
      target: report.target,
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-control border border-border bg-bg-elev px-3.5 py-2.5 font-sans tabular-nums text-[11px] text-fg-muted">
      <span className="font-semibold text-fg" data-domain-overview-target="">
        {report.target}
      </span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      <span>
        {report.originalPayment?.option.providerId === report.provider
          ? report.originalPayment.option.providerLabel
          : report.payment?.option.providerId === report.provider
            ? report.payment.option.providerLabel
            : report.provider}
      </span>
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
          {t("cacheAvailable", { duration: formatDuration(cacheSeconds) })}
        </span>
      )}
      <Button
        aria-label={t("exportSummaryAria")}
        className="ml-auto"
        disabled={!report.overview}
        onClick={exportSummary}
        size="xs"
        startIcon={<DownloadSimple weight="regular" size={14} />}
        variant="secondary"
      >
        {t("exportSummary")}
      </Button>
      {refresh ? (
        <Button loading={refresh.busy} onClick={refresh.onClick} size="xs" variant="outline">
          {analyze("refresh")}
          {refresh.price}
        </Button>
      ) : null}
    </div>
  );
}
