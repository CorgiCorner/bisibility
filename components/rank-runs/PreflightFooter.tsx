"use client";
import { quoteAddCreditsHref } from "@/components/action-payment/PaymentQuoteSummary";
import { Button } from "@/components/ui/Button";
import type { ActionPaymentQuote } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { useLocale, useTranslations } from "next-intl";

export function PreflightFooter({
  decision,
  disabled,
  expired,
  formId,
  label,
  onClose,
  onRefresh,
  payment,
  submitting,
}: {
  decision: string;
  disabled: boolean;
  expired: boolean;
  formId: string;
  label: string;
  onClose: () => void;
  onRefresh: () => void;
  payment?: ActionPaymentQuote;
  submitting: boolean;
}) {
  const t = useTranslations("shared.rankPreflight");
  const paymentT = useTranslations("shared.actionPayment");
  const locale = useLocale();
  const addCredits = !expired ? quoteAddCreditsHref(payment) : undefined;
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
      <p className="m-0 min-w-0 text-[11.5px] tabular-nums text-fg-muted">{decision}</p>
      <div className="flex items-center gap-2">
        <Button disabled={submitting} onClick={onClose} type="button" variant="secondary">
          {t("cancel")}
        </Button>
        {expired ? (
          <Button disabled={submitting} onClick={onRefresh}>
            {paymentT("refreshPrice")}
          </Button>
        ) : addCredits ? (
          <Button href={addCredits}>{paymentT("addCredits")}</Button>
        ) : (
          <Button
            disabled={disabled}
            form={formId}
            loading={submitting}
            loadingLabel={t("starting")}
            type="submit"
          >
            {label}
            {payment ? ` · ${formatPaymentAmount(payment.charge, locale)}` : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
