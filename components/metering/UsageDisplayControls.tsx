"use client";

import { settingsCardNaturalFrameClassName } from "@/components/settings/shell/settings-layout";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { usageDisplayPrecisions } from "@/lib/project-usage-display/schema";
import { useTranslations } from "next-intl";
import { useUsageDisplaySettings } from "./use-usage-display-settings";

export function UsageDisplayControls() {
  const t = useTranslations("projectSettingsUsage.meter.display");
  const { options, setOptions, canEdit, pending, error } = useUsageDisplaySettings();
  return (
    <Card id="usage-display" className={`${settingsCardNaturalFrameClassName} space-y-3`}>
      <div className="flex items-center gap-1">
        <SectionTitle>{t("title")}</SectionTitle>
        <InfoTooltip text={t("help")} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <MenuSelect
          size="toolbar"
          triggerClassName="h-[34px] min-h-[34px] text-[12px]"
          ariaLabel={t("money")}
          disabled={!canEdit || pending}
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
          size="toolbar"
          triggerClassName="h-[34px] min-h-[34px] text-[12px]"
          ariaLabel={t("precision")}
          disabled={!canEdit || pending}
          leadingLabel={t("precision")}
          onChange={(value) => {
            const fractionDigits = Number(value);
            setOptions({
              moneyFractionDigits: fractionDigits,
              quantityFractionDigits: fractionDigits,
            });
          }}
          options={usageDisplayPrecisions.map((count) => ({
            value: String(count),
            label: t("digits", { count }),
          }))}
          value={String(options.moneyFractionDigits)}
        />
      </div>
      {!canEdit ? <p className="mt-1 text-[12px] text-fg-muted">{t("readOnly")}</p> : null}
      {pending ? (
        <p role="status" className="mt-1 text-[12px] text-fg-muted">
          {t("saving")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-fg-muted">
          {t(error)}
        </p>
      ) : null}
    </Card>
  );
}
