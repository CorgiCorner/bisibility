"use client";

import type { ActionPaymentOption, ActionPaymentQuote } from "@/lib/action-payment/contract";
import { formatPaymentAmount, formatPaymentMaximum } from "@/lib/action-payment/format";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ActionPaymentOptionPicker } from "./ActionPaymentOptionPicker";

/** Amount, payer and wallet are all supplied by this exact server quote. */
export function PaymentQuoteSummary({
  quote,
  options = [],
  disabled,
  onOptionChange,
  label,
}: {
  quote?: ActionPaymentQuote;
  options?: ActionPaymentOption[];
  disabled?: boolean;
  onOptionChange?: (option: ActionPaymentOption) => void;
  label?: string;
}) {
  const t = useTranslations("shared.actionPayment");
  const locale = useLocale();
  const format = useFormatter();
  if (!quote) return <p className="m-0 text-xs text-fg-muted">{t("unavailable")}</p>;
  return (
    <div className="grid gap-2 text-xs">
      {options.length > 1 && onOptionChange ? (
        <ActionPaymentOptionPicker
          options={options}
          value={quote.option.id}
          disabled={disabled}
          onChange={(id) => {
            const option = options.find((item) => item.id === id);
            if (option) onOptionChange(option);
          }}
        />
      ) : (
        <span className="text-fg-muted">
          {quote.option.fundingSource === "byok"
            ? t("byokRoute", { provider: quote.option.providerLabel })
            : `${t("platform")} · ${quote.option.providerLabel}`}
        </span>
      )}
      <span className="font-semibold tabular-nums">
        {label ? `${label}: ` : ""}
        {formatPaymentAmount(quote.charge, locale)}
      </span>
      {quote.maximumCharge ? (
        <span className="tabular-nums">
          {t("maximum", { amount: formatPaymentMaximum(quote.maximumCharge, locale) })}
        </span>
      ) : null}
      {quote.option.fundingSource === "platform" && quote.wallet ? (
        <span className="tabular-nums">
          {t("wallet", { amount: formatPaymentAmount(quote.wallet.available, locale) })}
        </span>
      ) : null}
      {quote.cache.freeUntil ? (
        <span className="text-fg-muted">
          {t("freeUntil", {
            date: format.dateTime(new Date(quote.cache.freeUntil), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </span>
      ) : null}
      {!quote.availability.allowed ? (
        <p role="alert" className="m-0 text-warning">
          {t(
            quote.availability.reason === "insufficient_credits"
              ? "insufficientCredits"
              : "blocked",
          )}
        </p>
      ) : null}
    </div>
  );
}

export function quoteAddCreditsHref(quote: ActionPaymentQuote | undefined) {
  return quote?.option.fundingSource === "platform" &&
    quote.availability.reason === "insufficient_credits" &&
    quote.wallet?.canAddCredits
    ? quote.availability.remedyHref
    : undefined;
}
