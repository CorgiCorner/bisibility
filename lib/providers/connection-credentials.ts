import { connectionResponseRecorder } from "@/lib/provider-responses/connection";
import "server-only";

import { deploymentProviderCredentials } from "./credential-extension";
import { resolveProviderCredentials } from "./credentials";
import type { ProviderCredentials } from "./types";

/**
 * Resolve a connection's provider credentials by its recorded source.
 * Hosted connections resolve exclusively through the deployment seam and
 * never decrypt or inspect the connection's stored own credentials.
 */
export async function resolveConnectionCredentials(
  connection: {
    id?: string;
    provider: string;
    credentialsEncrypted: string | null;
    credentialSource: "own" | "hosted";
  },
  purpose?: "free_catalog",
): Promise<ProviderCredentials | null> {
  switch (connection.credentialSource) {
    case "own":
      return {
        ...resolveProviderCredentials(connection.provider, connection.credentialsEncrypted),
        ...(connection.id
          ? {
              captureResponse: connectionResponseRecorder(
                connection.id,
                connection.provider,
                "catalog",
              ),
            }
          : {}),
      };
    case "hosted": {
      const credentials = await (purpose
        ? deploymentProviderCredentials(connection.provider, purpose)
        : deploymentProviderCredentials(connection.provider));
      return (
        credentials && {
          ...credentials,
          ...(connection.id
            ? {
                captureResponse: connectionResponseRecorder(
                  connection.id,
                  connection.provider,
                  "catalog",
                ),
              }
            : {}),
        }
      );
    }
    default:
      return null;
  }
}
