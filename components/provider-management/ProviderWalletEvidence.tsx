"use client";

import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { MeasurementCard } from "@/components/usagekit/measurement-card";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useTranslations } from "next-intl";

/** Wallet figures stay separate from provider-account evidence and the chosen monthly cap. */
export function ProviderWalletEvidence({ row }: { row: ProviderAllocationRow | undefined }) {
  const t = useTranslations("projectIntegrations.providerManagement");
  const meter = useTranslations("projectSettingsUsage.meter");
  const presentation = useUsagePresentation();
  const available = row?.available;
  if (
    row?.fundingSource !== "platform" ||
    row.unit !== "customer_cents" ||
    !available ||
    available === "unavailable" ||
    available.certainty !== "measured" ||
    available.unit !== row.unit
  )
    return null;

  return (
    <MeasurementCard
      hideMeasured
      title={t("availableBalance")}
      description={t("creditWallet")}
      value={available}
      formatFigure={presentation.figure}
      formatUnit={presentation.unit}
      labels={{
        measured: meter("certaintyValue.measured"),
        estimated: meter("certaintyValue.estimated"),
        unknown: meter("unknown"),
        unavailable: meter("unknown"),
      }}
    />
  );
}
