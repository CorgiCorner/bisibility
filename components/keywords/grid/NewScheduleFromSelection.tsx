import { useScheduleNameLabels } from "@/components/schedules/useScheduleNameLabels";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { scheduleTimezoneOptions } from "@/lib/schedules/form-defaults";
import { scheduleNameAfterChange } from "@/lib/schedules/suggested-name";
import type { SerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
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

const timeOptions = ["06:00", "08:00", "18:00", "22:00"].map((value) => ({
  label: value,
  value,
}));

export function NewScheduleFromSelection({
  errors,
  register,
  selectedCount,
  projectDepth,
  projectTimezone,
  setValue,
  watch,
}: Readonly<NewScheduleFromSelectionProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.schedule");
  const scheduleNames = useScheduleNameLabels();
  const frequency = watch("frequency");
  const cronExpression = watch("cronExpression");
  const day = watch("day");
  const dayOfMonth = watch("dayOfMonth");
  const timeOfDay = watch("timeOfDay");
  const timezone = watch("timezone");
  const weekdayKeys = {
    Friday: "weekdayFriday",
    Monday: "weekdayMonday",
    Saturday: "weekdaySaturday",
    Sunday: "weekdaySunday",
    Thursday: "weekdayThursday",
    Tuesday: "weekdayTuesday",
    Wednesday: "weekdayWednesday",
  } as const;
  const frequencyOptions = [
    { label: t("daily"), value: "daily" },
    { label: t("weekly"), value: "weekly" },
    { label: t("monthly"), value: "monthly" },
    { label: t("customCron"), value: "custom_cron" },
  ] as const;
  const dayOptions = weekdays.map((value) => ({ label: t(weekdayKeys[value]), value }));
  const monthDayOptions = monthDays.map((value) => ({
    label: t("dayOfMonthValue", { day: Number.parseInt(value, 10) }),
    value,
  }));
  const timezoneOptions = scheduleTimezoneOptions(
    projectTimezone,
    timezone,
    t("projectTimezone", { timezone: projectTimezone ?? "empty" }),
  );

  function setCadenceValue<
    K extends "frequency" | "day" | "dayOfMonth" | "timeOfDay" | "cronExpression",
  >(field: K, value: NewScheduleValues[K]) {
    const before = { ...watch(), weekday: watch("day") };
    const after = { ...before, [field]: value, weekday: field === "day" ? value : before.weekday };
    setValue("name", scheduleNameAfterChange(before.name, before, after, scheduleNames));
    setValue(field, value as PathValue<NewScheduleValues, K>, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="text-[12px] font-semibold text-fg" htmlFor="new-schedule-name">
          {t("name")}
        </label>
        <Input {...register("name")} aria-label={t("name")} id="new-schedule-name" />
      </div>
      {errors.name ? <p className="m-0 text-[11.5px] text-red-text">{t("invalidName")}</p> : null}
      <div className="grid gap-1.5">
        <FieldLabel help={t("frequencyHelp")} label={t("frequency")} />
        <input type="hidden" {...register("frequency")} />
        <div
          aria-label={t("frequency")}
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
          <FieldLabel help={t("cronHelp")} label={t("cron")} />
          <Input
            aria-label={t("cron")}
            placeholder={t("cronPlaceholder")}
            {...register("cronExpression")}
            onChange={(event) => setCadenceValue("cronExpression", event.currentTarget.value)}
            value={cronExpression}
          />
          {errors.cronExpression ? (
            <p className="m-0 text-[11.5px] text-red-text">{t("invalidCron")}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {frequency === "weekly" || frequency === "monthly" ? (
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-[12px] font-semibold text-fg">
              {frequency === "weekly" ? t("day") : t("dayOfMonth")}
            </span>
            <MenuSelect
              ariaLabel={frequency === "weekly" ? t("day") : t("dayOfMonth")}
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
          <span className="text-[12px] font-semibold text-fg">{t("time")}</span>
          <MenuSelect
            ariaLabel={t("time")}
            onChange={(value) => setCadenceValue("timeOfDay", value)}
            options={timeOptions}
            value={timeOfDay}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <FieldLabel help={t("timezoneHelp")} label={t("timezone")} />
        <input type="hidden" {...register("timezone")} />
        <MenuSelect
          ariaLabel={t("timezone")}
          onChange={(value) =>
            setValue("timezone", value, { shouldDirty: true, shouldValidate: true })
          }
          options={timezoneOptions}
          searchable
          searchPlaceholder={t("searchTimezones")}
          value={timezone}
        />
        {errors.timezone ? (
          <p className="m-0 text-[11.5px] text-red-text">{t("invalidTimezone")}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel help={t("jitterHelp")} label={t("jitter")} />
        <Input
          aria-label={t("jitter")}
          max={120}
          min={0}
          type="number"
          {...register("jitterMinutes")}
        />
        {errors.jitterMinutes ? (
          <p className="m-0 text-[11.5px] text-red-text">{t("invalidJitter")}</p>
        ) : null}
      </div>
      <div className="grid gap-1 text-[11.5px] leading-relaxed">
        <p className="m-0 text-fg">
          {t("depth")}:{" "}
          <span>
            {projectDepth ? t("projectDefaultDepth", { depth: projectDepth }) : t("projectDefault")}
          </span>
        </p>
        <p className="m-0 text-fg-muted">{t("depthProviderHint")}</p>
      </div>
      <p className="m-0 text-[12.5px] leading-relaxed text-fg">
        {t("selectionCostHint", { count: selectedCount })}
      </p>
    </div>
  );
}
