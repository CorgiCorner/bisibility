"use client";

import { SpendBar } from "@/components/cost-estimate/SpendBar";
import { spendTone, spendToneTextClass } from "@/components/cost-estimate/spend-tone";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDisplayDateRange } from "@/lib/dates/format";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { SurfaceSpend } from "@/lib/queries/provider-spend-surfaces";
import type { ProviderSpendSourceBlock } from "@/lib/queries/provider-spend-types";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { useTranslations } from "next-intl";
import { ProviderUsageFeatureList } from "./ProviderUsageFeatureList";
import { ProviderUsageFreshnessNote } from "./ProviderUsageFreshnessNote";
import {
  formatCount as formatNumber,
  formatUsdCents,
  meterUnconfirmed,
} from "./provider-usage-view";

type SurfaceSpendBarProps = Readonly<{
  allocationText: string;
  ariaLabel: string;
  label: string;
  surface: SurfaceSpend;
}>;

function SurfaceSpendBar({ allocationText, ariaLabel, label, surface }: SurfaceSpendBarProps) {
  const percent = surface.usedPercent ?? 0;
  const tone = spendTone(percent, surface.allocation != null);
  const toneClass = tone === "normal" ? "text-fg-muted" : spendToneTextClass[tone];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-sans text-[9px] font-semibold uppercase text-fg-muted">
        {label}
      </span>
      <SpendBar
        ariaLabel={ariaLabel}
        className="h-1 min-w-[54px] flex-1 overflow-hidden rounded-full"
        percent={percent}
        tone={tone}
      />
      <span className={cn("shrink-0 font-sans tabular-nums text-[11px]", toneClass)}>
        {allocationText}
      </span>
    </span>
  );
}

type SpendSource = "own" | "credits";

function activeSource(connection: ProviderSpendConnection): SpendSource {
  return connection.credentialSource === "hosted" ? "credits" : "own";
}

function sourceIsEmpty(block: ProviderSpendSourceBlock) {
  return (
    block.surfaces.app.allocation === null &&
    block.surfaces.programmatic.allocation === null &&
    block.used === 0 &&
    block.requestCount === 0
  );
}

/**
 * `creditsAvailable` is false in deployments without credits: the row then shows
 * one set of meters for the project's own keys, exactly as before.
 */
export function ProviderUsageRow({
  connection,
  creditsAvailable = false,
  now,
}: Readonly<{ connection: ProviderSpendConnection; creditsAvailable?: boolean; now: string }>) {
  const dateContext = useDateDisplay();
  const t = useTranslations("projectSettingsUsage.provider");

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
    // Connections on credits have no stored keys and no provider-side balance.
    if (!value || connection.credentialSource === "hosted") return null;
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

  function meterAllocationText(
    allocation: { amountPerMonth: number } | null,
    used: number,
    unconfirmedCount: number | undefined,
    unit: ProviderSpendConnection["unit"],
  ) {
    if (!allocation) return t("allocationNone");
    const { hasUnconfirmed, unconfirmedCount: unconfirmed } = meterUnconfirmed(unconfirmedCount);
    const usedLabel =
      unit === "cents"
        ? formatUsdCents(used, dateContext.locale)
        : formatNumber(used, dateContext.locale);
    const allocationLabel =
      unit === "cents"
        ? formatUsdCents(allocation.amountPerMonth, dateContext.locale)
        : t("searches", { count: allocation.amountPerMonth });
    const base = hasUnconfirmed
      ? t("atLeastAllocation", { allocation: allocationLabel, used: usedLabel })
      : t("allocation", { allocation: allocationLabel, used: usedLabel });
    return hasUnconfirmed ? `${base} · ${t("unconfirmedChip", { count: unconfirmed })}` : base;
  }

  function surfaceAllocationText(surface: SurfaceSpend, unit: ProviderSpendConnection["unit"]) {
    return meterAllocationText(surface.allocation, surface.used, surface.unconfirmedCount, unit);
  }

  function sourceLabel(source: SpendSource) {
    return source === "own" ? t("sourceLabel.own") : t("sourceLabel.credits");
  }

  function surfaceMeters(
    surfaces: ProviderSpendConnection["surfaces"],
    unit: ProviderSpendConnection["unit"],
    source: SpendSource | null,
  ) {
    return (
      <span className="grid min-w-0 gap-1.5">
        <SurfaceSpendBar
          allocationText={surfaceAllocationText(surfaces.app, unit)}
          ariaLabel={
            source
              ? t("sourceAppMeterLabel", { provider: connection.provider, source })
              : t("appMeterLabel", { provider: connection.provider })
          }
          label={t("surface.app")}
          surface={surfaces.app}
        />
        <SurfaceSpendBar
          allocationText={surfaceAllocationText(surfaces.programmatic, unit)}
          ariaLabel={
            source
              ? t("sourceProgrammaticMeterLabel", { provider: connection.provider, source })
              : t("programmaticMeterLabel", { provider: connection.provider })
          }
          label={t("surface.programmatic")}
          surface={surfaces.programmatic}
        />
      </span>
    );
  }

  function sourceSection(source: SpendSource) {
    const block = source === "own" ? connection.own : connection.credits;
    const active = activeSource(connection) === source;
    const label = sourceLabel(source);
    // The provider balance belongs to the project's own keys only.
    const balance = source === "own" ? availabilityLabel : null;
    if (sourceIsEmpty(block) && !balance) {
      return (
        <span
          className={cn(
            "flex items-center gap-2 font-sans text-[11px] text-fg-muted",
            !active && "opacity-70",
          )}
          data-source={source}
        >
          <span className="font-semibold text-fg-muted">{label}</span>
          <span>{t("sourceEmpty")}</span>
        </span>
      );
    }
    return (
      <span
        className={cn("grid min-w-0 gap-1.5", !active && "opacity-70")}
        data-active={active ? "true" : "false"}
        data-source={source}
      >
        <span className="font-sans text-[11px] font-semibold text-fg-muted">{label}</span>
        {surfaceMeters(block.surfaces, block.unit, source)}
        {balance ? (
          <span className="block font-sans tabular-nums text-[10px] text-fg-muted">{balance}</span>
        ) : null}
      </span>
    );
  }

  function statusLabel() {
    if (connection.state === "ok") return t("status.ok");
    if (connection.state === "capped") return t("status.capped");
    if (connection.state === "fallback_active") return t("status.fallback_active");
    if (connection.state === "top_up_required") return t("status.top_up_required");
    if (connection.state === "no_allocation") return t("status.no_allocation");
    return t("status.default", { state: connection.state });
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
            {creditsAvailable ? (
              <StatusPill
                label={t("activeSource", { source: activeSource(connection) })}
                showDot={false}
                size="sm"
                status="optional"
              />
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
            {creditsAvailable ? (
              <span className="grid min-w-0 gap-2.5">
                {sourceSection("own")}
                {sourceSection("credits")}
              </span>
            ) : (
              <>
                {surfaceMeters(connection.surfaces, connection.unit, null)}
                {availabilityLabel ? (
                  <span className="mt-1 block font-sans tabular-nums text-[10px] text-fg-muted">
                    {availabilityLabel}
                  </span>
                ) : null}
              </>
            )}
            <ProviderUsageFreshnessNote freshness={connection.reconciliation} />
          </span>
        </summary>
        <ProviderUsageFeatureList connection={connection} />
      </details>
    </li>
  );
}
