import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import type { MeasurementChoices, MeasurementTranslator, ScheduleDraft } from "./contracts";

export function MeasurementScheduleFields({
  id,
  schedule,
  choices,
  disabled,
  translate: t,
  onChange,
  errorId,
  errorFields,
}: {
  id: string;
  schedule: ScheduleDraft;
  choices: MeasurementChoices;
  disabled: boolean;
  translate: MeasurementTranslator;
  onChange: (schedule: ScheduleDraft) => void;
  errorId?: string;
  errorFields: readonly string[];
}) {
  const change = (patch: Partial<ScheduleDraft>) => onChange({ ...schedule, ...patch });
  return (
    <section className="mt-5" aria-label={t("scheduleDraft")}>
      <h2 className="font-semibold">{t("scheduleDraft")}</h2>
      <p className="mt-2 text-sm text-fg-muted">{t("scheduleHelp")}</p>
      <div className="mt-3">
        <Checkbox
          checked={schedule.enabled}
          disabled={disabled}
          label={t("fields.enabled")}
          onChange={(event) => change({ enabled: event.currentTarget.checked })}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MenuSelect
          ariaLabel={t("fields.frequency")}
          leadingLabel={t("fields.frequency")}
          ariaInvalid={errorFields.includes("frequency")}
          ariaDescribedBy={errorFields.includes("frequency") ? errorId : undefined}
          disabled={disabled}
          value={schedule.frequency}
          options={choices.cadences.map((frequency) => ({
            value: frequency,
            label: t(`cadences.${frequency}`),
          }))}
          onChange={(frequency) => {
            const next = choices.cadences.find((value) => value === frequency);
            if (next) change({ frequency: next });
          }}
        />
        <MenuSelect
          ariaLabel={t("fields.timezone")}
          leadingLabel={t("fields.timezone")}
          ariaInvalid={errorFields.includes("timezone")}
          ariaDescribedBy={errorFields.includes("timezone") ? errorId : undefined}
          disabled={disabled}
          value={schedule.timezone}
          options={[...new Set([schedule.timezone, ...choices.timezones])].map((value) => ({
            value,
            label: value,
            disabled: !choices.timezones.includes(value),
          }))}
          onChange={(timezone) => {
            if (choices.timezones.includes(timezone)) change({ timezone });
          }}
        />
        <div>
          <label htmlFor={`${id}-time`} className="mb-1 block text-sm font-medium">
            {t("fields.timeOfDay")}
          </label>
          <Input
            id={`${id}-time`}
            aria-invalid={errorFields.includes("timeOfDay")}
            aria-describedby={errorFields.includes("timeOfDay") ? errorId : undefined}
            disabled={disabled}
            value={schedule.timeOfDay ?? ""}
            inputMode="numeric"
            onChange={(event) => change({ timeOfDay: event.currentTarget.value || null })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-jitter`} className="mb-1 block text-sm font-medium">
            {t("fields.jitter")}
          </label>
          <Input
            id={`${id}-jitter`}
            aria-invalid={errorFields.includes("jitterMinutes")}
            aria-describedby={errorFields.includes("jitterMinutes") ? errorId : undefined}
            disabled={disabled}
            value={String(schedule.jitterMinutes)}
            type="number"
            min={0}
            max={120}
            step={1}
            onChange={(event) =>
              change({
                jitterMinutes:
                  event.currentTarget.value === "" ? Number.NaN : Number(event.currentTarget.value),
              })
            }
          />
        </div>
        {schedule.frequency === "weekly" ? (
          <MenuSelect
            ariaLabel={t("fields.weekday")}
            leadingLabel={t("fields.weekday")}
            ariaInvalid={errorFields.includes("weekday")}
            ariaDescribedBy={errorFields.includes("weekday") ? errorId : undefined}
            disabled={disabled}
            value={schedule.weekday ?? ""}
            options={[
              { value: "", label: t("existingCalendar"), disabled: true },
              ...weekdays.map((value) => ({ value, label: t(`weekdays.${value}`) })),
            ]}
            onChange={(weekday) => {
              const next = weekdays.find((value) => value === weekday);
              if (next) change({ weekday: next });
            }}
          />
        ) : null}
        {schedule.frequency === "monthly" ? (
          <MenuSelect
            ariaLabel={t("fields.dayOfMonth")}
            leadingLabel={t("fields.dayOfMonth")}
            ariaInvalid={errorFields.includes("dayOfMonth")}
            ariaDescribedBy={errorFields.includes("dayOfMonth") ? errorId : undefined}
            disabled={disabled}
            value={schedule.dayOfMonth ?? ""}
            options={[
              { value: "", label: t("existingCalendar"), disabled: true },
              ...monthDays.map((value, index) => ({ value, label: String(index + 1) })),
            ]}
            onChange={(dayOfMonth) => {
              if (monthDays.includes(dayOfMonth)) change({ dayOfMonth });
            }}
          />
        ) : null}
        {schedule.frequency === "custom_cron" ? (
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-cron`} className="mb-1 block text-sm font-medium">
              {t("fields.cron")}
            </label>
            <Input
              id={`${id}-cron`}
              aria-invalid={errorFields.includes("cronExpression")}
              aria-describedby={errorFields.includes("cronExpression") ? errorId : undefined}
              disabled={disabled}
              value={schedule.cronExpression}
              onChange={(event) => change({ cronExpression: event.currentTarget.value })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
