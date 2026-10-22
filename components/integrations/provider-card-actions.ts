import type { IntegrationProviderData } from "@/lib/integrations/types";

export function providerCardActions(provider: IntegrationProviderData) {
  const isHostedSerp = provider.kind === "serp" && provider.credentialSource === "hosted";
  const keyRemoval =
    provider.kind !== "serp"
      ? undefined
      : provider.connectionId && provider.connectionUpdatedAt
        ? {
            id: provider.connectionId,
            updatedAt: provider.connectionUpdatedAt,
            credentialSource: "own" as const,
          }
        : null;
  const managementActionKey =
    provider.kind === "serp"
      ? "manageKey"
      : provider.id === "gsc" && provider.status === "connected"
        ? "connectionSettings"
        : "manage";
  return { isHostedSerp, keyRemoval, managementActionKey } as const;
}
