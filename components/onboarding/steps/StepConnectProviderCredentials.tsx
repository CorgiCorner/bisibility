"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { ProviderCredentialForm } from "./ProviderCredentialForm";
import {
  credentialFields,
  type OnboardingConnectProviderInput,
  type OnboardingSerpProviderId,
  type ProviderTestResult,
} from "./StepConnectProvider.fields";

type StepConnectProviderCredentialsProps = {
  busy: boolean;
  saveDisabled: boolean;
  errors: FieldErrors<OnboardingConnectProviderInput>;
  onCredentialChange: () => void;
  onSave: () => void;
  onTest: () => void;
  providerId: OnboardingSerpProviderId;
  providerLabel: string;
  register: UseFormRegister<OnboardingConnectProviderInput>;
  savedConnection: boolean;
  testDisabled: boolean;
  testResult?: ProviderTestResult | null;
  testing: boolean;
};

export function StepConnectProviderCredentials({
  busy,
  saveDisabled,
  errors,
  onCredentialChange,
  onSave,
  onTest,
  providerId,
  providerLabel,
  register,
  savedConnection,
  testDisabled,
  testResult,
  testing,
}: Readonly<StepConnectProviderCredentialsProps>) {
  return (
    <ProviderCredentialForm
      busy={busy}
      saveDisabled={saveDisabled}
      errors={{
        login: errors.login?.message,
        secret: errors.secret?.message,
      }}
      fields={credentialFields[providerId]}
      onSave={onSave}
      onTest={onTest}
      providerId={providerId}
      providerLabel={providerLabel}
      registerField={(name) => register(name, { onChange: onCredentialChange })}
      savedConnection={savedConnection}
      testDisabled={testDisabled}
      testResult={testResult}
      testing={testing}
    />
  );
}
