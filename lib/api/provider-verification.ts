import { providerCredentialRequirementMessage } from "@/lib/providers/credential-requirements";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { getAnalyticsProvider, getSerpProvider } from "@/lib/providers/registry";
import type {
  ProviderCatalogItem,
  ProviderCredentials,
  ProviderTestResult,
} from "@/lib/providers/types";

export type ProviderProbeResult =
  | (ProviderTestResult & { rateLimited?: false })
  | { message: string; ok: false; rateLimited: true };

function hasCredentials(credentials: ProviderCredentials) {
  return Boolean(credentials.apiKey || credentials.login || credentials.password);
}

export function providerAdapter(item: ProviderCatalogItem) {
  if (item.kind === "serp") return getSerpProvider(item.id);
  if (item.kind === "analytics") return getAnalyticsProvider(item.id);
  throw new Error("Provider does not expose a connection test adapter yet.");
}

export async function probeProviderConnection({
  credentials,
  projectId,
  provider,
}: {
  credentials: ProviderCredentials;
  projectId: string;
  provider: ProviderCatalogItem;
}): Promise<ProviderProbeResult> {
  const credentialError = providerCredentialRequirementMessage(provider, credentials);
  if (credentialError) {
    throw new Error(credentialError);
  }

  const gate = await consumeProviderLimit(provider.id, credentials, { projectId });
  if (!gate.success) {
    return { message: "Rate limited, try again shortly.", ok: false, rateLimited: true };
  }

  return providerAdapter(provider).testConnection(credentials);
}

export async function verifyProviderConnectionBeforeSave({
  credentials,
  hasStoredCredentials,
  projectId,
  provider,
}: {
  credentials: ProviderCredentials;
  hasStoredCredentials: boolean;
  projectId: string;
  provider: ProviderCatalogItem;
}) {
  if (hasStoredCredentials && !hasCredentials(credentials)) {
    return;
  }

  const result = await probeProviderConnection({ credentials, projectId, provider });
  if (!result.ok) {
    if (result.rateLimited) {
      throw new Error("Provider connection test is rate limited. Try again shortly.");
    }
    throw new Error(`Connection test failed: ${result.message}`);
  }
}
