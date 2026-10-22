"use client";

import { useUsageDisplaySettings } from "@/components/metering/use-usage-display-settings";
import type { PaymentAmount } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { defaultUsageDisplayOptions } from "@/lib/project-usage-display/schema";
import { useLocale } from "next-intl";

export type PresentedPaymentAmount = {
  text: string;
  title?: string;
};

export function usePaymentAmountFormatter() {
  const locale = useLocale();
  const settings = useUsageDisplaySettings();
  const options = settings?.options ?? defaultUsageDisplayOptions;
  return (amount: PaymentAmount): PresentedPaymentAmount => {
    const text = formatPaymentAmount(amount, locale, {
      moneyFractionDigits: options.moneyFractionDigits,
      quantityFractionDigits: options.quantityFractionDigits,
    });
    const exact = formatPaymentAmount(amount, locale);
    return text === exact ? { text } : { text, title: exact };
  };
}
