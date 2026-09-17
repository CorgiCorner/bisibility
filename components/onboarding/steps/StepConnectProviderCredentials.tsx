"use client";

import { useTranslations } from "next-intl";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { ProviderCredentialForm } from "./ProviderCredentialForm";
import type {
  CredentialField,
  OnboardingConnectProviderInput,
  OnboardingSerpProviderId,
  ProviderTestResult,
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
  showSave?: boolean;
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
  showSave,
}: Readonly<StepConnectProviderCredentialsProps>) {
  const t = useTranslations("onboarding.provider.credentials");
  const fields: readonly CredentialField[] =
    providerId === "dataforseo"
      ? [
          {
            label: t("fields.apiLogin"),
            name: "login",
            placeholder: t("fields.loginPlaceholder"),
          },
          {
            description: savedConnection
              ? t("fields.savedDescription")
              : t("fields.apiPasswordDescription"),
            label: t("fields.apiPassword"),
            name: "secret",
            placeholder: savedConnection
              ? t("fields.savedPlaceholder")
              : t("fields.apiPasswordPlaceholder"),
            type: "password",
          },
        ]
      : [
          {
            description: savedConnection ? t("fields.savedDescription") : undefined,
            label: t("fields.apiKey"),
            name: "secret",
            placeholder: savedConnection
              ? t("fields.savedPlaceholder")
              : t("fields.apiKeyPlaceholder"),
            type: "password",
          },
        ];
  return (
    <ProviderCredentialForm
      busy={busy}
      saveDisabled={saveDisabled}
      errors={{
        login: errors.login?.message,
        secret: errors.secret?.message,
      }}
      fields={fields}
      onSave={onSave}
      onTest={onTest}
      providerId={providerId}
      providerLabel={providerLabel}
      registerField={(name) => register(name, { onChange: onCredentialChange })}
      savedConnection={savedConnection}
      testDisabled={testDisabled}
      testResult={testResult}
      testing={testing}
      showSave={showSave}
    />
  );
}
