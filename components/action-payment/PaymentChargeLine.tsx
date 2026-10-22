"use client";

import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { useLocale, useTranslations } from "next-intl";
import type { PresentedPaymentAmount } from "./use-payment-amount-formatter";

export function PaymentChargeLine({
  payment,
  original = false,
  presented,
}: {
  payment?: ActionPaymentReceipt;
  original?: boolean;
  presented?: PresentedPaymentAmount;
}) {
  const locale = useLocale();
  const t = useTranslations("shared.actionPayment");
  const amount =
    presented ?? (payment ? { text: formatPaymentAmount(payment.charge, locale) } : null);
  return (
    <span className="inline-flex flex-wrap gap-x-1.5 text-[12px] tabular-nums text-fg-muted">
      {payment && amount ? (
        <>
          {original ? <span>{t("originalCharge")}</span> : null}
          <span>
            {payment.option.fundingSource === "byok"
              ? t("byokRoute", { provider: payment.option.providerLabel })
              : `${t("platform")} · ${payment.option.providerLabel}`}
          </span>
          <span title={presented?.title}>{amount.text}</span>
          {payment.state === "pending" || payment.state === "unknown" ? (
            <span>{t(payment.state)}</span>
          ) : null}
        </>
      ) : (
        t("unavailable")
      )}
    </span>
  );
}
