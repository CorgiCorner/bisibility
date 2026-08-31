"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import {
  CheckCircleIcon as CheckCircle,
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
  saveDisabled?: boolean;
  errors: CredentialErrors;
  fields: readonly CredentialField[];
  onSave: () => void;
  onTest: () => void;
  providerId: OnboardingSerpProviderId;
  providerLabel: string;
  registerField: (name: CredentialField["name"]) => UseFormRegisterReturn;
  savedConnection?: boolean;
  testDisabled?: boolean;
  testResult?: ProviderTestResult | null;
  testing: boolean;
  showSave?: boolean;
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
        <CheckCircle aria-hidden size={14} weight="regular" />
        {providerLabel} connected
      </span>
    );
  }
  if (testResult?.ok) {
    return (
      <span className={`${statusChip} text-green-text`} role="status">
        <CheckCircle aria-hidden size={14} weight="regular" />
        {providerLabel} verified
      </span>
    );
  }
  if (testResult) {
    return (
      <span className={`${statusChip} text-red-text`} role="status">
        <WarningCircle aria-hidden size={14} weight="regular" />
        {testResult.message}
      </span>
    );
  }
  return <span className={statusChip} role="status" />;
}

export function ProviderCredentialForm({
  busy,
  saveDisabled = false,
  errors,
  fields,
  onSave,
  onTest,
  providerId,
  providerLabel,
  registerField,
  savedConnection = false,
  testDisabled = false,
  testResult,
  testing,
  showSave = true,
}: Readonly<ProviderCredentialFormProps>) {
  const saveHint = "Test the credentials and save.";
  return (
    <section className="mt-4 rounded-card border border-border bg-bg-elev p-4">
      <div className={cn("grid gap-4", fields.length > 1 && "sm:grid-cols-2")}>
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <TestStatus
          providerLabel={providerLabel}
          savedConnection={savedConnection}
          testResult={testResult}
          testing={testing}
        />
        <div className="ml-auto flex flex-wrap justify-end gap-2.5">
          <Button
            disabled={busy || testDisabled}
            loading={testing}
            onClick={onTest}
            sx={{ fontWeight: 400 }}
            type="button"
            variant="secondary"
          >
            Test connection
          </Button>
          {showSave ? (
            <Button
              disabled={busy || saveDisabled}
              onClick={onSave}
              sx={{ fontWeight: 400 }}
              type="button"
              variant="secondary"
            >
              Save {providerLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="m-0 mt-2.5 text-[11.5px] leading-[1.5] text-fg-muted">
        {savedConnection ? "Leave credentials blank to keep the stored connection." : saveHint}
      </p>
    </section>
  );
}
