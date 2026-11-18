"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";

export type ScheduleAssignmentOption = { publicId: string; name: string };
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
      />
    </div>
  );
}
