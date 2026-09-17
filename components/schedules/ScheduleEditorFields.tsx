"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { compactInputGeometryClassName } from "@/components/ui/input-styles";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { scheduleTimezoneOptions } from "@/lib/schedules/form-defaults";
import { scheduleNameAfterChange } from "@/lib/schedules/suggested-name";
import { cn } from "@/lib/ui/cn";
import { useLocale, useTranslations } from "next-intl";
import type { PathValue, UseFormReturn } from "react-hook-form";
import {
  ScheduleEditorErrorText,
  ScheduleEditorSelectField,
} from "./ScheduleEditorFieldPrimitives";
import {
  cronPreview,
  type ScheduleEditorProjectDefaults,
  type ScheduleEditorProvider,
  type ScheduleEditorValues,
} from "./ScheduleEditorModel";
import {
  cronPreviewDetail,
  cronPreviewRuns,
  depthSelectOptions,
  providerSelectOptions,
} from "./schedule-editor-field-options";
import { useScheduleNameLabels } from "./useScheduleNameLabels";

type ScheduleEditorFieldsProps = {
  defaultScheduleName?: string | null;
  connectedProviders: readonly ScheduleEditorProvider[];
  form: UseFormReturn<ScheduleEditorValues>;
  projectDefaults: ScheduleEditorProjectDefaults;
  projectTimezone: string;
  referenceIso?: string;
};

const labelClass = "text-[12px] font-semibold text-fg";
const fieldClass = cn(compactInputGeometryClassName, "px-2.5 text-[12.5px] font-normal");
const triggerClass =
  "min-h-[34px] w-full justify-between rounded-control border-border-control bg-transparent px-2.5 py-[7px] text-[12.5px] font-normal normal-case tracking-normal";

