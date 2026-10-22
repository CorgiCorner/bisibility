"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import { useTranslations } from "next-intl";

export function ActionPaymentOptionPicker({
  options,
  value,
  disabled,
  onChange,
}: {
  options: ActionPaymentOption[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("shared.actionPayment");
  if (options.length < 2) return null;
  return (
    <MenuSelect
      ariaLabel={t("payer")}
      disabled={disabled}
      value={value}
      onChange={onChange}
      options={options.map((option) => ({
        value: option.id,
        label:
          option.fundingSource === "byok"
            ? t("byokRoute", { provider: option.providerLabel })
            : `${t("platform")} · ${option.providerLabel}`,
      }))}
    />
  );
}
