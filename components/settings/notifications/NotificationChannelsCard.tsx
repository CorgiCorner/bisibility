"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { notificationCardGeometryClassNames } from "@/components/settings/notifications/notification-card-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Switch } from "@/components/ui/Switch";
import { updateNotificationPreferences } from "@/lib/actions/notification-prefs";
import { useZodForm } from "@/lib/forms/use-zod-form";
import {
  CHECK_NOTIFICATION_POSITION_MOVE,
  CHECK_NOTIFICATION_TOP_N,
} from "@/lib/notifications/preference-defaults";
import { notificationSettingsFormSchema } from "@/lib/notifications/preference-schema";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { classifyActionError } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type Control, Controller } from "react-hook-form";
import {
  CheckModeDescription,
  CheckModeSelect,
  CheckNotificationThresholds,
} from "./CheckNotificationControls";
import {
  formDefaults,
  type NotificationPreferencesForm,
  notificationPreferenceStamp,
} from "./notification-form-defaults";

type PreferenceField = Exclude<
  keyof NotificationPreferencesForm,
  | "projectId"
  | "checkNotificationSetting"
  | "checkNotificationTopN"
  | "checkNotificationPositionMove"
>;
type ChannelKey = "email" | "inApp";

type NotificationRow = {
  email?: PreferenceField;
  inApp?: PreferenceField;
  labelKey:
    | "alertFired"
    | "checkComplete"
    | "importFinished"
    | "invite"
    | "weeklyReport"
    | "providerIncident";
};

const rows: readonly NotificationRow[] = [
  { email: "alertEmail", inApp: "alertInApp", labelKey: "alertFired" },
  { labelKey: "checkComplete" },
  { inApp: "providerIncidentInApp", labelKey: "providerIncident" },
  { inApp: "importInApp", labelKey: "importFinished" },
  { inApp: "inviteInApp", labelKey: "invite" },
  { email: "reportEmail", labelKey: "weeklyReport" },
] satisfies readonly NotificationRow[];

const channels = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
] as const;

function UnavailableMark({ label }: Readonly<{ label: string }>) {
  const t = useTranslations("projectSettingsNotifications.channels");
  return (
    <span
      aria-label={t("unavailable", { label })}
      className="font-sans tabular-nums text-[16px] leading-none text-fg-muted"
      role="img"
    >
      –
    </span>
  );
}

function DeliveryToggle({
  control,
  disabled,
  label,
  name,
  onValueChange,
}: Readonly<{
  control: Control<NotificationPreferencesForm>;
  disabled: boolean;
  label: string;
  name?: PreferenceField;
  onValueChange: (change: () => void) => void;
}>) {
  if (!name) return <UnavailableMark label={label} />;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Switch
          aria-label={label}
          checked={Boolean(field.value)}
          className="border-0 bg-transparent p-0"
          disabled={disabled}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(event) => onValueChange(() => field.onChange(event.currentTarget.checked))}
          ref={field.ref}
        />
      )}
    />
  );
}

export type NotificationChannelsCardProps = {
  canEdit: boolean;
  preferences: NotificationPreferencesView;
};

