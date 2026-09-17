"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { ruleSeverityMeta } from "@/lib/alerts/new-rule-data";
import { type AlertSeverity, alertSeverities } from "@/lib/alerts/severity";
import { useTranslations } from "next-intl";

function severityLabel(
  value: AlertSeverity,
  t: ReturnType<typeof useTranslations<"projectAlerts.feed">>,
) {
  if (value === "urgent") return t("severityUrgent");
  if (value === "warning") return t("severityWarning");
  return t("severityInfo");
}

export function AlertSeveritySelect({
  onChange,
  value,
}: Readonly<{ onChange: (value: AlertSeverity) => void; value: AlertSeverity }>) {
  const t = useTranslations("projectAlerts.drawer");
  const feedT = useTranslations("projectAlerts.feed");
  const options = alertSeverities.map((optionValue) => ({
    icon: (
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: ruleSeverityMeta[optionValue].color }}
      />
    ),
    label: severityLabel(optionValue, feedT),
    value: optionValue,
  }));

  return (
    <div className="flex flex-col gap-[7px]">
      <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("severity")}
      </span>
      <MenuSelect
        ariaLabel={t("severity")}
        leadingIcon={
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ruleSeverityMeta[value].color }}
          />
        }
        onChange={(next) => onChange(next as AlertSeverity)}
        options={options}
        triggerClassName="mb-3 min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium [&>span:nth-of-type(2)]:flex-1 [&>span:nth-of-type(2)]:text-left"
        value={value}
      />
    </div>
  );
}
