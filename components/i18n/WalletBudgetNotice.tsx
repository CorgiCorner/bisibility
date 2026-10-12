"use client";

import { useTranslations } from "next-intl";

export function WalletBudgetNotice() {
  const t = useTranslations("shared.errors");
  return (
    <p
      className="rounded-control border border-border bg-bg-sunken p-4 text-sm text-fg"
      role="alert"
    >
      {t("walletBudgetExhausted")}
    </p>
  );
}
