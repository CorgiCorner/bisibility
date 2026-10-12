"use client";
import { UsageDisplayControls } from "@/components/metering/UsageDisplayControls";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { BudgetCard } from "@/components/usagekit/budget-card";
import { CostSummaryCard } from "@/components/usagekit/cost-summary-card";
import { UsageSummaryCards } from "@/components/usagekit/usage-summary-cards";
import { UsageTable } from "@/components/usagekit/usage-table";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function UsageSummary({ data }: { data: ProjectUsageViews }) {
  const t = useTranslations("projectSettingsUsage.meter");
  const p = useUsagePresentation();
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
      {(["byok", "platform"] as const)
        .filter((source) => data.summary.funding.some((row) => row.fundingSource === source))
        .map((source) => (
          <UsageSummaryCards
            key={source}
            view={data.summary}
            fundingSource={source}
            labels={{ ...p.summary, title: p.cost[source] }}
            measurementLabels={p.measurement}
            formatFigure={p.figure}
            formatUnit={p.unit}
          />
        ))}
      {!data.summary.funding.length && (
        <UsageSummaryCards
          view={data.summary}
          labels={p.summary}
          measurementLabels={p.measurement}
          formatFigure={p.figure}
          formatUnit={p.unit}
        />
      )}

      {data.summary.funding.some((row) => row.fundingSource === "byok") && (
        <CostSummaryCard
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
      {data.budgets.map((row) => (
        <BudgetCard
          key={row.id}
          row={row}
          title={p.bound(row)}
          labels={p.budget}
          formatTime={p.date}
          formatFigure={p.figure}
          formatUnit={p.unit}
        />
      ))}
      <Disclosure title={t("detailsTitle")} headingLevel="h3">
        <p>{t("walletAuthority")}</p>
        <p>{t("period", { from: p.date(data.from), to: p.date(data.to) })}</p>
        {data.summary.asOf && <p>{t("asOf", { date: p.date(data.summary.asOf) })}</p>}
        {data.unresolved > 0 && (
          <p>
            {t("unresolved", { count: data.unresolved })}{" "}
            {data.oldestUnresolvedAt && t("oldest", { date: p.date(data.oldestUnresolvedAt) })}
          </p>
        )}
        {data.truncated && <p role="status">{t("truncated")}</p>}
        <UsageTable
          view={detail}
          labels={p.table}
          dimensionLabels={p.dimensions}
          formatDimension={p.dimension}
          formatFigure={p.figure}
          formatUnit={p.unit}
          showFunding
          onNextPage={(cursor) => setPage(Number(cursor))}
          onFirstPage={page ? () => setPage(0) : undefined}
        />
      </Disclosure>
      <UsageDisplayControls />
    </section>
  );
}
