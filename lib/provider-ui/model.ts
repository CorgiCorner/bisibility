import { providerRateFeatures } from "@/lib/provider-rates/catalog";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderConnection, ProviderDefinition } from "@usagekit/views";
import { connectionRates } from "./rates";
import { connectionRevision, type ProviderUiState, type StoredUiConnection } from "./state";

export function connectionView(
  state: ProviderUiState,
  connection: StoredUiConnection,
): ProviderConnection {
  const catalog = PROVIDER_CATALOG.find((entry) => entry.id === connection.provider);
  const connected = connection.status === "connected";
  const canManage = state.binding.canManage === true;
  const commands: ProviderConnection["capabilities"] = [
    ...(canManage &&
    connection.credentialSource === "own" &&
    providerRateFeatures(connection.provider).length
      ? ["rates" as const]
      : []),
    ...(canManage && catalog?.allocation.kind === "billable" ? ["allocations" as const] : []),
  ];
  return {
    id: connection.publicId,
    provider: connection.provider,
    label: catalog?.label ?? connection.provider,
    revision: connectionRevision(state, connection),
    fundingSource: connection.credentialSource === "hosted" ? "platform" : "byok",
    enabled: connection.enabled,
    priority: connection.priority,
    fallbackChain: [],
    plan: null,
    status: {
      state: connected
        ? "connected"
        : connection.status === "needs_reauth"
          ? "needs_reauth"
          : "unknown",
    },
    availability: { state: connected && connection.enabled ? "unknown" : "unavailable" },
    freshness: { observedAt: connection.updatedAt.toISOString(), stale: true, source: "host" },
    capabilities: commands,
    rates:
      connection.credentialSource === "hosted"
        ? (state.platformRates[connection.publicId] ?? [])
        : (state.nativeRates?.[connection.publicId] ?? connectionRates(connection, canManage)),
    hasStoredCredentials: connection.hasStoredCredentials,
    ...(connection.status === "needs_reauth" ? { credentialIssue: "unknown" as const } : {}),
  };
}

export function providerDefinitions(state: ProviderUiState): ProviderDefinition[] {
  return PROVIDER_CATALOG.map((provider) => ({
    id: provider.id,
    label: provider.label,
    credentialFields: [],
    fundingSources: state.platforms.includes(provider.id) ? ["byok", "platform"] : ["byok"],
    capabilities: [],
  }));
}
