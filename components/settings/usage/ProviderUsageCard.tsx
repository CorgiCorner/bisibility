"use client";

import { SpendBar } from "@/components/cost-estimate/SpendBar";
import { spendTone } from "@/components/cost-estimate/spend-tone";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { ProviderUsageRow } from "@/components/settings/usage/ProviderUsageRow";
import { UsageCard } from "@/components/settings/usage/UsageCard";
import { Button } from "@/components/ui/Button";
import type { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { formatDisplayDate, formatDisplayMonthYear } from "@/lib/dates/format";
import { resolveDateFormat } from "@/lib/dates/resolve";
import type { ProjectProviderSpend } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import type { ProviderUsageData } from "@/lib/settings/options";
import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type ProviderUsageCardProps = {
  canEditBudget: boolean;
  initialBudgetEditOpen?: boolean;
  projectId: string;
  projectRef: string;
  updateProviderAllocation: typeof updateProviderConnectionAllocationAction;
  usage: ProviderUsageData & { providerSpend: ProjectProviderSpend };
};

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span className={metricEyebrowClassName}>{label}</span>
      <p className="m-0 mt-[5px] text-[15px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  );
}

function formatUsdCents(cents: number, locale: string) {
  const dollars = cents / 100;
  const fractionDigits = Math.abs(dollars) < 100 ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(dollars);
}

function formatLocalizedNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function recordedSpend(
  recorded: ProjectProviderSpend["summary"]["recorded"],
  locale: string,
  t: ProviderUsageTranslator,
) {
  return t("recordedSpendValue", {
    amount: formatUsdCents(recorded.cents, locale),
    hasSearches: recorded.units ? "true" : "false",
    searches: t("searches", { count: recorded.units }),
  });
}

type ProviderUsageTranslator = ReturnType<typeof useTranslations<"projectSettingsUsage.provider">>;

function periodLine(
  usage: ProviderUsageCardProps["usage"],
  locale: string,
  t: ProviderUsageTranslator,
) {
  const period = usage.providerSpend.summary.period;
  const start = new Date(period.startsAt);
  const end = new Date(period.endsAt);
  const dateContext = {
    dateFormat: resolveDateFormat(usage.period.dateFormat),
    locale,
    timeZone: "UTC",
  } as const;
  const calendarMonth = start.getUTCDate() === 1 && end.getUTCDate() === 1;
  const range = calendarMonth
    ? formatDisplayMonthYear(start.toISOString().slice(0, 10), dateContext)
    : `${formatDisplayDate(start.toISOString().slice(0, 10), dateContext)} - ${formatDisplayDate(end.toISOString().slice(0, 10), dateContext)}`;
  return t("period", { days: period.daysUntilReset, range });
}

function projectionExplanation(
  usage: ProviderUsageCardProps["usage"],
  locale: string,
  t: ProviderUsageTranslator,
) {
  const projected = usage.providerSpend.summary.projected;
  if (projected.kind === "no_usage") return t("noUsage");
  if (projected.kind === "within_limits") return t("withinLimits");
  const otherBelow = usage.providerSpend.connections
    .filter((item) => item.provider !== projected.provider)
    .every((item) => (item.usedPercent ?? 0) < 40);
  return t("projectionPace", {
    date: formatDisplayDate(new Date(projected.at).toISOString().slice(0, 10), {
      dateFormat: resolveDateFormat(usage.period.dateFormat),
      locale,
      timeZone: "UTC",
    }),
    othersBelow: otherBelow ? "true" : "false",
    provider: projected.provider,
  });
}

function projectionKpi(
  usage: ProviderUsageCardProps["usage"],
  locale: string,
  t: ProviderUsageTranslator,
) {
  const projected = usage.providerSpend.summary.projected;
  if (projected.kind === "no_usage") return t("noUsage");
  if (projected.kind === "within_limits") return t("withinLimits");
  return t("projectionBy", {
    date: formatDisplayDate(new Date(projected.at).toISOString().slice(0, 10), {
      dateFormat: resolveDateFormat(usage.period.dateFormat),
      locale,
      timeZone: "UTC",
    }),
    provider: projected.provider,
  });
}

