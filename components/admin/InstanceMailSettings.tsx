"use client";

import { InstanceMailSettingsField as Field } from "@/components/admin/InstanceMailSettingsField";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  clearInstanceMailSettings,
  type InstanceMailSettingsResult,
  saveInstanceMailSettings,
} from "@/lib/actions/instance-mail-settings";
import type { InstanceMailSettingsView } from "@/lib/email/instance-mail-runtime";
import {
  type InstanceMailFormValues,
  instanceMailFormSchema,
} from "@/lib/email/instance-mail-schema";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useWatch } from "react-hook-form";

const emptySecrets = {
  replaceCredentials: false,
  resendApiKey: "",
  sesAccessKeyId: "",
  sesRegion: "",
  sesSecretAccessKey: "",
  smtpHost: "",
  smtpPassword: "",
  smtpPort: "587",
  smtpUsername: "",
} as const;

function resultMessage(
  status: InstanceMailSettingsResult["status"],
  t: ReturnType<typeof useTranslations<"instanceAdmin.administration.mailer.form">>,
) {
  if (status === "saved") return { text: t("saved"), tone: "text-green-text" };
  if (status === "cleared") return { text: t("cleared"), tone: "text-green-text" };
  if (status === "forbidden") return { text: t("forbidden"), tone: "text-red-text" };
  if (status === "rate_limited") return { text: t("rateLimited"), tone: "text-red-text" };
  if (status === "two_factor_required")
    return { text: t("twoFactorRequired"), tone: "text-red-text" };
  if (status === "unavailable") return { text: t("unavailable"), tone: "text-red-text" };
  return { text: t("invalid"), tone: "text-red-text" };
}

