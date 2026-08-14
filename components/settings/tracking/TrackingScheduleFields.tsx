import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { CronRunPreview } from "@/components/settings/tracking/CronRunPreview";
import type { TrackingDefaultsForm } from "@/components/settings/tracking/tracking-form";
import { FieldLabel, Input, MenuSelect } from "@/components/ui";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { frequencyOptions } from "@/lib/settings/options";
import { isSupportedProjectTimezone, timezoneSelectOptions } from "@/lib/settings/timezones";
import type { UseFormReturn } from "react-hook-form";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const triggerClass =
  "min-h-10 w-full justify-between rounded-[9px] border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
const frequencyMenuOptions = frequencyOptions.map((option) => ({
  label: option.label,
  value: option.value,
}));

type TrackingScheduleFieldsProps = {
  form: UseFormReturn<TrackingDefaultsForm>;
  onCronBlur: () => void;
  onFrequencyChange: (value: TrackingDefaultsForm["frequency"]) => void;
  onTimezoneChange: (value: string) => void;
  preview: CronPreviewResult;
  previewPending: boolean;
};

export function TrackingScheduleFields({
  form,
  onCronBlur,
  onFrequencyChange,
  onTimezoneChange,
  preview,
  previewPending,
}: Readonly<TrackingScheduleFieldsProps>) {
  const frequency = form.watch("frequency");
  const timezone = form.watch("timezone");
  const timezoneError = form.formState.errors.timezone;
  const timezoneInvalid = !isSupportedProjectTimezone(timezone);
  const cronRegistration = form.register("cronExpression");
  const showCron = frequency === "custom_cron";

  return (
    <div className="space-y-4">
      <SettingsField width="field">
        <FieldLabel className={labelClass} label="Frequency" />
        <input type="hidden" {...form.register("frequency")} />
        <MenuSelect
          ariaLabel="Frequency"
          onChange={(value) => onFrequencyChange(value as TrackingDefaultsForm["frequency"])}
          options={frequencyMenuOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={frequency}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
          Frequency drives provider usage, not dashboard freshness.
        </p>
      </SettingsField>

      {showCron ? (
        <SettingsField width="field">
          <FieldLabel className={labelClass} htmlFor="tracking-cron" label="Cron expression" />
          <Input
            aria-describedby="tracking-cron-help"
            className="mt-1.5 font-mono text-[12.5px]"
            id="tracking-cron"
            {...cronRegistration}
            onBlur={(event) => {
              void cronRegistration.onBlur(event);
              onCronBlur();
            }}
          />
          <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted" id="tracking-cron-help">
            Five fields, standard syntax. Schedules must run at least one hour apart.
          </p>
        </SettingsField>
      ) : null}

      <SettingsField width="field">
        <FieldLabel className={labelClass} label="Timezone" />
        <input type="hidden" {...form.register("timezone")} />
        <MenuSelect
          ariaDescribedBy={
            timezoneInvalid
              ? "tracking-timezone-help tracking-timezone-error"
              : "tracking-timezone-help"
          }
          ariaInvalid={timezoneInvalid}
          ariaLabel="Timezone"
          onChange={onTimezoneChange}
          options={timezoneSelectOptions(timezone)}
          searchable
          searchPlaceholder="Search time zones..."
          triggerClassName={`${triggerClass} mt-1.5`}
          value={timezone}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted" id="tracking-timezone-help">
          Anchors all check schedules to the selected local clock.
        </p>
        {timezoneInvalid ? (
          <p
            className="m-0 mt-1 text-[11.5px] text-red-text"
            id="tracking-timezone-error"
            role="alert"
          >
            {timezoneError?.message ?? "Select a valid time zone."}
          </p>
        ) : null}
      </SettingsField>

      {showCron ? <CronRunPreview pending={previewPending} preview={preview} /> : null}
      <input type="hidden" {...form.register("jitterMinutes", { valueAsNumber: true })} />
    </div>
  );
}
