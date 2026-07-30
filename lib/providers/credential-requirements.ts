import type {
  ProviderCatalogItem,
  ProviderCredentialRequirement,
  ProviderCredentials,
} from "./types";

const credentialLabels = {
  apiKey: "API key",
  endpoint: "API endpoint (optional, self-hosted)",
  login: "API login",
  password: "API password",
} satisfies Record<ProviderCredentialRequirement, string>;

function hasCredential(value: string | undefined) {
  return Boolean(value?.trim());
}

function formatList(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function singularCredentialLabel(label: string) {
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  return `${article} ${label} credential`;
}

export function missingProviderCredentials(
  provider: ProviderCatalogItem,
  credentials: ProviderCredentials,
) {
  return (provider.requiredCredentials ?? []).filter((field) => !hasCredential(credentials[field]));
}

export function providerCredentialRequirementMessage(
  provider: ProviderCatalogItem,
  credentials: ProviderCredentials,
) {
  const labels = missingProviderCredentials(provider, credentials).map(
    (field) => credentialLabels[field],
  );
  if (labels.length === 0) return null;

  const required =
    labels.length === 1 ? singularCredentialLabel(labels[0]) : `${formatList(labels)} credentials`;
  return `${provider.label} requires ${required}.`;
}