export function NotificationChannelsCard({
  canEdit,
  preferences,
}: Readonly<NotificationChannelsCardProps>) {
  const defaults = formDefaults(preferences);
  const form = useZodForm<NotificationPreferencesForm>(notificationSettingsFormSchema, {
    defaultValues: defaults,
    mode: "onChange",
    values: defaults,
  });
  const savedValues = useRef(defaults);
  const preferenceStamp = notificationPreferenceStamp(defaults);
  const [appliedStamp, setAppliedStamp] = useState(preferenceStamp);
  // A lost response still refreshes these props. Adopt that saved state for the next edit.
  if (preferenceStamp !== appliedStamp) {
    savedValues.current = defaults;
    setAppliedStamp(preferenceStamp);
  }
  const router = useRouter();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsNotifications.channels");
  const { readOnly } = useProjectWriteMode();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const controlsDisabled = !canEdit || readOnly || form.formState.isSubmitting;

  async function savePreferences() {
    if (controlsDisabled) return;

    setErrorMessage(null);
    try {
      await form.handleSubmit(async (values) => {
        const patch = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) =>
              key === "projectId" ||
              value !== savedValues.current[key as keyof NotificationPreferencesForm],
          ),
        );
        const updated = await updateNotificationPreferences(patch);
        const current = notificationSettingsFormSchema.parse({ ...values, ...updated });
        savedValues.current = current;
        form.reset(current);
        if ("saveFailed" in updated && updated.saveFailed) setErrorMessage(t("saveError"));
        router.refresh();
      })();
    } catch (error: unknown) {
      form.reset(savedValues.current);
      router.refresh();
      const classified = classifyActionError(error);
      setErrorMessage(
        classified.kind === "staleDeployment"
          ? sharedErrors.staleDeployment()
          : classified.kind === "serverComponentDigest"
            ? sharedErrors.serverComponentDigest({ digest: classified.digest })
            : t("saveError"),
      );
    }
  }

  function changePreference(change: () => void) {
    if (controlsDisabled) return;

    change();
    if (form.getValues("checkNotificationSetting") === "none") {
      for (const name of ["checkNotificationTopN", "checkNotificationPositionMove"] as const) {
        if (!notificationSettingsFormSchema.shape[name].safeParse(form.getValues(name)).success) {
          form.setValue(
            name,
            form.formState.defaultValues?.[name] ??
              (name === "checkNotificationTopN"
                ? CHECK_NOTIFICATION_TOP_N.default
                : CHECK_NOTIFICATION_POSITION_MOVE.default),
          );
          form.clearErrors(name);
        }
      }
    }
    void savePreferences();
  }

  return (
    <div data-notification-card-frame="channels">
      <SettingsCard
        className={notificationCardGeometryClassNames.channels}
        description={t("description")}
        showSave={false}
        title={t("title")}
      >
        <form id="notification-preferences-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="contents" disabled={controlsDisabled}>
            <input type="hidden" {...form.register("projectId")} />
            <SettingsField width="full">
              <FieldLabel
                className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
                label={t("eventsAndChannels")}
              />
              <div className="mt-2">
                <div className="min-w-0 rounded-control border border-border">
                  <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))] bg-bg-sunken text-center font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
                    <div className="hidden px-3 py-2 text-left sm:block">{t("event")}</div>
                    {channels.map((channel) => (
                      <div className="px-2 py-2" key={channel.key}>
                        <span className="inline-flex items-center justify-center">
                          {t(channel.key)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {rows.map((row) => (
                    <div
                      className="grid min-h-11 grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))] items-center border-t border-border text-[13px]"
                      key={row.labelKey}
                      data-notification-row={row.labelKey}
                    >
                      <div className="col-span-2 min-w-0 px-3 py-2 font-semibold text-fg sm:col-span-1">
                        {t(row.labelKey)}
                        {row.labelKey === "checkComplete" ? (
                          <CheckModeDescription form={form} />
                        ) : null}
                      </div>
                      {channels.map((channel) => {
                        const name = row[channel.key as ChannelKey];
                        const label = `${t(row.labelKey)} ${t(channel.key)}`;
                        return (
                          <div className="flex min-w-0 justify-center px-2 py-2" key={channel.key}>
                            {row.labelKey === "checkComplete" && channel.key === "inApp" ? (
                              <CheckModeSelect
                                form={form}
                                disabled={controlsDisabled}
                                onChange={changePreference}
                              />
                            ) : (
                              <DeliveryToggle
                                control={form.control}
                                disabled={controlsDisabled}
                                label={label}
                                name={name}
                                onValueChange={changePreference}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p className="m-0 mt-2 text-[11.5px] leading-5 text-fg-muted">
                {t("unavailableHelp")}
              </p>
              <CheckNotificationThresholds
                form={form}
                disabled={controlsDisabled}
                onSave={() => void savePreferences()}
              />
            </SettingsField>
          </fieldset>
          {errorMessage ? (
            <p aria-live="polite" className={cn("m-0 mt-3 text-[11.5px] text-red-text")}>
              {errorMessage}
            </p>
          ) : null}
        </form>
      </SettingsCard>
    </div>
  );
}
