"use client";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { CHECK_NOTIFICATION_SETTINGS } from "@/lib/notifications/preference-defaults";
import type { notificationSettingsFormSchema } from "@/lib/notifications/preference-schema";
import { useTranslations } from "next-intl";
import { Controller, type UseFormReturn } from "react-hook-form";
import type { z } from "zod";

type Form = UseFormReturn<z.infer<typeof notificationSettingsFormSchema>>;
export function CheckModeSelect({
  form,
  disabled,
  onChange,
}: {
  form: Form;
  disabled: boolean;
  onChange: (change: () => void) => void;
}) {
  const t = useTranslations("projectSettingsNotifications.checks");
  return (
    <Controller
      control={form.control}
      name="checkNotificationSetting"
      render={({ field }) => (
        <MenuSelect
          ariaLabel={t("mode")}
          compact
          menuWidth={320}
          disabled={disabled}
          selectedContent={(option) => <span className="whitespace-normal">{option?.label}</span>}
          value={field.value ?? "important"}
          options={CHECK_NOTIFICATION_SETTINGS.map((value) => ({
            value,
            label: t(`modes.${value}`),
            ariaLabel: t(`modes.${value}`),
            secondary: t(`optionDescriptions.${value}`),
          }))}
          onChange={(value) => onChange(() => field.onChange(value))}
        />
      )}
    />
  );
}
export function CheckModeDescription({ form }: { form: Form }) {
  const t = useTranslations("projectSettingsNotifications.checks");
  const mode = form.watch("checkNotificationSetting") ?? "important";
  return (
    <p className="m-0 mt-1 text-xs font-normal leading-5 text-fg-muted">
      {t(`descriptions.${mode}`)}
    </p>
  );
}
export function CheckNotificationThresholds({
  form,
  disabled,
  onSave,
}: {
  form: Form;
  disabled: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("projectSettingsNotifications.checks");
  const mode = form.watch("checkNotificationSetting") ?? "important";
  return (
    <fieldset className="mt-3 space-y-2" aria-label={t("significantChange")}>
      <legend className="text-xs font-semibold">{t("significantChange")}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["checkNotificationTopN", "checkNotificationPositionMove"] as const).map((name) => {
          const error = form.formState.errors[name];
          return (
            <div key={name}>
              <FieldLabel htmlFor={name} label={t(name)} className="text-xs font-semibold" />
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id={name}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${name}-error` : undefined}
                  density="compact"
                  className="w-20"
                  type="text"
                  inputMode="numeric"
                  disabled={disabled || mode === "none"}
                  {...form.register(name, {
                    setValueAs: (value: string) =>
                      String(value).trim() === "" ? Number.NaN : Number(value),
                    onBlur: onSave,
                  })}
                />
                <span className="text-xs text-fg-muted">{t("positions")}</span>
              </div>
              {error ? (
                <p id={`${name}-error`} role="alert" className="m-0 mt-1 text-xs text-red-text">
                  {t("thresholdError")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
