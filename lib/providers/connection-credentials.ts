import "server-only";

import { deploymentProviderCredentials } from "./credential-extension";
import { resolveProviderCredentials } from "./credentials";
import type { ProviderCredentials } from "./types";

/**
 * Resolve a connection's provider credentials by its recorded source.
 * Hosted connections resolve exclusively through the deployment seam and
 * never decrypt or inspect the connection's stored own credentials.
 */
export async function resolveConnectionCredentials(connection: {
  provider: string;
  credentialsEncrypted: string | null;
  credentialSource: "own" | "hosted";
}): Promise<ProviderCredentials | null> {
  switch (connection.credentialSource) {
    case "own":
      return resolveProviderCredentials(connection.provider, connection.credentialsEncrypted);
    case "hosted":
      return deploymentProviderCredentials(connection.provider);
    default:
      return null;
  }
}
