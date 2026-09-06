import { FieldLabel, Input, MenuSelect } from "@/components/ui";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import type { NewScheduleValues } from "./set-schedule-model";

type NewScheduleFromSelectionProps = {
  errors: FieldErrors<NewScheduleValues>;
  register: UseFormRegister<NewScheduleValues>;
  selectedCount: number;
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
const dayOptions = ["Monday", "Thursday"].map((value) => ({ label: value, value }));

function targetLabel(count: number) {
  return `${count} target${count === 1 ? "" : "s"}`;
}

export function NewScheduleFromSelection({
  errors,
  register,
  selectedCount,
  setValue,
  watch,
}: Readonly<NewScheduleFromSelectionProps>) {
  const frequency = watch("frequency");
  const cronExpression = watch("cronExpression");
  const day = watch("day");
  const timeOfDay = watch("timeOfDay");
  const timezone = watch("timezone");

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
                onChange={() => setValue("frequency", option.value, { shouldDirty: true })}
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
            value={cronExpression}
          />
          {errors.cronExpression ? (
            <p className="m-0 text-[11.5px] text-red-text">{errors.cronExpression.message}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {frequency === "weekly" ? (
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-[12px] font-semibold text-fg">Day</span>
            <MenuSelect
              ariaLabel="Day"
              onChange={(value) => setValue("day", value as NewScheduleValues["day"])}
              options={dayOptions}
              value={day}
            />
          </div>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-[12px] font-semibold text-fg">Time</span>
          <MenuSelect
            ariaLabel="Time"
            onChange={(value) => setValue("timeOfDay", value)}
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
          options={timezoneSelectOptions(timezone)}
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
      <p className="m-0 text-[11.5px] leading-relaxed text-fg-muted">
        Depth and provider follow the project. Change them in the schedule after it exists.
      </p>
      <p className="m-0 text-[12.5px] leading-relaxed text-fg">
        {selectedCount} {selectedCount === 1 ? "keyword" : "keywords"} /{" "}
        {targetLabel(selectedCount)}, cost depends on cadence.
      </p>
    </div>
  );
}
