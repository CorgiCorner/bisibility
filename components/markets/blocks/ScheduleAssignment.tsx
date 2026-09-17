"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useTranslations } from "next-intl";

export type ScheduleAssignmentSchedule = {
  costPerCheckCents: number | null;
  frequency: "custom_cron" | "daily" | "manual" | "monthly" | "weekly";
  id: string;
  name: string;
};

export type ScheduleAssignmentProps = {
  fixed: number;
  keywordCount: number;
  onChange: (scheduleId: string | null) => void;
  onNewSchedule?: () => void;
  schedules: readonly ScheduleAssignmentSchedule[];
  selectedId: string | null;
};

export function ScheduleAssignment({
  fixed,
  keywordCount,
  onChange,
  onNewSchedule,
  schedules,
  selectedId,
}: Readonly<ScheduleAssignmentProps>) {
  const t = useTranslations("projectMarkets");
  const selected = schedules.find((schedule) => schedule.id === selectedId);
  const manual = selectedId === null || selected?.frequency === "manual";
  const counted =
    keywordCount > 0 && fixed > 0
      ? t("scheduleMemberCount", { checks: fixed, keywords: keywordCount })
      : t("scheduleEmpty");

  return (
    <section aria-label={t("scheduleAssignment")} className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel className="text-[12px] font-semibold text-fg" label={t("schedule")} />
        {onNewSchedule ? (
          <Button onClick={onNewSchedule} size="xs" type="button" variant="ghost">
            {t("newSchedule")}
          </Button>
        ) : null}
      </div>
      <MenuSelect
        ariaLabel={t("schedule")}
        onChange={(next) => {
          if (next === "manual") onChange(null);
          else if (schedules.some((schedule) => schedule.id === next)) onChange(next);
        }}
        options={[
          { label: t("manual"), value: "manual" },
          ...schedules
            .filter((schedule) => schedule.frequency !== "manual")
            .map((schedule) => ({ label: schedule.name, value: schedule.id })),
        ]}
        size="input"
        value={manual ? "manual" : (selectedId ?? "manual")}
      />
      {selectedId && !selected ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          {t("currentScheduleUnavailable")}
        </p>
      ) : (
        <p className="m-0 text-[12px] text-fg-muted">
          {manual ? t("scheduleDescription") : counted}
        </p>
      )}
    </section>
  );
}
