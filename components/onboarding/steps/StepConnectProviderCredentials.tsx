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
  connectBackupDisabled: boolean;
  errors: FieldErrors<OnboardingConnectProviderInput>;
  onBackupConnect?: () => void;
  onCredentialChange: () => void;
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
  connectBackupDisabled,
  errors,
  onBackupConnect,
  onCredentialChange,
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
      connectBackupDisabled={connectBackupDisabled}
      errors={{
        login: errors.login?.message,
        secret: errors.secret?.message,
      }}
      fields={credentialFields[providerId]}
      onConnectBackup={onBackupConnect}
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
