import { Card } from "@/components/ui/Card";
import type { DomainRankMetrics } from "@/lib/providers/types";
import { useLocale, useTranslations } from "next-intl";
import { positionBuckets } from "./domain-overview-metrics";

export function DomainOverviewDistribution({ metrics }: Readonly<{ metrics: DomainRankMetrics }>) {
  const locale = useLocale();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, style: "percent" });
  const buckets = positionBuckets(metrics, t);
  const total = Math.max(0, metrics.count ?? buckets.reduce((sum, item) => sum + item.count, 0));
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <Card className="px-4.5 py-4" size="md">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 inline text-[14.5px] font-semibold">{t("positionDistribution")}</h3>
          <span className="ml-2 font-sans tabular-nums text-[11px] text-fg-muted">
            {t("keywordsByPosition", { count: total })}
          </span>
        </div>
        <span className="text-[12px] text-fg-muted">{t("organicKeywordPositions")}</span>
      </div>
      {buckets.map((bucket) => {
        const share = total > 0 ? (bucket.count / total) * 100 : 0;
        return (
          <div
            className="grid min-h-9 w-full grid-cols-1 items-center gap-1 rounded-control px-1.5 py-1 sm:grid-cols-[74px_minmax(0,1fr)_74px_58px] sm:gap-3"
            key={bucket.value}
          >
            <span className="font-sans tabular-nums text-[12px] text-fg-muted">{bucket.label}</span>
            <span
              aria-hidden
              className="h-2 overflow-hidden rounded-full border border-border bg-bg-sunken"
            >
              <span
                className="block h-full rounded-full bg-accent-solid"
                style={{ width: `${Math.max(2, (bucket.count / max) * 100)}%` }}
              />
            </span>
            <strong className="font-sans tabular-nums text-[12.5px] sm:text-right">
              {number.format(bucket.count)}
            </strong>
            <span className="font-sans tabular-nums text-[11px] text-fg-muted sm:text-right">
              {percent.format(share / 100)}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