export function ScheduleEditorFields({
  defaultScheduleName,
  connectedProviders,
  form,
  projectDefaults,
  projectTimezone,
  referenceIso,
}: Readonly<ScheduleEditorFieldsProps>) {
  const locale = useLocale();
  const t = useTranslations("projectRuns.schedules");
  const scheduleNames = useScheduleNameLabels();
  const {
    formState: { errors },
    register,
    setValue,
    watch,
  } = form;
  const frequency = watch("frequency");
  const timezone = watch("timezone");
  const cronExpression = watch("cronExpression");
  const isDefault = watch("isDefault");
  const savedDefault = form.formState.defaultValues?.isDefault === true;
  function setCadenceValue<
    K extends "frequency" | "weekday" | "dayOfMonth" | "timeOfDay" | "cronExpression",
  >(field: K, value: ScheduleEditorValues[K]) {
    const before = form.getValues();
    setValue(
      "name",
      scheduleNameAfterChange(before.name, before, { ...before, [field]: value }, scheduleNames),
    );
    setValue(field, value as PathValue<ScheduleEditorValues, K>, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  const preview =
    frequency === "custom_cron"
      ? cronPreview(cronExpression, timezone || projectTimezone, referenceIso)
      : null;
  const timezoneOptions = scheduleTimezoneOptions(
    projectTimezone,
    timezone,
    projectTimezone
      ? t("useProjectTimeZoneNamed", { timezone: projectTimezone })
      : t("useProjectTimeZone"),
  );
  const previewDetail = cronPreviewDetail(preview, t);
  const previewRuns = cronPreviewRuns(preview, locale);
  const previewTimeZone = preview?.timeZone ?? projectTimezone;
  const overrideHelp = t("editor.overrideHelp");
  const providerOptions = providerSelectOptions(t, projectDefaults, connectedProviders);
  const depthOptions = depthSelectOptions(t, projectDefaults);

  return (
    <div className="flex flex-col gap-3.5 p-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} htmlFor="schedule-name" label={t("name")} />
        <Input className={fieldClass} id="schedule-name" {...register("name")} />
        <ScheduleEditorErrorText text={errors.name?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} label={t("frequency")} />
        <input type="hidden" {...register("frequency")} />
        <SegmentedControl
          ariaLabel={t("frequency")}
          fitContent
          onChange={(value) => setCadenceValue("frequency", value)}
          options={[
            { label: t("frequencyDaily"), value: "daily" },
            { label: t("frequencyWeekly"), value: "weekly" },
            { label: t("frequencyMonthly"), value: "monthly" },
            { label: t("editor.customCron"), value: "custom_cron" },
          ]}
          size="toolbar"
          value={frequency}
        />
      </div>

      {frequency === "custom_cron" ? (
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            className={labelClass}
            htmlFor="schedule-cron"
            label={t("editor.cronExpression")}
          />
          <Input
            aria-label={t("editor.cronExpression")}
            className={cn(fieldClass, "font-mono")}
            id="schedule-cron"
            {...register("cronExpression")}
            onChange={(event) => setCadenceValue("cronExpression", event.currentTarget.value)}
          />
          {previewDetail ? (
            <span className="text-[11.5px] leading-5 text-fg-muted">{previewDetail}</span>
          ) : null}
          {previewRuns ? (
            <span className="text-[11.5px] leading-5 text-fg">
              {t("editor.nextThree", { runs: previewRuns.join(", "), timeZone: previewTimeZone })}
            </span>
          ) : null}
          <ScheduleEditorErrorText text={errors.cronExpression?.message} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3.5">
        {frequency === "weekly" ? (
          <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <FieldLabel className={labelClass} label={t("weekday")} />
            <input type="hidden" {...register("weekday")} />
            <MenuSelect
              ariaLabel={t("weekday")}
              onChange={(value) =>
                setCadenceValue("weekday", value as ScheduleEditorValues["weekday"])
              }
              options={weekdays.map((value) => ({ label: t(`weekdays.${value}`), value }))}
              triggerClassName={triggerClass}
              value={watch("weekday")}
            />
          </div>
        ) : null}
        {frequency === "monthly" ? (
          <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <FieldLabel className={labelClass} label={t("dayOfMonth")} />
            <input type="hidden" {...register("dayOfMonth")} />
            <MenuSelect
              ariaLabel={t("dayOfMonth")}
              onChange={(value) =>
                setCadenceValue("dayOfMonth", value as ScheduleEditorValues["dayOfMonth"])
              }
              options={monthDays.map((value) => ({ label: value, value }))}
              triggerClassName={triggerClass}
              value={watch("dayOfMonth")}
            />
          </div>
        ) : null}
        {frequency !== "custom_cron" ? (
          <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <FieldLabel className={labelClass} htmlFor="schedule-time" label={t("time")} />
            <Input
              aria-label={t("editor.time24")}
              className={fieldClass}
              id="schedule-time"
              inputMode="numeric"
              placeholder={t("editor.noFixedTime")}
              {...register("timeOfDay")}
              onChange={(event) => setCadenceValue("timeOfDay", event.currentTarget.value)}
            />
            <span className="text-[11px] text-fg-muted">
              {watch("timeOfDay")
                ? t("editor.thirtyMinuteSteps")
                : frequency === "daily"
                  ? t("editor.noFixedDaily")
                  : t("editor.noFixedInterval")}
            </span>
            <ScheduleEditorErrorText text={errors.timeOfDay?.message} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} label={t("timeZone")} />
        <input type="hidden" {...register("timezone")} />
        <MenuSelect
          ariaLabel={t("timeZone")}
          onChange={(value) =>
            setValue("timezone", value, { shouldDirty: true, shouldValidate: true })
          }
          options={timezoneOptions}
          searchable
          searchPlaceholder={t("timezoneSearch")}
          triggerClassName={triggerClass}
          value={timezone}
        />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <ScheduleEditorSelectField
          ariaLabel={t("editor.startWindow")}
          form={form}
          label={t("editor.startWindow")}
          labelClass={labelClass}
          name="jitterMinutes"
          options={[
            { label: t("editor.jitterFifteen"), value: "15" },
            { label: t("editor.jitterExact"), value: "0" },
            { label: t("editor.jitterSixty"), value: "60" },
          ]}
          triggerClassName={triggerClass}
          help={t("editor.startWindowHelp")}
        />
        <ScheduleEditorSelectField
          ariaLabel={t("editor.depth")}
          form={form}
          help={overrideHelp}
          label={t("editor.depth")}
          labelClass={labelClass}
          name="serpDepth"
          options={depthOptions}
          triggerClassName={triggerClass}
        />
        <ScheduleEditorSelectField
          ariaLabel={t("provider")}
          form={form}
          help={overrideHelp}
          label={t("provider")}
          labelClass={labelClass}
          name="providerPolicy"
          options={providerOptions}
          triggerClassName={triggerClass}
        />
      </div>

      {savedDefault ? (
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="font-semibold text-fg">{t("editor.defaultExisting")}</span>
          <span className="text-fg-muted">{t("editor.defaultExistingDescription")}</span>
        </div>
      ) : (
        <Switch
          checked={isDefault}
          description={
            defaultScheduleName
              ? t("editor.defaultReplacement", { name: defaultScheduleName })
              : t("editor.defaultEnabled")
          }
          label={t("editor.useAsDefault")}
          onChange={(event) =>
            setValue("isDefault", event.currentTarget.checked, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
      )}
    </div>
  );
}
