import { EMAIL_PROVIDER_IDS, type EmailProviderId } from "./types";

export const INSTANCE_MAIL_CONFIG_ID = "default";

export type InstanceMailSettingsView = {
  credentialsConfigured: boolean;
  envOverridesSaved: boolean;
  hasPasswordCredential: boolean;
  provider: EmailProviderId | null;
  sender: string;
  twoFactorEnabled: boolean;
};

export type InstanceMailRuntime = {
  provider: EmailProviderId;
  resendApiKey: string | null;
  sender: string;
  sesAccessKeyId: string | null;
  sesRegion: string | null;
  sesSecretAccessKey: string | null;
  smtpHost: string | null;
  smtpPassword: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
};

let current: InstanceMailRuntime | null = null;

export function isInstanceMailProvider(value: string): value is EmailProviderId {
  return EMAIL_PROVIDER_IDS.some((id) => id === value);
}

export function getInstanceMailRuntime() {
  return current;
}

export function setInstanceMailRuntime(value: InstanceMailRuntime | null) {
  current = value;
}

/** Stored credentials apply only when EMAIL_PROVIDER is empty. */
export function storedMailProvider(id: EmailProviderId) {
  if (process.env.EMAIL_PROVIDER?.trim()) return null;
  const runtime = current;
  if (!runtime || runtime.provider !== id) return null;
  return runtime;
}