export function InstanceMailSettings({
  settings,
  onSaveSettings,
  onClearSettings,
  busy = false,
}: Readonly<{
  settings: InstanceMailSettingsView;
  busy?: boolean;
  onSaveSettings?: (
    values: InstanceMailFormValues,
  ) => InstanceMailSettingsResult | undefined | Promise<InstanceMailSettingsResult | undefined>;
  onClearSettings?: () =>
    | InstanceMailSettingsResult
    | undefined
    | Promise<InstanceMailSettingsResult | undefined>;
}>) {
  const t = useTranslations("instanceAdmin.administration.mailer.form");
  const router = useRouter();
  const [replacing, setReplacing] = useState(false);
  const [result, setResult] = useState<InstanceMailSettingsResult | null>(null);
  const [saving, startSave] = useTransition();
  const [clearing, startClear] = useTransition();
  const credentialsRequired = replacing || !settings.credentialsConfigured;
  const schema = instanceMailFormSchema({
    credentialsRequired,
    messages: {
      port: t("validationPort"),
      required: t("validationRequired"),
      sender: t("validationSender"),
      sesPair: t("validationSesPair"),
    },
    senderRequired: settings.sender.length === 0,
  });
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useZodForm<InstanceMailFormValues>(schema, {
    defaultValues: {
      provider: settings.provider ?? "resend",
      sender: settings.sender,
      ...emptySecrets,
    },
  });
  const provider = useWatch({ control, name: "provider" });
  function onSave(values: InstanceMailFormValues) {
    setResult(null);
    startSave(async () => {
      const payload = { ...values, replaceCredentials: credentialsRequired };
      const next = await Promise.resolve()
        .then(() => (onSaveSettings ? onSaveSettings(payload) : saveInstanceMailSettings(payload)))
        .catch((): InstanceMailSettingsResult => ({ status: "unavailable" }));
      if (!next) return;
      setResult(next);
      if (next.status !== "saved") return;
      reset({
        ...values,
        ...emptySecrets,
        provider: values.provider,
        sender: values.sender || settings.sender,
      });
      setReplacing(false);
      router.refresh();
    });
  }

  function onClear() {
    setResult(null);
    startClear(async () => {
      const next = await Promise.resolve()
        .then(() => (onClearSettings ? onClearSettings() : clearInstanceMailSettings()))
        .catch((): InstanceMailSettingsResult => ({ status: "unavailable" }));
      if (!next) return;
      setResult(next);
      if (next.status !== "cleared") return;
      reset({ ...emptySecrets, provider: "resend", sender: "" });
      setReplacing(false);
      router.refresh();
    });
  }

  const notice = result ? resultMessage(result.status, t) : null;

  return (
    <Card
      data-testid="oss-mail-settings"
      component="section"
      size="lg"
      aria-labelledby="admin-mail-settings-heading"
    >
      <SectionTitle id="admin-mail-settings-heading">{t("title")}</SectionTitle>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t("description")}</p>
      {settings.envOverridesSaved ? (
        <p className="mt-2 text-xs text-yellow-text">{t("envOverride")}</p>
      ) : null}
      <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit(onSave)}>
        <div className="grid max-w-md gap-1.5">
          <FieldLabel className="text-sm font-medium text-fg" label={t("provider")} />
          <Controller
            control={control}
            name="provider"
            render={({ field }) => (
              <MenuSelect
                size="input"
                ariaLabel={t("provider")}
                onChange={(value) => {
                  field.onChange(value);
                  if (settings.credentialsConfigured && value !== settings.provider) {
                    setReplacing(true);
                  }
                }}
                options={[
                  { label: t("providerResend"), value: "resend" },
                  { label: t("providerSes"), value: "ses" },
                  { label: t("providerSmtp"), value: "smtp" },
                ]}
                value={field.value}
              />
            )}
          />
        </div>
        <Field
          error={errors.sender?.message}
          id="instance-mail-sender"
          label={t("sender")}
          registration={register("sender")}
        />
        <p className="-mt-2 text-[11px] text-fg-muted">{t("senderHint")}</p>
        {settings.credentialsConfigured && !credentialsRequired ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-fg-muted">{t("credentialsSaved")}</p>
            <Button onClick={() => setReplacing(true)} size="sm" type="button" variant="secondary">
              {t("replace")}
            </Button>
          </div>
        ) : null}
        {credentialsRequired && provider === "resend" ? (
          <Field
            error={errors.resendApiKey?.message}
            id="instance-mail-resend-key"
            label={t("resendApiKey")}
            registration={register("resendApiKey")}
            type="password"
          />
        ) : null}
        {credentialsRequired && provider === "ses" ? (
          <>
            <Field
              error={errors.sesRegion?.message}
              id="instance-mail-ses-region"
              label={t("sesRegion")}
              registration={register("sesRegion")}
            />
            <Field
              error={errors.sesAccessKeyId?.message}
              id="instance-mail-ses-key"
              label={t("sesAccessKeyId")}
              registration={register("sesAccessKeyId")}
            />
            <Field
              error={errors.sesSecretAccessKey?.message}
              id="instance-mail-ses-secret"
              label={t("sesSecretAccessKey")}
              registration={register("sesSecretAccessKey")}
              type="password"
            />
            <p className="-mt-1 text-[11px] text-fg-muted">{t("sesKeysHint")}</p>
          </>
        ) : null}
        {credentialsRequired && provider === "smtp" ? (
          <>
            <Field
              error={errors.smtpHost?.message}
              id="instance-mail-smtp-host"
              label={t("smtpHost")}
              registration={register("smtpHost")}
            />
            <Field
              error={errors.smtpPort?.message}
              id="instance-mail-smtp-port"
              label={t("smtpPort")}
              registration={register("smtpPort")}
            />
            <Field
              error={errors.smtpUsername?.message}
              id="instance-mail-smtp-user"
              label={t("smtpUsername")}
              registration={register("smtpUsername")}
            />
            <Field
              error={errors.smtpPassword?.message}
              id="instance-mail-smtp-password"
              label={t("smtpPassword")}
              registration={register("smtpPassword")}
              type="password"
            />
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || clearing}
            loading={saving}
            size="sm"
            type="submit"
            variant="primary"
          >
            {saving ? t("saving") : t("save")}
          </Button>
          {settings.credentialsConfigured || settings.sender ? (
            <Button
              disabled={busy || saving}
              loading={clearing}
              onClick={onClear}
              size="sm"
              type="button"
              variant="secondary"
            >
              {clearing ? t("clearing") : t("clear")}
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p className={`text-xs ${notice.tone}`} role="status">
            {notice.text}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