function attentionCopy(usage: ProviderUsageCardProps["usage"], t: ProviderUsageTranslator) {
  const connections = usage.providerSpend.connections.filter((item) =>
    usage.providerSpend.summary.attention.includes(item.connectionId),
  );
  if (connections.length > 1) return t("attentionMany", { count: connections.length });
  const connection = connections[0];
  if (!connection) return null;
  if (connection.state === "fallback_active") {
    const fallback = usage.providerSpend.connections.find(
      (item) =>
        item.connectionId !== connection.connectionId && item.enabled && item.state !== "capped",
    );
    return t("attentionFallback", {
      fallback: fallback?.provider ?? t("anotherProvider"),
      provider: connection.provider,
    });
  }
  if (connection.state === "top_up_required")
    return t("attentionTopUp", { provider: connection.provider });
  return t("attentionPaused", { provider: connection.provider });
}

export function ProviderUsageCard({
  canEditBudget,
  initialBudgetEditOpen = false,
  projectId,
  projectRef,
  updateProviderAllocation,
  usage,
}: Readonly<ProviderUsageCardProps>) {
  const locale = useLocale();
  const t = useTranslations("projectSettingsUsage.provider");
  const [editOpen, setEditOpen] = useState(initialBudgetEditOpen && canEditBudget);
  const { connections, summary } = usage.providerSpend;
  const banner = summary.attention.length ? attentionCopy(usage, t) : null;
  const summaryTone = spendTone(summary.maxUsedPercent ?? 0, summary.maxUsedPercent != null);
  return (
    <UsageCard
      action={
        canEditBudget ? (
          <Button onClick={() => setEditOpen(true)} size="sm" type="button" variant="secondary">
            {t("editBudget")}
          </Button>
        ) : null
      }
      className="min-h-0"
      description={t("description")}
      id="provider-usage"
      title={t("title")}
    >
      <p className="m-0 text-[12px] text-fg-muted">{periodLine(usage, locale, t)}</p>
      {banner ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-control border border-red/30 bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-3.5 py-3 text-[12.5px] leading-5 text-red-text">
          <WarningCircle aria-hidden className="mt-0.5 shrink-0" size={16} weight="regular" />
          <span>
            <span className="font-semibold">{banner}</span>{" "}
            <Link
              className="font-medium underline hover:no-underline"
              href={appPath(projectRef, "integrations")}
            >
              {t("connectionSettings")}
            </Link>
          </span>
        </div>
      ) : null}
      <section className="mt-4" aria-label={t("budgetUsed")}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={metricEyebrowClassName}>{t("budgetUsed")}</span>
          {summary.tightest ? (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">
              {t("tightest", {
                percent: formatLocalizedNumber(Math.round(summary.tightest.usedPercent), locale),
                provider: summary.tightest.provider,
              })}
            </span>
          ) : (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">
              {t("noBudget")}
            </span>
          )}
        </div>
        {summary.maxUsedPercent == null ? null : (
          <SpendBar
            ariaLabel={t("budgetUsed")}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            percent={summary.maxUsedPercent}
            roundedFill
            tone={summaryTone}
          />
        )}
        <p className="m-0 mt-2 font-sans tabular-nums text-[11px] text-fg-muted">
          {projectionExplanation(usage, locale, t)}
        </p>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Kpi label={t("recordedSpend")} value={recordedSpend(summary.recorded, locale, t)} />
        <Kpi
          label={t("providerRequests")}
          value={formatLocalizedNumber(summary.requestCount, locale)}
        />
        <Kpi label={t("projectedSpend")} value={projectionKpi(usage, locale, t)} />
      </div>
      {connections.length ? (
        <ul className="m-0 mt-4 list-none border-t border-border p-0">
          {connections.map((connection) => (
            <ProviderUsageRow
              connection={connection}
              key={connection.connectionId}
              now={usage.period.now}
            />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-4 border-t border-border pt-4 text-[12px] text-fg-muted">
          {t("usageAfterConnect")}
        </p>
      )}
      {editOpen ? (
        <BudgetEditModal
          connections={connections}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
          projectId={projectId}
          projectRef={projectRef}
          updateProviderAllocation={updateProviderAllocation}
        />
      ) : null}
    </UsageCard>
  );
}
