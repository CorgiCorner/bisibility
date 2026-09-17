"use client";

import { SpendBar } from "@/components/cost-estimate/SpendBar";
import { spendTone, spendToneTextClass } from "@/components/cost-estimate/spend-tone";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDisplayDateRange } from "@/lib/dates/format";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { ProviderUsageFeature } from "@/lib/settings/provider-usage-types";
import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { useTranslations } from "next-intl";

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

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function ProviderUsageRow({
  connection,
  now,
}: Readonly<{ connection: ProviderSpendConnection; now: string }>) {
  const dateContext = useDateDisplay();
  const t = useTranslations("projectSettingsUsage.provider");
  const percent = connection.usedPercent ?? 0;
  const tone = spendTone(percent, connection.allocation != null);
  const allocationToneClass = tone === "normal" ? "text-fg-muted" : spendToneTextClass[tone];

  function relativePastLabel(value: Date) {
    const minutes = Math.max(0, Math.floor((new Date(now).getTime() - value.getTime()) / 60_000));
    if (minutes < 1) return t("relative.justNow");
    if (minutes < 60) return t("relative.minutesAgo", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("relative.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    return days === 1 ? t("relative.yesterday") : t("relative.daysAgo", { count: days });
  }

  function resetCopy() {
    if (connection.quotaReset === "none") return t("doesNotExpire");
    if (connection.quotaReset === "billing_cycle") return t("resetsBillingCycle");
    const next = new Date(
      Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1),
    );
    const key = next.toISOString().slice(0, 10);
    return t("resetsDate", { date: formatDisplayDateRange(key, key, dateContext) });
  }

  function availability() {
    const value = connection.availableAtProvider;
    if (!value) return null;
    if (value.status === "reconnect_required") return t("reconnectRequired");
    if (value.status === "unreachable") return t("unreachable");
    const amount =
      value.unit === "usd"
        ? t("balance", { amount: formatUsdCents(value.amount * 100, dateContext.locale) })
        : t("providerLeft", { count: value.amount });
    return t("availability", {
      amount,
      relative: relativePastLabel(new Date(value.checkedAt)),
      reset: resetCopy(),
    });
  }

  function allocationText() {
    if (!connection.allocation) return t("allocationNone");
    const used =
      connection.unit === "cents"
        ? formatUsdCents(connection.used, dateContext.locale)
        : formatNumber(connection.used, dateContext.locale);
    const allocation =
      connection.unit === "cents"
        ? formatUsdCents(connection.allocation.amountPerMonth, dateContext.locale)
        : t("searches", { count: connection.allocation.amountPerMonth });
    return t("allocation", { allocation, used });
  }

  function statusLabel() {
    if (connection.state === "ok") return t("status.ok");
    if (connection.state === "capped") return t("status.capped");
    if (connection.state === "fallback_active") return t("status.fallback_active");
    if (connection.state === "top_up_required") return t("status.top_up_required");
    if (connection.state === "no_allocation") return t("status.no_allocation");
    return t("status.default", { state: connection.state });
  }

  function featureLabel(feature: ProviderUsageFeature) {
    switch (feature) {
      case "backlinks":
        return t("featureLabel.backlinks");
      case "domain_overview":
        return t("featureLabel.domainOverview");
      case "keyword_metrics":
        return t("featureLabel.keywordMetrics");
      case "keyword_research":
        return t("featureLabel.keywordResearch");
      case "rank_check":
        return t("featureLabel.rankCheck");
      case "ranked_keywords":
        return t("featureLabel.rankedKeywords");
    }
  }

  const availabilityLabel = availability();
  return (
    <li className="border-t border-border first:border-t-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-start gap-x-3 gap-y-2 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid [&::-webkit-details-marker]:hidden">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="max-w-[180px] truncate text-[13.5px] font-semibold text-fg">
              {connection.provider}
            </span>
            {connection.primary ? (
              <StatusPill label={t("primary")} showDot={false} size="sm" status="optional" />
            ) : null}
          </span>
          <span className="ml-auto flex min-w-[9rem] flex-1 flex-wrap items-center justify-end gap-2 text-right">
            <span className="rounded-full border border-border bg-bg-sunken px-2 py-1 font-sans tabular-nums text-[9px] font-semibold uppercase text-fg-muted">
              {statusLabel()}
            </span>
            <CaretDown
              aria-hidden
              className="shrink-0 text-fg-muted transition-transform group-open:rotate-180"
              size={14}
              weight="regular"
            />
          </span>
          <span className="basis-full">
            <span className="flex min-w-0 items-center gap-2">
              <SpendBar
                ariaLabel={t("meterLabel", { provider: connection.provider })}
                className="h-1 min-w-[72px] flex-1 overflow-hidden rounded-full"
                percent={percent}
                tone={tone}
              />
              <span
                className={`shrink-0 font-sans tabular-nums text-[11px] ${allocationToneClass}`}
              >
                {allocationText()}
              </span>
            </span>
            {availabilityLabel ? (
              <span className="mt-1 block font-sans tabular-nums text-[10px] text-fg-muted">
                {availabilityLabel}
              </span>
            ) : null}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-border bg-bg-sunken/40 px-3 py-3 sm:grid-cols-2">
          {connection.features.map((feature) => (
            <div key={feature.feature}>
              <span className={metricEyebrowClassName}>{featureLabel(feature.feature)}</span>
              <p className="m-0 mt-1 text-[13px] font-semibold text-fg tabular-nums">
                {t("feature", {
                  amount: formatUsdCents(feature.costCents, dateContext.locale),
                  count: feature.count,
                })}
              </p>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}
