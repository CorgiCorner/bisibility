"use client";

import type {
  ConnectFormValues,
  Notice,
  PendingAction,
} from "@/components/integrations/ConnectDrawerSchema";
import { providerCredentialFields } from "@/components/integrations/provider-auth";
import { useProviderMetaCopy } from "@/components/integrations/provider-meta-copy";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";
import type { FieldErrors, UseFormReturn } from "react-hook-form";

type FormProps = {
  form: UseFormReturn<ConnectFormValues>;
  provider: IntegrationProviderData;
};

const labelClass = "flex flex-col gap-[7px] text-[10px] uppercase tracking-[0.5px] text-fg-muted";

const inputClass = `${inputClassName} rounded-control px-[13px] py-[11px] text-[13px] font-medium`;

function localizedCredentialField(
  providerId: string,
  field: ReturnType<typeof providerCredentialFields>[number],
  t: ReturnType<typeof useTranslations>,
) {
  const key = `${providerId}:${field.name}`;
  const copy = {
    "dataforseo:login": { label: t("credentialApiLogin") },
    "dataforseo:secret": {
      description:
        field.placeholder === "••••••••"
          ? t("credentialSavedSecret")
          : t("credentialApiPasswordHelp"),
      label: t("credentialApiPassword"),
    },
    "plausible:endpoint": {
      description: t("credentialApiBaseUrlHelp"),
      label: t("credentialApiBaseUrl"),
      placeholder: t("credentialApiBaseUrlPlaceholder"),
    },
    "plausible:login": { label: t("credentialSiteDomain") },
    "plausible:secret": {
      label: t("credentialApiToken"),
      placeholder: t("credentialApiTokenPlaceholder"),
    },
    "serpapi:secret": {
      label: t("credentialApiKey"),
      placeholder: t("credentialApiKeyPlaceholder"),
    },
  }[key];

  if (copy) return { ...field, ...copy };
  return field.name === "login"
    ? { ...field, label: t("credentialClientId"), placeholder: t("credentialClientIdPlaceholder") }
    : {
        ...field,
        label: t("credentialClientSecret"),
        placeholder: t("credentialClientSecretPlaceholder"),
      };
}

function FieldError({ error }: { error?: unknown }) {
  const t = useTranslations("projectIntegrations.drawer");
  let message: string | null = null;
  if (error instanceof Error) message = error.message;
  if (typeof error === "string") message = error;
  return error ? (
    <span className="text-[10px] normal-case tracking-normal text-red-text">
      {message ?? t("invalidValue")}
    </span>
  ) : null;
}

export function CredentialFields({
  errors,
  form,
  provider,
}: FormProps & { errors: FieldErrors<ConnectFormValues> }) {
  const t = useTranslations("projectIntegrations.drawer");
  return (
    <div className="grid gap-3">
      {providerCredentialFields(provider).map((rawField) => {
        const field = localizedCredentialField(provider.id, rawField, t);
        const error = errors[field.name]?.message;
        const inputId = `${provider.id}-${field.name}-credential`;

        return (
          <label className={labelClass} htmlFor={inputId} key={field.name}>
            <span id={`${inputId}-label`}>{field.label}</span>
            {field.type === "password" ? (
              <PasswordInput
                aria-describedby={field.description ? `${inputId}-description` : undefined}
                aria-labelledby={`${inputId}-label`}
                className={inputClass}
                id={inputId}
                placeholder={field.placeholder}
                {...form.register(field.name)}
              />
            ) : (
              <input
                aria-describedby={field.description ? `${inputId}-description` : undefined}
                aria-labelledby={`${inputId}-label`}
                autoComplete="off"
                className={inputClass}
                id={inputId}
                placeholder={field.placeholder}
                type={field.type ?? "text"}
                {...form.register(field.name)}
              />
            )}
            {field.description ? (
              <span
                className="font-sans text-[11.5px] normal-case leading-5 tracking-normal text-fg-muted"
                id={`${inputId}-description`}
              >
                {field.description}
              </span>
            ) : null}
            <FieldError error={error} />
          </label>
        );
      })}
    </div>
  );
}

export function CostField({
  busy,
  errors,
  form,
  pendingAction,
}: FormProps & {
  busy: boolean;
  errors: FieldErrors<ConnectFormValues>;
  pendingAction: PendingAction | null;
}) {
  const t = useTranslations("projectIntegrations.drawer");
  return (
    <label className={labelClass}>
      {t("costEstimate")}
      <input
        className={inputClass}
        disabled={busy || pendingAction === "cost"}
        min={0}
        step={0.0001}
        type="number"
        {...form.register("costPerCheck", { valueAsNumber: true })}
      />
      <span className="text-[10px] normal-case tracking-normal text-fg-muted">
        {errors.costPerCheck?.message ? String(errors.costPerCheck.message) : t("costHelp")}
      </span>
    </label>
  );
}

export function ActivityList({ provider }: Readonly<Pick<FormProps, "provider">>) {
  const t = useTranslations("projectIntegrations.drawer");
  const metaCopy = useProviderMetaCopy();
  return (
    <section className="overflow-hidden rounded-control border border-border">
      <div className="bg-bg-sunken px-3.5 py-[11px] text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("recentActivity")}
      </div>
      {provider.drawer.activities.map((row) => (
        <div
          className="flex items-center justify-between gap-3 border-border border-t px-3.5 py-[11px] text-[11px]"
          key={row.labelKey}
        >
          <span className="text-fg-muted">{metaCopy.label(row)}</span>
          <span className="text-right text-fg">{metaCopy.value(row)}</span>
        </div>
      ))}
    </section>
  );
}

export function ActionNotice({ notice }: Readonly<{ notice: Notice }>) {
  const t = useTranslations("projectIntegrations.drawer");
  let tone = notice.ok === false ? "var(--red)" : "var(--green)";
  if (notice.tone === "warning") tone = "var(--yellow)";

  return (
    <div
      className="rounded-control border border-border bg-transparent px-3 py-3"
      role={notice.ok === false ? "alert" : "status"}
    >
      <p className="m-0 text-[13px] font-semibold" style={{ color: tone }}>
        {notice.title}
      </p>
      <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">{notice.message}</p>
      {notice.action === "refresh" ? (
        <Button
          className="mt-3"
          onClick={() => window.location.reload()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("refresh")}
        </Button>
      ) : null}
      {typeof notice.balance === "number" ? (
        <span className="mt-2 block text-[10px] tabular-nums text-fg">
          {t("accountBalance", { balance: notice.balance })}
        </span>
      ) : null}
    </div>
  );
}

export function ConnectionOkBanner({ message }: Readonly<{ message: string }>) {
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-green bg-bg-sunken px-3.5 py-[11px] text-[12.5px] font-medium text-green-text [background:color-mix(in_srgb,var(--green)_8%,transparent)]">
      <CheckCircle aria-hidden size={16} weight="regular" />
      {message}
    </div>
  );
}
