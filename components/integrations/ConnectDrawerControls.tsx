"use client";

import type {
  ConnectFormValues,
  Notice,
  PendingAction,
} from "@/components/integrations/ConnectDrawerSchema";
import { providerCredentialFields } from "@/components/integrations/provider-auth";
import { Button, MonoText, PasswordInput } from "@/components/ui";
import { COST_ESTIMATE_PER_CHECK_LABEL } from "@/lib/integrations/settings-copy";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import {
  CheckCircleIcon as CheckCircle,
  TerminalWindowIcon as TerminalWindow,
} from "@phosphor-icons/react";
import type { FieldErrors, UseFormReturn } from "react-hook-form";

type FormProps = {
  form: UseFormReturn<ConnectFormValues>;
  provider: IntegrationProviderData;
};

const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";

const inputClass =
  "rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] py-[11px] font-mono text-[13px] font-medium text-fg outline-none placeholder:text-fg-faint focus-visible:border-accent";

function FieldError({ error }: { error?: unknown }) {
  let message: string | null = null;
  if (error instanceof Error) message = error.message;
  if (typeof error === "string") message = error;
  return error ? (
    <span className="font-mono text-[10px] normal-case tracking-normal text-red">
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
            {field.label}
            {field.type === "password" ? (
              <PasswordInput
                className={inputClass}
                id={inputId}
                placeholder={field.placeholder}
                {...form.register(field.name)}
              />
            ) : (
              <input
                autoComplete="off"
                className={inputClass}
                id={inputId}
                placeholder={field.placeholder}
                type={field.type ?? "text"}
                {...form.register(field.name)}
              />
            )}
            {field.description ? (
              <span className="font-sans text-[11.5px] normal-case leading-5 tracking-normal text-fg-faint">
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
      <span className="font-mono text-[10px] normal-case tracking-normal text-fg-faint">
        {errors.costPerCheck?.message
          ? String(errors.costPerCheck.message)
          : provider.drawer.costHelp}
      </span>
    </label>
  );
}

export function ActivityList({ provider }: Readonly<Pick<FormProps, "provider">>) {
  return (
    <section className="overflow-hidden rounded-[11px] border border-border">
      <MonoText
        className="bg-bg-sunken px-3.5 py-[11px] uppercase tracking-[0.5px]"
        muted
        size="sm"
      >
        Recent activity
      </MonoText>
      {provider.drawer.activities.map((row) => (
        <div
          className="flex items-center justify-between gap-3 border-border-soft border-t px-3.5 py-[11px] font-mono text-xs"
          key={row.label}
        >
          <span className="text-fg-muted">{row.label}</span>
          <span className="text-right text-fg">{row.value}</span>
        </div>
      ))}
    </section>
  );
}

export function EnvHint({ provider }: Readonly<Pick<FormProps, "provider">>) {
  if (!provider.drawer.envHint) return null;

  return (
    <div className="flex items-start gap-[9px] rounded-[11px] border border-border-strong border-dashed bg-bg-sunken px-3.5 py-3">
      <span className="flex h-5 shrink-0 items-center">
        <TerminalWindow aria-hidden className="text-accent" size={15} />
      </span>
      <p className="m-0 text-[12px] leading-5 text-fg-muted">{provider.drawer.envHint}</p>
    </div>
  );
}

export function ActionNotice({ notice }: Readonly<{ notice: Notice }>) {
  let tone = notice.ok === false ? "var(--red)" : "var(--green)";
  if (notice.tone === "warning") tone = "var(--yellow)";

  return (
    <div
      className="rounded-[11px] border border-border-strong bg-bg-sunken px-3 py-3"
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
        <MonoText className="mt-2 block" size="sm">
          Balance: ${notice.balance.toFixed(4)}
        </MonoText>
      ) : null}
    </div>
  );
}

export function ConnectionOkBanner({ message }: Readonly<{ message: string }>) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-green bg-bg-sunken px-3.5 py-[11px] text-[12.5px] font-medium text-green [background:color-mix(in_srgb,var(--green)_8%,transparent)]">
      <CheckCircle aria-hidden size={16} weight="fill" />
      {message}
    </div>
  );
}
