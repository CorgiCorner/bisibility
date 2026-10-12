"use client";

import { MeasurementCard } from "@/components/usagekit/measurement-card";
import { dollarsFromNativeCents } from "@/lib/provider-ui/form-schema";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useTranslations } from "next-intl";

/** Wallet figures stay separate from provider-account evidence and the chosen monthly cap. */
export function ProviderWalletEvidence({ row }: { row: ProviderAllocationRow | undefined }) {
  const t = useTranslations("projectIntegrations.providerManagement");
  const meter = useTranslations("projectSettingsUsage.meter");
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
  const dollars = dollarsFromNativeCents(available.text);
  if (dollars === null) return null;
  return (
    <MeasurementCard
      title={t("availableBalance")}
      description={t("creditWallet")}
      value={{ text: dollars, unit: "USD", certainty: "measured" }}
      labels={{
        measured: meter("certaintyValue.measured"),
        estimated: meter("certaintyValue.estimated"),
        unknown: meter("unknown"),
        unavailable: meter("unknown"),
      }}
    />
  );
}
