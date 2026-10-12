"use client";

import { ProviderBalanceCard } from "@/components/usagekit/provider-balance-card";
import { useProviderBalance } from "@usagekit/react";
import { useTranslations } from "next-intl";

/** Reads cached host evidence only; the separate native refresh button owns provider I/O. */
export function ProviderBalanceEvidence({ connectionId }: Readonly<{ connectionId: string }>) {
  const evidence = useProviderBalance({ connectionId });
  const t = useTranslations("projectIntegrations.providerManagement");
  if (evidence.state !== "ok" || !evidence.data?.balance) return null;
  return (
    <ProviderBalanceCard
      balance={evidence.data.balance}
      labels={{
        title: t("balance"),
        balance: t("availableBalance"),
        reserved: t("reserved"),
        provider: t("providerAccount"),
        host_wallet: t("creditWallet"),
        unknown: t("unknownAuthority"),
        stale: t("staleEvidence"),
        observed: t("observed"),
        unavailable: t("unavailable"),
      }}
    />
  );
}
