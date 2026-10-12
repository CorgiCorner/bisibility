"use client";

import { ProviderBalanceEvidence } from "@/components/provider-management/ProviderBalanceEvidence";
import { ProviderWalletEvidence } from "@/components/provider-management/ProviderWalletEvidence";
import { MeasurementCard } from "@/components/usagekit/measurement-card";
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
      {connections.map((connection) => (
        <div key={connection.connectionId} className="space-y-3">
          {observed && (
            <ProviderWalletEvidence
              row={rows.find(
                (row) =>
                  row.connectionId === connection.connectionId &&
                  row.fundingSource === "platform" &&
                  row.surface === "app",
              )}
            />
          )}
          <ProviderBalanceEvidence connectionId={connection.connectionId} />
        </div>
      ))}
    </div>
  );
}

export function NativeAllocationObservation({
  observation,
}: {
  observation: AllocationNativeObservation | null;
}) {
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const meter = useTranslations("projectSettingsUsage.meter");
  const locale = useLocale();
  const format = useFormatter();
  const common = useTranslations("projectIntegrations.providerManagement");
  if (!observation) return null;
  return (
    <div className="space-y-2">
      <MeasurementCard
        title={t("nativeBalance")}
        description={t("nativeBalanceHelp")}
        value={observation.value}
        variant="plain"
        labels={{
          measured: meter("certaintyValue.measured"),
          estimated: meter("certaintyValue.estimated"),
          unknown: meter("unknown"),
          unavailable: meter("unknown"),
        }}
        formatFigure={(figure) =>
          figure.unit === "USD"
            ? new Intl.NumberFormat(locale, {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              }).format(Number(figure.text))
            : figure.text
        }
        formatUnit={(unit) => (unit === "USD" ? "" : t("searchesAdornment"))}
      />
      {observation.observedAt && Number.isFinite(Date.parse(observation.observedAt)) && (
        <p className="text-xs text-fg-muted">
          {common("observed")}:{" "}
          <time dateTime={observation.observedAt}>
            {format.dateTime(new Date(observation.observedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </p>
      )}
    </div>
  );
}
