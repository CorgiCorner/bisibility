"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type {
  ActionPaymentBatchAssessment,
  ActionPaymentOption,
  ActionPaymentQuote,
} from "@/lib/action-payment/contract";
import { formatPaymentAmount, formatPaymentMaximum } from "@/lib/action-payment/format";
import { appPath } from "@/lib/routing/app-path";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ActionPaymentOptionPicker } from "./ActionPaymentOptionPicker";
import { usePaymentQuoteExpiry } from "./usePaymentQuoteExpiry";

export type PaymentReviewItem = {
  key: string;
  label: string;
  quote: ActionPaymentQuote;
  options: ActionPaymentOption[];
};

export function ActionPaymentReview({
  items,
  loading,
  failed,
  assessment,
  onClose,
  onConfirm,
  onOptionChange,
  onRefresh,
  children,
}: {
  children?: ReactNode;
  items: PaymentReviewItem[];
  loading: boolean;
  failed: boolean;
  assessment?: ActionPaymentBatchAssessment;
  onRefresh?: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onOptionChange: (key: string, optionId: string) => void;
}) {
  const t = useTranslations("shared.actionPayment");
  const locale = useLocale();
  const format = useFormatter();
  const expired = usePaymentQuoteExpiry(
    Math.min(...items.map(({ quote }) => Date.parse(quote.expiresAt))),
  );
  const blocked =
    loading ||
    failed ||
    !items.length ||
    expired ||
    (!assessment && items.length > 1) ||
    assessment?.allowed === false ||
    items.some(({ quote }) => !quote.availability.allowed);
  const usesCredits = items.some(({ quote }) => quote.option.fundingSource === "platform");
  const availability =
    assessment ??
    (items.length === 1 && items[0].quote.option.fundingSource === "platform"
      ? { ...items[0].quote.availability, wallet: items[0].quote.wallet }
      : undefined);
  const addCreditsHref =
    usesCredits &&
    !loading &&
    !failed &&
    !expired &&
    availability?.reason === "insufficient_credits" &&
    availability.wallet?.canAddCredits
      ? availability.remedyHref
      : undefined;
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          {expired && onRefresh ? (
            <Button disabled={loading} onClick={onRefresh}>
              {t("refreshPrice")}
            </Button>
          ) : addCreditsHref ? (
            <Button href={addCreditsHref}>{t("addCredits")}</Button>
          ) : (
            <Button disabled={blocked} onClick={onConfirm}>
              {t("confirm")}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4" aria-busy={loading}>
        {children}
        {loading ? (
          <p className="m-0 text-[12px] text-fg-muted" role="status">
            {t("loading")}
          </p>
        ) : null}
        {failed || expired ? <p role="alert">{t(expired ? "expired" : "unavailable")}</p> : null}
        {!loading &&
          !failed &&
          items.map(({ key, label, quote, options }) => (
            <section key={key} className="grid gap-2 rounded-card border border-border p-3">
              <strong className="break-words text-[13px]">{label}</strong>
              {options.length > 1 ? (
                <ActionPaymentOptionPicker
                  options={options}
                  value={quote.option.id}
                  disabled={loading}
                  onChange={(id) => onOptionChange(key, id)}
                />
              ) : (
                <span className="text-[12px] text-fg-muted">
                  {quote.option.fundingSource === "byok"
                    ? t("byokRoute", { provider: quote.option.providerLabel })
                    : `${t("platform")} · ${quote.option.providerLabel}`}
                </span>
              )}
              <span className="text-[14px] font-semibold tabular-nums">
                {formatPaymentAmount(quote.charge, locale)}
              </span>
              {quote.maximumCharge ? (
                <span className="text-[12px] tabular-nums">
                  {t("maximum", { amount: formatPaymentMaximum(quote.maximumCharge, locale) })}
                </span>
              ) : null}
              {quote.cache.freeUntil ? (
                <span className="text-[12px] text-fg-muted">
                  {t("freeUntil", {
                    date: format.dateTime(new Date(quote.cache.freeUntil), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </span>
              ) : null}
              <CacheWindowLine onRefresh={onRefresh} quote={quote} />
              {!assessment && quote.option.fundingSource === "platform" && quote.wallet ? (
                <span className="text-[12px] tabular-nums">
                  {t("wallet", { amount: formatPaymentAmount(quote.wallet.available, locale) })}
                </span>
              ) : null}
              {!quote.availability.allowed ? (
                <p role="alert" className="m-0 text-[12px] text-warning">
                  {t(
                    quote.availability.reason === "insufficient_credits"
                      ? "insufficientCredits"
                      : "blocked",
                  )}
                </p>
              ) : null}
            </section>
          ))}
        {!loading && !failed && assessment ? (
          <div className="grid gap-2 border-t border-border pt-3">
            <span className="text-[12px] tabular-nums">
              {t("total")}:{" "}
              {assessment.charges.map((amount, index) => (
                <span key={`${amount.unit.kind}:${index}`} className="mr-2 inline-block">
                  {formatPaymentAmount(amount, locale)}
                </span>
              ))}
            </span>
            {usesCredits && assessment.wallet ? (
              <span className="text-[12px] tabular-nums">
                {t("wallet", { amount: formatPaymentAmount(assessment.wallet.available, locale) })}
              </span>
            ) : null}
            {!assessment.allowed ? (
              <p role="alert" className="m-0 text-[12px] text-warning">
                {t(
                  assessment.reason === "insufficient_credits" ? "insufficientCredits" : "blocked",
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function CacheWindowLine({
  onRefresh,
  quote,
}: {
  onRefresh?: () => void;
  quote: ActionPaymentQuote;
}) {
  const t = useTranslations("shared.actionPayment");
  const formatDuration = useFormatDuration();
  const { canEditProject, projectRef } = useProjectWriteMode();
  const seconds = quote.cache.windowSeconds;
  if (
    (quote.cache.state !== "miss" && quote.cache.state !== "mixed") ||
    typeof seconds !== "number"
  ) {
    return null;
  }
  const settingsHref =
    canEditProject && projectRef
      ? `${appPath(projectRef, "settings", "general")}#data-cache`
      : null;
  return (
    <span className="text-[12px] text-fg-muted">
      <span>{t("cacheWindow", { duration: formatDuration(seconds) })}</span>
      {settingsHref ? (
        <>
          {" · "}
          <a className="underline" href={settingsHref} rel="noopener" target="_blank">
            {t("changeCache")}
          </a>
        </>
      ) : null}
      {onRefresh ? (
        <>
          {" · "}
          <button
            className="border-0 bg-transparent p-0 text-[12px] text-inherit underline"
            onClick={onRefresh}
            type="button"
          >
            {t("refreshEstimate")}
          </button>
        </>
      ) : null}
    </span>
  );
}
