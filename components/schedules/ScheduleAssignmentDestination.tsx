"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";

export type ScheduleAssignmentOption = { publicId: string; name: string; isDefault?: boolean };
export function ScheduleAssignmentDestination({
  disabled,
  schedules,
  value,
  onChange,
}: Readonly<{
  disabled: boolean;
  schedules: readonly ScheduleAssignmentOption[];
  value: string;
  onChange: (value: string) => void;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const options = schedules.map((schedule) => ({
    value: schedule.publicId,
    label: schedule.name,
    trailing: schedule.isDefault ? (
      <span className="rounded bg-bg-soft px-1.5 py-0.5 text-[10px] text-fg-muted">
        {t("default")}
      </span>
    ) : undefined,
    ariaLabel: schedule.isDefault ? `${schedule.name}, ${t("default")}` : schedule.name,
  }));
  return (
    <div className="border-b border-border pb-3.5">
      <MenuSelect
        ariaLabel={t("drawer.schedule")}
        disabled={disabled}
        size="input"
        value={value}
        onChange={onChange}
        options={options}
        selectedContent={(option) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{option?.label ?? t("drawer.schedule")}</span>
            {option?.trailing}
          </span>
        )}
      />
    </div>
  );
}
