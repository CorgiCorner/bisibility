import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { scheduleTimezoneOptions } from "@/lib/schedules/form-defaults";
import { scheduleNameAfterChange } from "@/lib/schedules/suggested-name";
import type { SerpDepth } from "@/lib/serp/constants";
import { FIELD_HELP } from "@/lib/settings/field-help";
import type {
  FieldErrors,
  PathValue,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { NewScheduleValues } from "./set-schedule-model";

type NewScheduleFromSelectionProps = {
  errors: FieldErrors<NewScheduleValues>;
  register: UseFormRegister<NewScheduleValues>;
  selectedCount: number;
  projectDepth?: SerpDepth;
  projectTimezone?: string;
  setValue: UseFormSetValue<NewScheduleValues>;
  watch: UseFormWatch<NewScheduleValues>;
};

const frequencyOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom cron", value: "custom_cron" },
] as const;
const timeOptions = ["06:00", "08:00", "18:00", "22:00"].map((value) => ({
  label: value,
  value,
}));
const dayOptions = weekdays.map((value) => ({ label: value, value }));
const monthDayOptions = monthDays.map((value) => ({ label: value, value }));

function targetLabel(count: number) {
  return `${count} target${count === 1 ? "" : "s"}`;
}

export function NewScheduleFromSelection({
  errors,
  register,
  selectedCount,
  projectDepth,
  projectTimezone,
  setValue,
  watch,
}: Readonly<NewScheduleFromSelectionProps>) {
  const frequency = watch("frequency");
  const cronExpression = watch("cronExpression");
  const day = watch("day");
  const dayOfMonth = watch("dayOfMonth");
  const timeOfDay = watch("timeOfDay");
  const timezone = watch("timezone");

  function setCadenceValue<
    K extends "frequency" | "day" | "dayOfMonth" | "timeOfDay" | "cronExpression",
  >(field: K, value: NewScheduleValues[K]) {
    const before = { ...watch(), weekday: watch("day") };
    const after = { ...before, [field]: value, weekday: field === "day" ? value : before.weekday };
    setValue("name", scheduleNameAfterChange(before.name, before, after));
    setValue(field, value as PathValue<NewScheduleValues, K>, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="text-[12px] font-semibold text-fg" htmlFor="new-schedule-name">
          Name
        </label>
        <Input {...register("name")} aria-label="Name" id="new-schedule-name" />
      </div>
      {errors.name ? (
        <p className="m-0 text-[11.5px] text-red-text">{errors.name.message}</p>
      ) : null}
      <div className="grid gap-1.5">
        <FieldLabel help={FIELD_HELP.frequency} label="Frequency" />
        <input type="hidden" {...register("frequency")} />
        <div
          aria-label="Frequency"
          className="inline-flex w-fit flex-wrap gap-0.5 rounded-control border border-border-control p-[3px]"
          role="radiogroup"
        >
          {frequencyOptions.map((option) => (
            <label
              className="rounded-control border border-transparent px-2.5 py-0.5 text-[12px] text-fg has-[:checked]:border-border-control has-[:checked]:bg-nav-active"
              key={option.value}
            >
              <input
                checked={frequency === option.value}
                className="sr-only"
                name="new-schedule-frequency"
                onChange={() => setCadenceValue("frequency", option.value)}
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      {frequency === "custom_cron" ? (
        <div className="grid gap-1.5">
          <FieldLabel help={FIELD_HELP.cron} label="Cron" />
          <Input
            aria-label="Cron"
            placeholder="0 6 * * *"
            {...register("cronExpression")}
            onChange={(event) => setCadenceValue("cronExpression", event.currentTarget.value)}
            value={cronExpression}
          />
          {errors.cronExpression ? (
            <p className="m-0 text-[11.5px] text-red-text">{errors.cronExpression.message}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {frequency === "weekly" || frequency === "monthly" ? (
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-[12px] font-semibold text-fg">
              {frequency === "weekly" ? "Day" : "Day of month"}
            </span>
            <MenuSelect
              ariaLabel={frequency === "weekly" ? "Day" : "Day of month"}
              onChange={(value) =>
                frequency === "weekly"
                  ? setCadenceValue("day", value as NewScheduleValues["day"])
                  : setCadenceValue("dayOfMonth", value as NewScheduleValues["dayOfMonth"])
              }
              options={frequency === "weekly" ? dayOptions : monthDayOptions}
              value={frequency === "weekly" ? day : dayOfMonth}
            />
          </div>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-[12px] font-semibold text-fg">Time</span>
          <MenuSelect
            ariaLabel="Time"
            onChange={(value) => setCadenceValue("timeOfDay", value)}
            options={timeOptions}
            value={timeOfDay}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <FieldLabel help={FIELD_HELP.timezone} label="Timezone" />
        <input type="hidden" {...register("timezone")} />
        <MenuSelect
          ariaLabel="Timezone"
          onChange={(value) =>
            setValue("timezone", value, { shouldDirty: true, shouldValidate: true })
          }
          options={scheduleTimezoneOptions(projectTimezone, timezone)}
          searchable
          searchPlaceholder="Search time zones..."
          value={timezone}
        />
        {errors.timezone ? (
          <p className="m-0 text-[11.5px] text-red-text">{errors.timezone.message}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel help={FIELD_HELP.jitter} label="Jitter (min)" />
        <Input
          aria-label="Jitter (min)"
          max={120}
          min={0}
          type="number"
          {...register("jitterMinutes")}
        />
        {errors.jitterMinutes ? (
          <p className="m-0 text-[11.5px] text-red-text">{errors.jitterMinutes.message}</p>
        ) : null}
      </div>
      <div className="grid gap-1 text-[11.5px] leading-relaxed">
        <p className="m-0 text-fg">
          Depth:{" "}
          <span>{projectDepth ? `Project default (Top ${projectDepth})` : "Project default"}</span>
        </p>
        <p className="m-0 text-fg-muted">Depth and provider follow your project settings.</p>
      </div>
      <p className="m-0 text-[12.5px] leading-relaxed text-fg">
        {selectedCount} {selectedCount === 1 ? "keyword" : "keywords"} /{" "}
        {targetLabel(selectedCount)}, cost depends on cadence.
      </p>
    </div>
  );
}
