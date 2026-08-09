"use client";

import { Button } from "@/components/ui";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  PlugIcon as Plug,
  PlusCircleIcon as PlusCircle,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { CredentialFieldInput } from "./CredentialFieldInput";
import type { CredentialField, OnboardingSerpProviderId } from "./StepConnectProvider.fields";

type ProviderTestResult = {
  balance?: number;
  message: string;
  ok: boolean;
};

type CredentialErrors = Partial<Record<"login" | "secret", string>>;

type ProviderCredentialFormProps = {
  busy: boolean;
  connectBackupDisabled?: boolean;
  errors: CredentialErrors;
  fields: readonly CredentialField[];
  onConnectBackup?: () => void;
  onTest: () => void;
  providerId: OnboardingSerpProviderId;
  providerLabel: string;
  registerField: (name: CredentialField["name"]) => UseFormRegisterReturn;
  savedConnection?: boolean;
  testDisabled?: boolean;
  testResult?: ProviderTestResult | null;
  testing: boolean;
};

const statusChip = "inline-flex items-center gap-1.5 font-medium text-[12px]";

function TestStatus({
  providerLabel,
  savedConnection,
  testResult,
  testing,
}: Readonly<{
  providerLabel: string;
  savedConnection: boolean;
  testResult?: ProviderTestResult | null;
  testing: boolean;
}>) {
  if (testing) {
    return (
      <span className={`${statusChip} text-fg-muted`}>
        <CircleNotch aria-hidden className="bv-spin" size={14} weight="bold" />
        Testing...
      </span>
    );
  }
  if (savedConnection || testResult?.ok) {
    return (
      <span className={`${statusChip} text-green-text`}>
        <CheckCircle aria-hidden size={14} weight="fill" />
        {providerLabel} connected
      </span>
    );
  }
  if (testResult) {
    return (
      <span className={`${statusChip} text-red-text`} role="alert">
        <WarningCircle aria-hidden size={14} weight="fill" />
        {testResult.message}
      </span>
    );
  }
  return <span className="text-[12px] text-fg-muted">Not tested yet</span>;
}

export function ProviderCredentialForm({
  busy,
  connectBackupDisabled = false,
  errors,
  fields,
  onConnectBackup,
  onTest,
  providerId,
  providerLabel,
  registerField,
  savedConnection = false,
  testDisabled = false,
  testResult,
  testing,
}: Readonly<ProviderCredentialFormProps>) {
  const saveHint = onConnectBackup
    ? "Test validates the key - use Connect backup to save it."
    : "Test validates the key - it is saved when you continue.";
  return (
    <section className="mt-4 rounded-[14px] border border-border bg-bg-elev p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <CredentialFieldInput
            disabled={busy}
            error={errors[field.name]}
            id={`onboarding-${providerId}-${field.name}`}
            key={field.name}
            label={field.label}
            password={field.type === "password"}
            placeholder={field.placeholder}
            registration={registerField(field.name)}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button
          disabled={busy || testDisabled}
          onClick={onTest}
          startIcon={
            testing ? (
              <CircleNotch aria-hidden className="bv-spin" size={15} weight="bold" />
            ) : (
              <Plug aria-hidden size={15} />
            )
          }
          type="button"
          variant="secondary"
        >
          Test connection
        </Button>
        {onConnectBackup ? (
          <button
            className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border border-border-strong bg-fg px-3.5 py-[9px] text-[13px] font-semibold text-bg-elev disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
            disabled={busy || connectBackupDisabled}
            onClick={onConnectBackup}
            type="button"
          >
            <PlusCircle aria-hidden size={15} weight="bold" />
            Connect backup
          </button>
        ) : null}
        <TestStatus
          providerLabel={providerLabel}
          savedConnection={savedConnection}
          testResult={testResult}
          testing={testing}
        />
      </div>
      {savedConnection ? null : (
        <p className="m-0 mt-2.5 text-[11.5px] leading-[1.5] text-fg-muted">{saveHint}</p>
      )}
    </section>
  );
}
