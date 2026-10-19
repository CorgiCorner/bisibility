import "server-only";

import { OWN_KEY_CAPABILITIES, type OwnKeyCapability } from "./own-key-capabilities";
import { PROVIDER_CATALOG, serpProviderCapabilities } from "./registry";
import { storedProviderCredentialsPresent } from "./stored-credentials";

export type OwnKeyConnection = {
  credentialSource: string;
  credentialsEncrypted: string | null;
  enabled: boolean;
  provider: string;
  status: string;
};

export type MissingOwnKey = { capability: OwnKeyCapability; providers: string[] };

function supports(providerId: string, capability: OwnKeyCapability) {
  // AI tracking runs only on an own DataForSEO connection.
  if (capability === "ai_tracking") return providerId === "dataforseo";
  const capabilities = serpProviderCapabilities(providerId);
  if (!capabilities) return false;
  if (capability === "rank_check") return capabilities.rankCheck;
  if (capability === "keyword_research") return capabilities.keywordResearch;
  if (capability === "backlinks") return capabilities.backlinks;
  return capabilities.domainOverview;
}

/** Providers that can serve a capability, in catalog order. */
export function ownKeyProvidersFor(capability: OwnKeyCapability): string[] {
  return PROVIDER_CATALOG.filter((entry) => entry.kind === "serp")
    .map((entry) => entry.id)
    .filter((id) => supports(id, capability));
}

/** An enabled, connected own connection whose key is stored, so it never uses a fallback key. */
export function usableOwnKey(connection: OwnKeyConnection) {
  return (
    connection.credentialSource === "own" &&
    connection.enabled &&
    connection.status === "connected" &&
    storedProviderCredentialsPresent(connection.credentialsEncrypted)
  );
}

/** Capabilities a project cannot run on its own keys, each with the providers that would serve it. */
export function missingOwnKeys(connections: readonly OwnKeyConnection[]): MissingOwnKey[] {
  const usable = new Set(connections.filter(usableOwnKey).map((connection) => connection.provider));
  return OWN_KEY_CAPABILITIES.flatMap((capability) => {
    const providers = ownKeyProvidersFor(capability);
    return providers.some((provider) => usable.has(provider)) ? [] : [{ capability, providers }];
  });
}
