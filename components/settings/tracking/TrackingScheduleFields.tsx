import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { CronRunPreview } from "@/components/settings/tracking/CronRunPreview";
import type { TrackingDefaultsForm } from "@/components/settings/tracking/tracking-form";
import { FieldLabel, Input, MenuSelect } from "@/components/ui";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { frequencyOptions } from "@/lib/settings/options";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
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
  const cronRegistration = form.register("cronExpression");
  const timed = frequency === "monthly" || frequency === "custom_cron";

  return (
    <div className="space-y-4">
      <SettingsField width="sm">
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

      {frequency === "custom_cron" ? (
        <SettingsField width="md">
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

      {timed ? (
        <SettingsField width="md">
          <FieldLabel className={labelClass} label="Timezone" />
          <input type="hidden" {...form.register("timezone")} />
          <MenuSelect
            ariaLabel="Timezone"
            onChange={onTimezoneChange}
            options={timezoneSelectOptions(timezone)}
            searchable
            searchPlaceholder="Search time zones..."
            triggerClassName={`${triggerClass} mt-1.5`}
            value={timezone}
          />
          <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
            {frequency === "monthly"
              ? "The monthly wall-clock anchor follows this timezone through daylight saving changes."
              : "The cron expression is read in this timezone."}
          </p>
        </SettingsField>
      ) : null}

      {frequency === "custom_cron" ? (
        <CronRunPreview pending={previewPending} preview={preview} />
      ) : null}
      <input type="hidden" {...form.register("jitterMinutes", { valueAsNumber: true })} />
    </div>
  );
}
