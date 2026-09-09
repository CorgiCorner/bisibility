"use client";

import type {
  ConnectFormValues,
  Notice,
  PendingAction,
} from "@/components/integrations/ConnectDrawerSchema";
import { providerCredentialFields } from "@/components/integrations/provider-auth";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { COST_ESTIMATE_PER_CHECK_LABEL } from "@/lib/integrations/settings-copy";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import type { FieldErrors, UseFormReturn } from "react-hook-form";

type FormProps = {
  form: UseFormReturn<ConnectFormValues>;
  provider: IntegrationProviderData;
};

const labelClass = "flex flex-col gap-[7px] text-[10px] uppercase tracking-[0.5px] text-fg-muted";

const inputClass = `${inputClassName} rounded-control px-[13px] py-[11px] text-[13px] font-medium`;

function FieldError({ error }: { error?: unknown }) {
  let message: string | null = null;
  if (error instanceof Error) message = error.message;
  if (typeof error === "string") message = error;
  return error ? (
    <span className="text-[10px] normal-case tracking-normal text-red-text">
      {message ?? "Invalid value"}
    </span>
  ) : null;
}

export function CredentialFields({
  errors,
  form,
  provider,
}: FormProps & { errors: FieldErrors<ConnectFormValues> }) {
  return (
    <div className="grid gap-3">
      {providerCredentialFields(provider).map((field) => {
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
  provider,
}: FormProps & {
  busy: boolean;
  errors: FieldErrors<ConnectFormValues>;
  pendingAction: PendingAction | null;
}) {
  return (
    <label className={labelClass}>
      {COST_ESTIMATE_PER_CHECK_LABEL}
      <input
        className={inputClass}
        disabled={busy || pendingAction === "cost"}
        min={0}
        step={0.0001}
        type="number"
        {...form.register("costPerCheck", { valueAsNumber: true })}
      />
      <span className="text-[10px] normal-case tracking-normal text-fg-muted">
        {errors.costPerCheck?.message
          ? String(errors.costPerCheck.message)
          : provider.drawer.costHelp}
      </span>
    </label>
  );
}

export function ActivityList({ provider }: Readonly<Pick<FormProps, "provider">>) {
  return (
    <section className="overflow-hidden rounded-control border border-border">
      <div className="bg-bg-sunken px-3.5 py-[11px] text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Recent activity
      </div>
      {provider.drawer.activities.map((row) => (
        <div
          className="flex items-center justify-between gap-3 border-border border-t px-3.5 py-[11px] text-[11px]"
          key={row.label}
        >
          <span className="text-fg-muted">{row.label}</span>
          <span className="text-right text-fg">{row.value}</span>
        </div>
      ))}
    </section>
  );
}

export function ActionNotice({ notice }: Readonly<{ notice: Notice }>) {
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
          Refresh app
        </Button>
      ) : null}
      {typeof notice.balance === "number" ? (
        <span className="mt-2 block text-[10px] tabular-nums text-fg">
          Balance: ${notice.balance.toFixed(4)}
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
