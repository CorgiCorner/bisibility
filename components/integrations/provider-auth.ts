import type {
  CredentialField,
  IntegrationProviderData,
  ProviderTestResult,
} from "@/lib/integrations/types";

export type ProviderAuthMode = "key" | "oauth";

const oauthProviderIds = new Set(["gsc", "ga4"]);

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

export function oauthScopes(provider: IntegrationProviderData): readonly string[] {
  if (/analytics 4/i.test(provider.name)) {
    return ["analytics.readonly (reports and properties)", "openid email (account selection)"];
  }

  return [
    "webmasters.readonly (property list + search analytics + sitemap status)",
    "openid email (account selection)",
  ];
}

export function testSuccessCopy(providerId: string, result: ProviderTestResult | null) {
  const message = result?.message.trim() || "Connection verified.";
  if (typeof result?.balance !== "number") return message;

  if (providerId === "dataforseo") {
    return `${message} · Account balance: $${result.balance.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    })}`;
  }

  if (providerId === "serpapi") {
    return `${message} · ${Math.round(result.balance).toLocaleString("en-US")} searches remaining`;
  }

  return message;
}
