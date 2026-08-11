import type { CredentialField } from "@/lib/integrations/types";

// Stored secrets never return to the browser; the masked placeholder indicates
// that a blank field preserves the saved value.
export const SAVED_SECRET_PLACEHOLDER = "••••••••";
export const SAVED_SECRET_DESCRIPTION =
  "Saved and encrypted. Leave blank to keep the current value, or enter a new one to replace it.";

type SerpCredentialField = CredentialField & { name: "login" | "secret" };

export const DATAFORSEO_CREDENTIAL_FIELDS = [
  { label: "API login", name: "login", placeholder: "you@company.com" },
  {
    label: "API password",
    name: "secret",
    placeholder: "API password",
    type: "password",
  },
] as const satisfies readonly SerpCredentialField[];

export const SERPAPI_CREDENTIAL_FIELDS = [
  { label: "API key", name: "secret", placeholder: "Your private API key", type: "password" },
] as const satisfies readonly SerpCredentialField[];

const PLAUSIBLE_CREDENTIAL_FIELDS = [
  { label: "Site domain", name: "login", placeholder: "example.com" },
  {
    label: "API token",
    name: "secret",
    placeholder: "Stats API token from your Plausible account",
    type: "password",
  },
  {
    description: "Leave blank for Plausible Cloud. Set this only for a self-hosted instance.",
    label: "API base URL",
    name: "endpoint",
    optional: true,
    placeholder: "https://plausible.example.com (optional)",
  },
] as const satisfies readonly CredentialField[];

const OAUTH_CLIENT_CREDENTIAL_FIELDS = [
  { label: "Client ID", name: "login", placeholder: "OAuth client ID" },
  { label: "Client secret", name: "secret", placeholder: "OAuth client secret", type: "password" },
] as const satisfies readonly CredentialField[];

const fieldsByProvider: Record<string, readonly CredentialField[]> = {
  dataforseo: DATAFORSEO_CREDENTIAL_FIELDS,
  "local-sequence": [],
  plausible: PLAUSIBLE_CREDENTIAL_FIELDS,
  serpapi: SERPAPI_CREDENTIAL_FIELDS,
};

function savedSecretField(field: CredentialField): CredentialField {
  if (field.type !== "password") return field;
  return { ...field, description: SAVED_SECRET_DESCRIPTION, placeholder: SAVED_SECRET_PLACEHOLDER };
}

/** Connected providers use the saved-value presentation for secret fields. */
export function providerCredentialFieldsFor(
  providerId: string,
  options: { connected: boolean },
): readonly CredentialField[] {
  const fields = fieldsByProvider[providerId] ?? OAUTH_CLIENT_CREDENTIAL_FIELDS;
  return options.connected ? fields.map(savedSecretField) : fields;
}
