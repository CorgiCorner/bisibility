"use client";

import { useTranslations } from "next-intl";

export function SchedulePlanningNotice({ minutes }: Readonly<{ minutes: number | null }>) {
  const t = useTranslations("projectRuns.schedules.planning");
  return (
    <p className="m-0 text-[12px] leading-5 text-fg-muted">
      {minutes === null ? t("delayUnknown") : t("delay", { minutes })}
    </p>
  );
}

export function ScheduleSaveConfirmation({
  minutes,
  showPlanningHint,
}: Readonly<{ minutes: number | null; showPlanningHint: boolean }>) {
  const t = useTranslations("projectRuns.schedules.editor");
  return (
    <div
      className="grid gap-1 rounded-card border border-border bg-bg-elev px-4 py-3"
      role="status"
    >
      <p className="m-0 text-[12px] font-semibold text-fg">{t("saved")}</p>
      {showPlanningHint ? <SchedulePlanningNotice minutes={minutes} /> : null}
    </div>
  );
}
