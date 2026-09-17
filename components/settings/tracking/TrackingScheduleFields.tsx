import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { CronRunPreview } from "@/components/settings/tracking/CronRunPreview";
import type { TrackingDefaultsForm } from "@/components/settings/tracking/tracking-form";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { frequencyOptions } from "@/lib/settings/options";
import { isSupportedProjectTimezone, timezoneSelectOptions } from "@/lib/settings/timezones";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";

const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const triggerClass =
  "min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
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
  const t = useTranslations("projectSettingsTracking.checkDefaults");
  const frequency = form.watch("frequency");
  const timezone = form.watch("timezone");
  const timezoneInvalid = !isSupportedProjectTimezone(timezone);
  const cronRegistration = form.register("cronExpression");
  const showCron = frequency === "custom_cron";
  const frequencyMenuOptions = frequencyOptions.map((option) => ({
    label:
      option.value === "daily"
        ? t("frequencyDaily")
        : option.value === "weekly"
          ? t("frequencyWeekly")
          : option.value === "monthly"
            ? t("frequencyMonthly")
            : option.value === "manual"
              ? t("frequencyManual")
              : option.value === "paused"
                ? t("frequencyPaused")
                : t("frequencyCustomCron"),
    value: option.value,
  }));

  return (
    <div className="space-y-4">
      <SettingsField className="scroll-mt-6" id="tracking-frequency" tabIndex={-1} width="field">
        <FieldLabel className={labelClass} label={t("frequency")} />
        <input type="hidden" {...form.register("frequency")} />
        <MenuSelect
          ariaLabel={t("frequency")}
          onChange={(value) => onFrequencyChange(value as TrackingDefaultsForm["frequency"])}
          options={frequencyMenuOptions}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={frequency}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">{t("frequencyHelp")}</p>
      </SettingsField>

      {showCron ? (
        <SettingsField width="field">
          <FieldLabel className={labelClass} htmlFor="tracking-cron" label={t("cronExpression")} />
          <Input
            aria-describedby="tracking-cron-help"
            className="mt-1.5 font-sans tabular-nums text-[12.5px]"
            id="tracking-cron"
            {...cronRegistration}
            onBlur={(event) => {
              void cronRegistration.onBlur(event);
              onCronBlur();
            }}
          />
          <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted" id="tracking-cron-help">
            {t("cronHelp")}
          </p>
          <CronRunPreview pending={previewPending} preview={preview} />
        </SettingsField>
      ) : null}

      <SettingsField className="scroll-mt-6" id="tracking-timezone" tabIndex={-1} width="field">
        <FieldLabel className={labelClass} label={t("timezone")} />
        <input type="hidden" {...form.register("timezone")} />
        <MenuSelect
          ariaDescribedBy={
            timezoneInvalid
              ? "tracking-timezone-help tracking-timezone-error"
              : "tracking-timezone-help"
          }
          ariaInvalid={timezoneInvalid}
          ariaLabel={t("timezone")}
          onChange={onTimezoneChange}
          options={timezoneSelectOptions(timezone)}
          searchable
          searchPlaceholder={t("searchTimezones")}
          triggerClassName={`${triggerClass} mt-1.5`}
          value={timezone}
        />
        <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted" id="tracking-timezone-help">
          {t("timezoneHelp")}
        </p>
        {timezoneInvalid ? (
          <p
            className="m-0 mt-1 text-[11.5px] text-red-text"
            id="tracking-timezone-error"
            role="alert"
          >
            {t("timezoneInvalid")}
          </p>
        ) : null}
      </SettingsField>

      <input type="hidden" {...form.register("jitterMinutes", { valueAsNumber: true })} />
    </div>
  );
}
