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
import type { PathValue, UseFormReturn } from "react-hook-form";
import {
  cronPreview,
  defaultScheduleNote,
  type ScheduleEditorProjectDefaults,
  type ScheduleEditorProvider,
  type ScheduleEditorValues,
  scheduleDepthOptions,
  scheduleOverrideHelp,
  scheduleOverrideOptions,
} from "./ScheduleEditorModel";

type ScheduleEditorFieldsProps = {
  defaultScheduleName?: string | null;
  connectedProviders: readonly ScheduleEditorProvider[];
  form: UseFormReturn<ScheduleEditorValues>;
  projectDefaults: ScheduleEditorProjectDefaults;
  projectTimezone: string;
  referenceIso?: string;
};

const labelClass = "text-[12px] font-semibold text-fg";
const errorClass = "text-[11px] leading-5 text-red-text";
const fieldClass = cn(compactInputGeometryClassName, "px-2.5 text-[12.5px] font-normal");
const triggerClass =
  "min-h-[34px] w-full justify-between rounded-control border-border-control bg-transparent px-2.5 py-[7px] text-[12.5px] font-normal normal-case tracking-normal";

function ErrorText({ text }: Readonly<{ text?: string }>) {
  return text ? <span className={errorClass}>{text}</span> : null;
}

export function ScheduleEditorFields({
  defaultScheduleName,
  connectedProviders,
  form,
  projectDefaults,
  projectTimezone,
  referenceIso,
}: Readonly<ScheduleEditorFieldsProps>) {
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
    setValue("name", scheduleNameAfterChange(before.name, before, { ...before, [field]: value }));
    setValue(field, value as PathValue<ScheduleEditorValues, K>, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  const preview =
    frequency === "custom_cron"
      ? cronPreview(cronExpression, timezone || projectTimezone, referenceIso)
      : null;
  const timezoneOptions = scheduleTimezoneOptions(projectTimezone, timezone);

  return (
    <div className="flex flex-col gap-3.5 p-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} htmlFor="schedule-name" label="Name" />
        <Input className={fieldClass} id="schedule-name" {...register("name")} />
        <ErrorText text={errors.name?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} label="Frequency" />
        <input type="hidden" {...register("frequency")} />
        <SegmentedControl
          ariaLabel="Frequency"
          fitContent
          onChange={(value) => setCadenceValue("frequency", value)}
          options={[
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" },
            { label: "Custom cron", value: "custom_cron" },
          ]}
          size="toolbar"
          value={frequency}
        />
      </div>

      {frequency === "custom_cron" ? (
        <div className="flex flex-col gap-1.5">
          <FieldLabel className={labelClass} htmlFor="schedule-cron" label="Cron expression" />
          <Input
            aria-label="Cron expression"
            className={cn(fieldClass, "font-mono")}
            id="schedule-cron"
            {...register("cronExpression")}
            onChange={(event) => setCadenceValue("cronExpression", event.currentTarget.value)}
          />
          <span className="text-[11.5px] leading-5 text-fg-muted">{preview?.detail}</span>
          {preview?.next ? (
            <span className="text-[11.5px] leading-5 text-fg">{preview.next}</span>
          ) : null}
          <ErrorText text={errors.cronExpression?.message} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3.5">
        {frequency === "weekly" ? (
          <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <FieldLabel className={labelClass} label="Day of week" />
            <input type="hidden" {...register("weekday")} />
            <MenuSelect
              ariaLabel="Day of week"
              onChange={(value) =>
                setCadenceValue("weekday", value as ScheduleEditorValues["weekday"])
              }
              options={weekdays.map((value) => ({ label: value, value }))}
              triggerClassName={triggerClass}
              value={watch("weekday")}
            />
          </div>
        ) : null}
        {frequency === "monthly" ? (
          <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
            <FieldLabel className={labelClass} label="Day of month" />
            <input type="hidden" {...register("dayOfMonth")} />
            <MenuSelect
              ariaLabel="Day of month"
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
            <FieldLabel className={labelClass} htmlFor="schedule-time" label="Time" />
            <Input
              aria-label="Time, 24-hour"
              className={fieldClass}
              id="schedule-time"
              inputMode="numeric"
              placeholder="No fixed time"
              {...register("timeOfDay")}
              onChange={(event) => setCadenceValue("timeOfDay", event.currentTarget.value)}
            />
            <span className="text-[11px] text-fg-muted">
              {watch("timeOfDay")
                ? "30-minute steps"
                : frequency === "daily"
                  ? "No fixed time - checks are spread across the day."
                  : "No fixed time - checks are spread across the interval."}
            </span>
            <ErrorText text={errors.timeOfDay?.message} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel className={labelClass} label="Time zone" />
        <input type="hidden" {...register("timezone")} />
        <MenuSelect
          ariaLabel="Time zone"
          onChange={(value) =>
            setValue("timezone", value, { shouldDirty: true, shouldValidate: true })
          }
          options={timezoneOptions}
          searchable
          searchPlaceholder="Search time zones"
          triggerClassName={triggerClass}
          value={timezone}
        />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <SelectField
          ariaLabel="Start window"
          form={form}
          label="Start window"
          name="jitterMinutes"
          options={[
            { label: "Up to 15 minutes", value: "15" },
            { label: "None - start exactly on time", value: "0" },
            { label: "Up to 60 minutes", value: "60" },
          ]}
          help="Spreads the start so schedules firing at the same time do not hit the provider at once."
        />
        <SelectField
          ariaLabel="Depth"
          form={form}
          help={scheduleOverrideHelp}
          label="Depth"
          name="serpDepth"
          options={scheduleDepthOptions(projectDefaults.serpDepth)}
        />
        <SelectField
          ariaLabel="Provider"
          form={form}
          help={scheduleOverrideHelp}
          label="Provider"
          name="providerPolicy"
          options={scheduleOverrideOptions(
            projectDefaults.provider?.label ?? null,
            connectedProviders,
          )}
        />
      </div>

      {savedDefault ? (
        <div className="flex flex-col gap-1 text-[12px]">
          <span className="font-semibold text-fg">Default for new keywords</span>
          <span className="text-fg-muted">
            New keywords use this schedule unless you choose another.
          </span>
        </div>
      ) : (
        <Switch
          checked={isDefault}
          description={defaultScheduleNote(defaultScheduleName)}
          label="Use as default for new keywords"
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

type SelectFieldProps = {
  ariaLabel: string;
  form: UseFormReturn<ScheduleEditorValues>;
  help?: string;
  label: string;
  name: "jitterMinutes" | "providerPolicy" | "serpDepth";
  options: { label: string; value: string }[];
};

function SelectField({ ariaLabel, form, help, label, name, options }: Readonly<SelectFieldProps>) {
  const { register, setValue, watch } = form;
  return (
    <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5">
      <FieldLabel className={labelClass} label={label} />
      <input type="hidden" {...register(name)} />
      <MenuSelect
        ariaLabel={ariaLabel}
        onChange={(value) =>
          setValue(name, value as ScheduleEditorValues[typeof name], {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        options={options}
        triggerClassName={triggerClass}
        value={watch(name)}
      />
      {help ? <span className="text-[11px] leading-5 text-fg-muted">{help}</span> : null}
    </div>
  );
}
