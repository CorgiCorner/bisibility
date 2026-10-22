"use client";

import { ActionPaymentPrice } from "@/components/action-payment/ActionPaymentPrice";
import { useTranslations } from "next-intl";

export function DomainOverviewRefreshPrice({
  action,
  input,
}: Readonly<{
  action: (input: unknown) => Promise<unknown>;
  input: Record<string, unknown> | null;
}>) {
  const t = useTranslations("projectDomainOverview.workspace.ui");
  return <ActionPaymentPrice action={action} cachedLabel={t("freeCached")} input={input} />;
}
