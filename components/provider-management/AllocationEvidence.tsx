"use client";

import { createUsageNumberFormat } from "@/components/metering/usage-number-format";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { ProviderBalanceEvidence } from "@/components/provider-management/ProviderBalanceEvidence";
import { ProviderWalletEvidence } from "@/components/provider-management/ProviderWalletEvidence";
import { Tooltip } from "@/components/ui/Tooltip";
import type { AllocationNativeObservation } from "@/components/usagekit/provider-allocation-editor";
import type { UsageConnection } from "@/lib/metering/user-views";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useFormatter, useLocale, useTranslations } from "next-intl";

export function AllocationEvidence({
  rows,
  connections,
  asOf,
}: {
  rows: readonly ProviderAllocationRow[] | null;
  connections: readonly UsageConnection[];
  asOf: string | null;
}) {
  const t = useTranslations("projectIntegrations.providerManagement");
  const format = useFormatter();
  if (!rows) return null;
  const observed = asOf !== null && Number.isFinite(Date.parse(asOf));
  return (
    <div className="space-y-3">
      {observed && (
        <p className="text-xs text-fg-muted">
          {t("observed")}:{" "}
          <time dateTime={asOf}>
            {format.dateTime(new Date(asOf), { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </p>
      )}
      {observed && (
        <ProviderWalletEvidence
          row={rows.find(
            (row) =>
              connections.some((connection) => connection.connectionId === row.connectionId) &&
              row.fundingSource === "platform" &&
              row.surface === "app" &&
              row.unit === "customer_cents" &&
              row.available !== undefined &&
              row.available !== "unavailable" &&
              row.available.certainty === "measured" &&
              row.available.unit === row.unit,
          )}
        />
      )}
      {connections.map((connection) => (
        <div key={connection.connectionId} className="space-y-3">
          <ProviderBalanceEvidence connectionId={connection.connectionId} />
        </div>
      ))}
    </div>
  );
}

export function NativeAllocationObservation({
  observation,
  providerName,
}: {
  observation: AllocationNativeObservation | null;
  providerName: string;
}) {
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const meter = useTranslations("projectSettingsUsage.meter");
  const p = useUsagePresentation();
  const numbers = createUsageNumberFormat(useLocale(), {
    ...p.options,
    moneyDisplay: "currency",
    moneyFractionDigits: 2,
  });
  const format = useFormatter();
  const value = observation?.value;
  const known = value && value !== "unavailable" && value.certainty !== "unknown";
  const amount = known ? numbers.budgetFigure(value) : null;
  const unit =
    !known || value.unit === "USD"
      ? ""
      : value.unit === "searches"
        ? t("searchesAdornment")
        : value.unit === "units"
          ? p.unit(value.unit)
          : value.unit;
  const certainty = known
    ? value.certainty === "measured"
      ? null
      : meter("certaintyValue.estimated")
    : meter("unknown");
  const observedAt = observation?.observedAt;
  const observed = observedAt && Number.isFinite(Date.parse(observedAt));
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted"
      data-native-balance
    >
      <span>
        {t("providerAccount", {
          provider:
            ({ serpapi: "SerpApi", dataforseo: "DataForSEO" } as Record<string, string>)[
              providerName
            ] ?? providerName,
        })}
        :{" "}
        <span
          className="whitespace-nowrap font-medium text-fg tabular-nums"
          aria-label={!known ? meter("unknown") : undefined}
        >
          {amount ? [amount, unit].filter(Boolean).join(" ") : "—"}
        </span>
      </span>
      <span aria-hidden>·</span>
      <Tooltip
        content={
          <div className="max-w-64 space-y-1">
            <p>{t("nativeBalanceHelp")}</p>
            {observed && (
              <time dateTime={observedAt}>
                {format.dateTime(new Date(observedAt), { dateStyle: "medium", timeStyle: "short" })}
              </time>
            )}
          </div>
        }
        semantics="description"
      >
        <button type="button" className="cursor-help border-b border-dotted border-border">
          {certainty ?? (!observed ? t("nativeBalance") : null)}
          {observed && (
            <>
              {certainty && " · "}
              {t("balanceAsOf")}{" "}
              <time dateTime={observedAt}>
                {format.dateTime(new Date(observedAt), { timeStyle: "short" })}
              </time>
            </>
          )}
        </button>
      </Tooltip>
    </div>
  );
}
