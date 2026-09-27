"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, type UseFormRegisterReturn, useForm, useWatch } from "react-hook-form";

const fieldClassName =
  "mt-1.5 flex h-10 w-full max-w-md items-center rounded-control border border-border-control bg-transparent px-3 focus-within:border-accent";
const inputClassName = "w-full bg-transparent text-sm text-fg outline-none";

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

function Field({
  error,
  id,
  label,
  registration,
  type = "text",
}: {
  error?: string;
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.4px] text-fg-muted" htmlFor={id}>
        {label}
      </label>
      <span className={fieldClassName}>
        <input
          autoComplete="off"
          className={inputClassName}
          id={id}
          type={type}
          {...registration}
          aria-invalid={error ? true : undefined}
        />
      </span>
      {error ? <p className="mt-1 text-xs text-red-text">{error}</p> : null}
    </div>
  );
}

function resultMessage(
  status: InstanceMailSettingsResult["status"],
  t: ReturnType<typeof useTranslations<"instanceAdmin.administration.mailer.form">>,
) {
  if (status === "saved") return { text: t("saved"), tone: "text-green-text" };
  if (status === "cleared") return { text: t("cleared"), tone: "text-green-text" };
  if (status === "forbidden") return { text: t("forbidden"), tone: "text-red-text" };
  if (status === "rate_limited") return { text: t("rateLimited"), tone: "text-red-text" };
  if (status === "step_up_failed") return { text: t("stepUpFailed"), tone: "text-red-text" };
  if (status === "unavailable") return { text: t("unavailable"), tone: "text-red-text" };
  return { text: t("invalid"), tone: "text-red-text" };
}

export function InstanceMailSettings({
  settings,
}: Readonly<{ settings: InstanceMailSettingsView }>) {
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
      code: t("validationCode"),
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
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<InstanceMailFormValues>({
    defaultValues: {
      code: "",
      provider: settings.provider ?? "resend",
      sender: settings.sender,
      ...emptySecrets,
    },
    resolver: zodResolver(schema),
  });
  const provider = useWatch({ control, name: "provider" });
  function onSave(values: InstanceMailFormValues) {
    setResult(null);
    startSave(async () => {
      const next = await saveInstanceMailSettings({
        ...values,
        replaceCredentials: credentialsRequired,
      });
      setResult(next);
      if (next.status !== "saved") return;
      reset({
        ...values,
        ...emptySecrets,
        code: "",
        provider: values.provider,
        sender: values.sender || settings.sender,
      });
      setReplacing(false);
      router.refresh();
    });
  }

  function onClear() {
    const code = getValues("code");
    if (!/^\d{6}$/.test(code)) {
      setError("code", { message: t("validationCode") });
      return;
    }
    setResult(null);
    startClear(async () => {
      const next = await clearInstanceMailSettings({ code });
      setResult(next);
      if (next.status !== "cleared") return;
      reset({ ...emptySecrets, code: "", provider: "resend", sender: "" });
      setReplacing(false);
      router.refresh();
    });
  }

  const notice = result ? resultMessage(result.status, t) : null;

  return (
    <Card component="section" size="lg" aria-labelledby="admin-mail-settings-heading">
      <SectionTitle id="admin-mail-settings-heading">{t("title")}</SectionTitle>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t("description")}</p>
      {settings.envOverridesSaved ? (
        <p className="mt-2 text-xs text-yellow-text">{t("envOverride")}</p>
      ) : null}
      <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit(onSave)}>
        <Controller
          control={control}
          name="provider"
          render={({ field }) => (
            <MenuSelect
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
        <Field
          error={errors.code?.message}
          id="instance-mail-code"
          label={t("code")}
          registration={register("code")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={saving} size="sm" type="submit" variant="primary">
            {saving ? t("saving") : t("save")}
          </Button>
          {settings.credentialsConfigured || settings.sender ? (
            <Button
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
