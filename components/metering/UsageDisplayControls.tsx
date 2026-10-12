"use client";

import { Disclosure } from "@/components/ui/Disclosure";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";
import { useUsageDisplaySettings } from "./use-usage-display-settings";

export function UsageDisplayControls() {
  const t = useTranslations("projectSettingsUsage.meter.display");
  const { options, setOptions } = useUsageDisplaySettings();
  return (
    <Disclosure
      className="border-0 bg-transparent"
      contentClassName="px-0 pb-2 sm:px-0"
      summaryClassName="px-0 py-2 sm:px-0 [&>h3]:text-[13px] [&>h3]:font-medium"
      title={t("title")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <MenuSelect
          ariaLabel={t("money")}
          leadingLabel={t("money")}
          onChange={(moneyDisplay) =>
            setOptions({ moneyDisplay: moneyDisplay === "raw-unit" ? "raw-unit" : "currency" })
          }
          options={[
            { value: "currency", label: t("currency") },
            { value: "raw-unit", label: t("cents") },
          ]}
          value={options.moneyDisplay}
        />
        <MenuSelect
          ariaLabel={t("precision")}
          leadingLabel={t("precision")}
          onChange={(value) => {
            const fractionDigits = Number(value);
            setOptions({
              moneyFractionDigits: fractionDigits,
              quantityFractionDigits: fractionDigits,
            });
          }}
          options={[0, 1, 2, 3, 4, 6].map((count) => ({
            value: String(count),
            label: t("digits", { count }),
          }))}
          value={String(options.moneyFractionDigits)}
        />
      </div>
      <p className="mt-2 text-[12px] text-fg-muted">{t("help")}</p>
    </Disclosure>
  );
}
