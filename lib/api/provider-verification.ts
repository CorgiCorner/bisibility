import { randomUUID } from "node:crypto";
import { withFreeRequestUsage } from "@/lib/analytics/request-usage-context";
import { ahrefsProvider } from "@/lib/domain-rating/provider";
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
  if (item.id === "ahrefs") return ahrefsProvider;
  if (item.kind === "serp") return getSerpProvider(item.id);
  if (item.kind === "analytics") return getAnalyticsProvider(item.id);
  throw new Error("Provider does not expose a connection test adapter yet.");
}

export async function probeProviderConnection({
  credentials,
  projectId,
  provider,
  analytics,
}: {
  credentials: ProviderCredentials;
  projectId: string;
  provider: ProviderCatalogItem;
  analytics?: { actorId?: string | null; trigger?: "manual" | "api" | "unknown" };
}): Promise<ProviderProbeResult> {
  const credentialError = providerCredentialRequirementMessage(provider, credentials);
  if (credentialError) {
    throw new Error(credentialError);
  }

  const gate = await consumeProviderLimit(provider.id, credentials, { projectId });
  if (!gate.success) {
    return { message: "Rate limited, try again shortly.", ok: false, rateLimited: true };
  }

  const adapter = providerAdapter(provider);
  if (provider.id !== "ahrefs") return adapter.testConnection(credentials);
  return withFreeRequestUsage(
    {
      projectId,
      actorId: analytics?.actorId,
      operationKey: `provider-probe/${randomUUID()}`,
      feature: "domain_rating",
      trigger: analytics?.trigger ?? "unknown",
    },
    () => adapter.testConnection(credentials),
  );
}

export async function verifyProviderConnectionBeforeSave({
  credentials,
  hasStoredCredentials,
  projectId,
  provider,
  analytics,
}: {
  credentials: ProviderCredentials;
  hasStoredCredentials: boolean;
  projectId: string;
  provider: ProviderCatalogItem;
  analytics?: { actorId?: string | null; trigger?: "manual" | "api" | "unknown" };
}) {
  if (hasStoredCredentials && !hasCredentials(credentials)) {
    return;
  }

  const result = await probeProviderConnection({ credentials, projectId, provider, analytics });
  if (!result.ok) {
    if (result.rateLimited) {
      throw new Error("Provider connection test is rate limited. Try again shortly.");
    }
    throw new Error(`Connection test failed: ${result.message}`);
  }
  return result;
}
