"use client";

import { notificationCardGeometryClassNames } from "@/components/settings/notifications/notification-card-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { FieldLabel, Switch } from "@/components/ui";
import { updateNotificationPreferences } from "@/lib/actions/notification-prefs";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Control, Controller, useForm } from "react-hook-form";
import { z } from "zod";

const notificationPreferencesSchema = z.object({
  alertEmail: z.boolean(),
  alertInApp: z.boolean(),
  alertSlack: z.boolean(),
  alertWebhook: z.boolean(),
  checkEmail: z.boolean(),
  checkInApp: z.boolean(),
  importEmail: z.boolean(),
  importInApp: z.boolean(),
  inviteEmail: z.boolean(),
  inviteInApp: z.boolean(),
  projectId: z.string().trim().min(1).max(120),
  reportEmail: z.boolean(),
});

type NotificationPreferencesForm = z.infer<typeof notificationPreferencesSchema>;
type PreferenceField = Exclude<keyof NotificationPreferencesForm, "projectId">;
type ChannelKey = "email" | "inApp";

type NotificationRow = {
  email: PreferenceField;
  inApp?: PreferenceField;
  label: string;
};

const rows: readonly NotificationRow[] = [
  { email: "alertEmail", inApp: "alertInApp", label: "Alert fired" },
  { email: "checkEmail", inApp: "checkInApp", label: "Check complete" },
  { email: "importEmail", inApp: "importInApp", label: "Import finished" },
  { email: "inviteEmail", inApp: "inviteInApp", label: "Invite" },
  { email: "reportEmail", label: "Weekly report" },
] satisfies readonly NotificationRow[];

const channels = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
] as const;

function formDefaults(preferences: NotificationPreferencesView): NotificationPreferencesForm {
  return {
    alertEmail: preferences.alertEmail,
    alertInApp: preferences.alertInApp,
    alertSlack: preferences.alertSlack,
    alertWebhook: preferences.alertWebhook,
    checkEmail: preferences.checkEmail,
    checkInApp: preferences.checkInApp,
    importEmail: preferences.importEmail,
    importInApp: preferences.importInApp,
    inviteEmail: preferences.inviteEmail,
    inviteInApp: preferences.inviteInApp,
    projectId: preferences.projectId,
    reportEmail: preferences.reportEmail,
  };
}

function UnavailableMark({ label }: Readonly<{ label: string }>) {
  return (
    <span
      aria-label={`${label} is not available`}
      className="font-mono text-[16px] leading-none text-fg-muted"
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
  const form = useForm<NotificationPreferencesForm>({
    defaultValues: formDefaults(preferences),
    mode: "onChange",
    resolver: zodResolver(notificationPreferencesSchema),
  });
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const controlsDisabled = !canEdit || readOnly;

  async function savePreferences(previousValues: NotificationPreferencesForm) {
    if (controlsDisabled) return;

    setErrorMessage(null);
    try {
      await form.handleSubmit(async (values) => {
        const updated = await updateNotificationPreferences(values);
        form.reset({ ...values, ...updated });
        router.refresh();
      })();
    } catch (error: unknown) {
      form.reset(previousValues);
      setErrorMessage(actionErrorMessage(error, "Preferences could not be saved."));
    }
  }

  function changePreference(change: () => void) {
    if (controlsDisabled) return;

    const previousValues = form.getValues();
    change();
    void savePreferences(previousValues);
  }

  return (
    <div data-notification-card-frame="channels">
      <SettingsCard
        className={notificationCardGeometryClassNames.channels}
        description="Where an alert goes once it is raised. Alert conditions are configured on the Alerts screen."
        showSave={false}
        title="Channels"
      >
        <form id="notification-preferences-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="contents" disabled={controlsDisabled}>
            <input type="hidden" {...form.register("projectId")} />
            <input type="hidden" {...form.register("alertSlack")} />
            <input type="hidden" {...form.register("alertWebhook")} />
            <SettingsField width="full">
              <FieldLabel
                className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
                label="Events & channels"
              />
              <div className="mt-2 overflow-x-auto">
                <div className="min-w-[420px] overflow-hidden rounded-lg border border-border-strong">
                  <div className="grid grid-cols-[minmax(150px,1.6fr)_repeat(2,minmax(82px,1fr))] bg-bg-sunken text-center font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
                    <div className="px-3 py-2 text-left">Event</div>
                    {channels.map((channel) => (
                      <div className="px-2 py-2" key={channel.key}>
                        <span className="inline-flex items-center justify-center whitespace-nowrap">
                          {channel.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {rows.map((row) => (
                    <div
                      className="grid min-h-11 grid-cols-[minmax(150px,1.6fr)_repeat(2,minmax(82px,1fr))] items-center border-t border-border-strong text-[13px]"
                      key={row.label}
                    >
                      <div className="px-3 font-semibold text-fg">{row.label}</div>
                      {channels.map((channel) => {
                        const name = row[channel.key as ChannelKey];
                        const label = `${row.label} ${channel.label}`;
                        return (
                          <div className="flex justify-center px-2" key={channel.key}>
                            <DeliveryToggle
                              control={form.control}
                              disabled={controlsDisabled}
                              label={label}
                              name={name}
                              onValueChange={changePreference}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p className="m-0 mt-2 text-[11.5px] leading-5 text-fg-muted">
                A dash means the channel does not exist for that event – the weekly report is an
                email and is only ever sent once a week.
              </p>
            </SettingsField>
            {errorMessage ? (
              <p aria-live="polite" className={cn("m-0 mt-3 text-[11.5px] text-red-text")}>
                {errorMessage}
              </p>
            ) : null}
          </fieldset>
        </form>
      </SettingsCard>
    </div>
  );
}
