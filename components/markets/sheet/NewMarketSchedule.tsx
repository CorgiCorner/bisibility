"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { useTranslations } from "next-intl";

export type NewMarketScheduleOption = {
  isDefault?: boolean;
  frequency: string;
  id: string;
  name: string;
};

type NewMarketScheduleProps = {
  onChange: (value: NewMarketCreateInput["schedule"]) => void;
  onNewSchedule: () => void;
  schedules: readonly NewMarketScheduleOption[];
  value: NewMarketCreateInput["schedule"];
};

export function NewMarketSchedule({
  onChange,
  onNewSchedule,
  schedules,
  value,
}: Readonly<NewMarketScheduleProps>) {
  const t = useTranslations("projectMarkets");
  return (
    <section aria-label={t("schedule")} className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel label={t("schedule")} />
        <Button onClick={onNewSchedule} size="xs" type="button" variant="ghost">
          {t("newSchedule")}
        </Button>
      </div>
      <MenuSelect
        ariaLabel={t("schedule")}
        onChange={(scheduleId) =>
          onChange(scheduleId === "manual" ? { kind: "manual" } : { kind: "existing", scheduleId })
        }
        options={[
          { label: t("manual"), value: "manual" },
          ...schedules
            .filter((schedule) => schedule.frequency !== "manual")
            .map((schedule) => ({ label: schedule.name, value: schedule.id })),
        ]}
        size="input"
        value={
          value?.kind === "existing" ? value.scheduleId : value?.kind === "manual" ? "manual" : ""
        }
      />
    </section>
  );
}
