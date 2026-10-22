"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { IdChip } from "@/components/ui/IdChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { CostSummaryCard } from "@/components/usagekit/cost-summary-card";
import { UsageSummaryCards } from "@/components/usagekit/usage-summary-cards";
import { UsageTable } from "@/components/usagekit/usage-table";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usageFundingDetails, usageFundingSummary } from "./usage-funding-details";

export function UsageSummary({ data }: { data: ProjectUsageViews }) {
  const t = useTranslations("projectSettingsUsage.meter");
  const p = useUsagePresentation();
  const summary = usageFundingSummary(data.summary);
  const summaries = (["byok", "platform"] as const).flatMap((source) => {
    const rows = summary.funding.filter((row) => row.fundingSource === source);
    if (!rows.length) return [];
    const hasMeasurements = rows.some((row) => Object.keys(row.measurements).length > 0);
    const hasWarnings = rows.some((row) => row.unknownOperations !== "0");
    if (!hasMeasurements && !hasWarnings && summary.complete && summary.state === "ok") return [];
    return [{ source, hasMeasurements }];
  });
  const [position, setPosition] = useState({ data, page: 0 });
  const page = position.data === data ? position.page : 0;
  const setPage = (page: number) => setPosition({ data, page });
  const count = 25;
  const detail = {
    ...data.detail,
    rows: data.detail.rows.slice(page * count, (page + 1) * count),
    nextCursor: (page + 1) * count < data.detail.rows.length ? String(page + 1) : null,
  };
  if (data.status === "restricted") return null;
  if (data.status === "unavailable")
    return (
      <section
        id="meter-usage"
        role="status"
        className="rounded-card border border-border bg-bg-elev"
      >
        <EmptyState
          compact
          title={p.summary.title}
          description={t("unavailable")}
          icon={<Info aria-hidden size={22} weight="regular" />}
        />
      </section>
    );
  return (
    <section id="meter-usage" className="min-w-0 space-y-4">
      {summaries.map(({ source, hasMeasurements }) => (
        <UsageSummaryCards
          hideMeasured
          key={source}
          view={summary}
          variant={hasMeasurements ? "card" : "plain"}
          fundingSource={source}
          labels={{ ...p.summary, title: p.cost[source] }}
          measurementLabels={p.measurement}
          formatFigure={p.figure}
          formatUnit={p.unit}
        />
      ))}
      {!data.summary.funding.length && (
        <UsageSummaryCards
          hideMeasured
          view={data.summary}
          labels={p.summary}
          measurementLabels={p.measurement}
          formatFigure={p.figure}
          formatUnit={p.unit}
        />
      )}

      {data.summary.funding.some((row) => row.fundingSource === "byok") && (
        <CostSummaryCard
          hideMeasured
          view={data.summary}
          labels={p.cost}
          measurementLabels={p.measurement}
          fundingSource="byok"
          showCostOwner={false}
          showFunding={false}
          formatFigure={p.figure}
          formatUnit={p.unit}
        />
      )}
      <Disclosure
        title={t("detailsTitle")}
        headingLevel="h3"
        summaryClassName="px-4 py-4 sm:px-4 [&>h3]:text-sm [&>h3]:leading-snug"
        contentClassName="space-y-3 px-4 pb-4 text-xs sm:px-4"
      >
        <div className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
          <p>{t("period", { from: p.date(data.from), to: p.date(data.to) })}</p>
          <Tooltip
            placement="top"
            semantics="description"
            content={
              <div className="space-y-2">
                <p>{t("walletAuthority")}</p>
                {data.summary.asOf && <p>{t("asOf", { date: p.date(data.summary.asOf) })}</p>}
              </div>
            }
          >
            <IconButton
              aria-label={t("detailsTitle")}
              size="small"
              type="button"
              className="size-6 min-h-6 cursor-help p-0 text-fg-muted"
            >
              <Info aria-hidden size={12} weight="regular" />
            </IconButton>
          </Tooltip>
        </div>
        {data.unresolved > 0 && (
          <p>
            {t("unresolved", { count: data.unresolved })}{" "}
            {data.oldestUnresolvedAt && t("oldest", { date: p.date(data.oldestUnresolvedAt) })}
          </p>
        )}
        {data.truncated && <p role="status">{t("truncated")}</p>}
        {usageFundingDetails(detail).map(({ fundingSource, view }) => (
          <div key={fundingSource} className="space-y-2">
            <h4 className="text-xs font-medium">{p.cost[fundingSource]}</h4>
            <UsageTable
              hideMeasured
              view={view}
              labels={{ ...p.table, title: p.cost[fundingSource] }}
              dimensionLabels={p.dimensions}
              formatDimension={(key, value) =>
                key === "connection" && /^conn_[a-zA-Z0-9]+$/.test(value) ? (
                  <IdChip size="xs" truncate="middle" value={value} />
                ) : (
                  p.dimension(key, value)
                )
              }
              formatFigure={p.figure}
              formatUnit={p.unit}
            />
          </div>
        ))}
        {!detail.rows.length && (
          <UsageTable
            hideMeasured
            view={detail}
            labels={p.table}
            formatFigure={p.figure}
            formatUnit={p.unit}
          />
        )}
        {(page > 0 || detail.nextCursor) && (
          <div className="flex justify-end gap-2">
            {page > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPage(0)}>
                {p.table.first}
              </Button>
            )}
            {detail.nextCursor && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(Number(detail.nextCursor))}
              >
                {p.table.next}
              </Button>
            )}
          </div>
        )}
      </Disclosure>
    </section>
  );
}
