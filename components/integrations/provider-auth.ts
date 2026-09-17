import type {
  CredentialField,
  IntegrationProviderData,
  ProviderTestResult,
} from "@/lib/integrations/types";

export type ProviderAuthMode = "key" | "oauth";
export type OAuthScope = "account_identity" | "analytics_readonly" | "search_console_readonly";
export type TestSuccessPresentation = {
  balance: { kind: "currency" | "searches"; value: number } | null;
  kind: "application_connection" | "provider_message" | "verified";
  message: string | null;
};

const oauthProviderIds = new Set(["gsc", "ga4"]);
const applicationConnectionProviderIds = new Set(["ga4", "gsc", "plausible"]);

export function providerAuthMode(provider: IntegrationProviderData): ProviderAuthMode {
  return oauthProviderIds.has(provider.id) ? "oauth" : "key";
}

export function providerMode(provider: IntegrationProviderData) {
  return provider.status === "connected" ? "manage" : "connect";
}

export function providerCredentialFields(
  provider: IntegrationProviderData,
): readonly CredentialField[] {
  return provider.drawer.credentialFields;
}

export function oauthScopes(provider: IntegrationProviderData): readonly OAuthScope[] {
  if (/analytics 4/i.test(provider.name)) {
    return ["analytics_readonly", "account_identity"];
  }

  return ["search_console_readonly", "account_identity"];
}

function successLead(
  providerId: string,
  message: string | undefined,
): Pick<TestSuccessPresentation, "kind" | "message"> {
  const trimmed = message?.trim() ?? "";
  if (!trimmed || /^(ok|okay|connected|connection ok)\.?$/i.test(trimmed)) {
    return { kind: "verified", message: null };
  }
  const applicationConnection = /^connection ok\s*·\s*(.+)$/i.exec(trimmed)?.[1]?.trim();
  if (applicationConnection && applicationConnectionProviderIds.has(providerId)) {
    return { kind: "application_connection", message: applicationConnection };
  }
  return { kind: "provider_message", message: trimmed };
}

/**
 * Keeps provider response data separate from locale-specific UI composition.
 * Callers render this fact with the projectIntegrations catalog.
 */
export function testSuccessPresentation(
  providerId: string,
  result: ProviderTestResult | null,
): TestSuccessPresentation {
  const lead = successLead(providerId, result?.message);
  if (typeof result?.balance !== "number") return { ...lead, balance: null };

  if (providerId === "dataforseo") {
    return { ...lead, balance: { kind: "currency", value: result.balance } };
  }

  if (providerId === "serpapi") {
    return { ...lead, balance: { kind: "searches", value: Math.round(result.balance) } };
  }

  return { ...lead, balance: null };
}
