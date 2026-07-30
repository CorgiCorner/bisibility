"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, Checkbox } from "@/components/ui";
import { updateNotificationPreferences } from "@/lib/actions/notification-prefs";
import { PLANNED_ALERT_CHANNEL_LABEL } from "@/lib/alerts/channel-availability";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import Tooltip from "@mui/material/Tooltip";
import {
  CheckCircleIcon as CheckCircle,
  LockSimpleIcon as LockSimple,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Control, Controller, useForm } from "react-hook-form";
import { z } from "zod";

const notificationPreferenceSchema = z.object({
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

type NotificationPreferencesForm = z.infer<typeof notificationPreferenceSchema>;
type PreferenceField = Exclude<keyof NotificationPreferencesForm, "projectId">;

export type NotificationPreferencesProps = {
  canEdit: boolean;
  preferences: NotificationPreferencesView;
};

const rows = [
  {
    email: "alertEmail",
    inApp: "alertInApp",
    label: "Alerts",
    slack: "alertSlack",
    webhook: "alertWebhook",
  },
  { email: "checkEmail", inApp: "checkInApp", label: "Rank checks" },
  { email: "inviteEmail", inApp: "inviteInApp", label: "Team invites" },
  { email: "importEmail", inApp: "importInApp", label: "Imports" },
  { email: "reportEmail", label: "Weekly report" },
] satisfies {
  email: PreferenceField;
  inApp?: PreferenceField;
  label: string;
  slack?: PreferenceField;
  webhook?: PreferenceField;
}[];

const channels = [
  { key: "inApp", label: "In-app", planned: false },
  { key: "email", label: "Email", planned: false },
  { key: "slack", label: "Slack", planned: true },
  { key: "webhook", label: "Webhook", planned: true },
] as const;

const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

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

function channelAvailable(
  channel: (typeof channels)[number]["key"],
  preferences: NotificationPreferencesView,
) {
  if (channel === "slack") {
    return preferences.slackAvailable;
  }
  if (channel === "webhook") {
    return preferences.webhookAvailable;
  }
  return true;
}

function Toggle({
  control,
  disabled,
  label,
  name,
}: Readonly<{
  control: Control<NotificationPreferencesForm>;
  disabled: boolean;
  label: string;
  name?: PreferenceField;
}>) {
  if (!name) {
    return (
      <span className="flex justify-center">
        <Checkbox
          aria-label={label}
          checked={false}
          controlClassName="mt-0 size-5"
          disabled
          readOnly
        />
      </span>
    );
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <span className="flex justify-center">
          <Checkbox
            aria-label={label}
            checked={Boolean(field.value)}
            controlClassName="mt-0 size-5"
            disabled={disabled}
            name={field.name}
            onBlur={field.onBlur}
            onChange={(event) => field.onChange(event.target.checked)}
            ref={field.ref}
          />
        </span>
      )}
    />
  );
}

export function NotificationPreferences({
  canEdit,
  preferences,
}: Readonly<NotificationPreferencesProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const { readOnly } = useProjectWriteMode();
  const form = useForm<NotificationPreferencesForm>({
    defaultValues: formDefaults(preferences),
    mode: "onChange",
    resolver: zodResolver(notificationPreferenceSchema),
  });

  function onSubmit(values: NotificationPreferencesForm) {
    if (!canEdit || readOnly) {
      return;
    }
    setMessage(null);
    startTransition(() => {
      void updateNotificationPreferences(values)
        .then((updated) => {
          form.reset(updated);
          setMessage("Notification preferences saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Preferences could not be saved.")),
        );
    });
  }

  return (
    <SettingsSection
      action={
        <ProjectReadOnlyTooltip>
          <Button
            disabled={!canEdit || readOnly || !form.formState.isDirty}
            form="notification-preferences-form"
            loading={isPending}
            loadingLabel="Saving"
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </ProjectReadOnlyTooltip>
      }
      description="Choose how this project sends account, rank check, import and alert updates."
      title="Notifications & reports"
    >
      <form id="notification-preferences-form" onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset className="flex flex-col gap-4" disabled={!canEdit}>
          <input type="hidden" {...form.register("projectId")} />
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="font-mono text-fg">{preferences.email}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                preferences.emailVerification === "verified"
                  ? "bg-green/10 text-green"
                  : "bg-yellow/10 text-yellow",
              )}
            >
              {preferences.emailVerification === "verified" ? (
                <CheckCircle size={12} weight="fill" />
              ) : (
                <WarningCircle size={12} weight="fill" />
              )}
              {preferences.emailVerification === "verified" ? "Verified" : "Unverified"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[620px] overflow-hidden rounded-lg border border-border-strong">
              <div className="grid grid-cols-[1.5fr_repeat(4,minmax(86px,1fr))] bg-bg-sunken text-center font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
                <div className="px-3 py-2 text-left">Event</div>
                {channels.map((channel) => (
                  <div className="px-3 py-2" key={channel.key}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {channel.label}
                      {channel.planned ? (
                        <Tooltip title={PLANNED_ALERT_CHANNEL_LABEL}>
                          <span
                            aria-label={`${channel.label} ${PLANNED_ALERT_CHANNEL_LABEL}`}
                            className="inline-flex text-fg-faint"
                          >
                            <LockSimple aria-hidden size={12} weight="bold" />
                          </span>
                        </Tooltip>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
              {rows.map((row) => (
                <div
                  className="grid min-h-[52px] grid-cols-[1.5fr_repeat(4,minmax(86px,1fr))] items-center border-t border-border-strong text-[13px]"
                  key={row.label}
                >
                  <div className="px-3 font-semibold text-fg">{row.label}</div>
                  {channels.map((channel) => {
                    const name = row[channel.key];
                    const planned = Boolean(channel.planned);
                    return (
                      <Toggle
                        control={form.control}
                        disabled={planned || !channelAvailable(channel.key, preferences)}
                        key={channel.key}
                        label={`${row.label} ${channel.label}`}
                        name={name}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {message ? <span className={cn(feedbackClass, "text-fg-muted")}>{message}</span> : null}
        </fieldset>
      </form>
    </SettingsSection>
  );
}
