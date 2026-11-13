"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import { useTranslations } from "next-intl";

export function ActionPaymentOptionPicker({
  options,
  value,
  disabled,
  onChange,
  size = "toolbar",
}: {
  options: ActionPaymentOption[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  size?: "input" | "toolbar";
}) {
  const t = useTranslations("shared.actionPayment");
  if (options.length < 2) return null;
  return (
    <MenuSelect
      ariaLabel={t("payer")}
      size={size}
      triggerClassName="w-auto"
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
