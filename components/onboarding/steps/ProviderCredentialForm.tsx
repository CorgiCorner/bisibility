"use client";

import { Button } from "@/components/ui";
import {
  CheckCircleIcon as CheckCircle,
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
  connectDisabled?: boolean;
  errors: CredentialErrors;
  fields: readonly CredentialField[];
  onConnect?: () => void;
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
    return <span className={statusChip} role="status" />;
  }
  if (savedConnection) {
    return (
      <span className={`${statusChip} text-green-text`} role="status">
        <CheckCircle aria-hidden size={14} weight="fill" />
        {providerLabel} connected
      </span>
    );
  }
  if (testResult?.ok) {
    return (
      <span className={`${statusChip} text-green-text`} role="status">
        <CheckCircle aria-hidden size={14} weight="fill" />
        {providerLabel} verified
      </span>
    );
  }
  if (testResult) {
    return (
      <span className={`${statusChip} text-red-text`} role="status">
        <WarningCircle aria-hidden size={14} weight="fill" />
        {testResult.message}
      </span>
    );
  }
  return <span className={statusChip} role="status" />;
}

export function ProviderCredentialForm({
  busy,
  connectDisabled = false,
  errors,
  fields,
  onConnect,
  onTest,
  providerId,
  providerLabel,
  registerField,
  savedConnection = false,
  testDisabled = false,
  testResult,
  testing,
}: Readonly<ProviderCredentialFormProps>) {
  const saveHint = onConnect
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
          loading={testing}
          onClick={onTest}
          startIcon={<Plug aria-hidden size={15} />}
          type="button"
          variant="secondary"
        >
          Test connection
        </Button>
        {onConnect ? (
          <Button
            disabled={busy || connectDisabled}
            onClick={onConnect}
            startIcon={<PlusCircle aria-hidden size={15} weight="bold" />}
            type="button"
            variant="primary"
          >
            Connect backup
          </Button>
        ) : null}
        <TestStatus
          providerLabel={providerLabel}
          savedConnection={savedConnection}
          testResult={testResult}
          testing={testing}
        />
      </div>
      <p className="m-0 mt-2.5 text-[11.5px] leading-[1.5] text-fg-muted">
        {savedConnection ? "Leave credentials blank to keep the stored connection." : saveHint}
      </p>
    </section>
  );
}
