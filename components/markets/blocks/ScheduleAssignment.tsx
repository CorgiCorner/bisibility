"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";

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
  const selected = schedules.find((schedule) => schedule.id === selectedId);
  const manual = selectedId === null || selected?.frequency === "manual";
  const counted =
    keywordCount > 0 && fixed > 0
      ? `${keywordCount} keyword${keywordCount === 1 ? "" : "s"} · ${fixed} check${fixed === 1 ? "" : "s"} per run.`
      : "New keywords will join this schedule.";

  return (
    <section aria-label="Schedule assignment" className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel className="text-[12px] font-semibold text-fg" label="Schedule" />
        {onNewSchedule ? (
          <Button onClick={onNewSchedule} size="xs" type="button" variant="ghost">
            New schedule
          </Button>
        ) : null}
      </div>
      <MenuSelect
        ariaLabel="Schedule"
        onChange={(next) => {
          if (next === "manual") onChange(null);
          else if (schedules.some((schedule) => schedule.id === next)) onChange(next);
        }}
        options={[
          { label: "Manual", value: "manual" },
          ...schedules
            .filter((schedule) => schedule.frequency !== "manual")
            .map((schedule) => ({ label: schedule.name, value: schedule.id })),
        ]}
        size="input"
        value={manual ? "manual" : (selectedId ?? "manual")}
      />
      {selectedId && !selected ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          This schedule is no longer available. Choose a current schedule.
        </p>
      ) : (
        <p className="m-0 text-[12px] text-fg-muted">
          {manual ? "Checks run only when you start them." : counted}
        </p>
      )}
    </section>
  );
}
