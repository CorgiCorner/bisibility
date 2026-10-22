import "server-only";

import { primaryProviderConnection } from "@/lib/rank-check/provider-chain-order";
import { decryptProviderCredentials } from "./crypto";
import { readDeploymentFirstCheckSourceReady } from "./first-check-readiness-extension";
import type { FirstCheckConnection } from "./first-check-readiness-types";
import { ownKeyProvidersFor } from "./own-key-readiness";

export type { FirstCheckConnection } from "./first-check-readiness-types";

/** Local validation only: never resolves an environment fallback or probes a provider. */
export function firstCheckOwnKeyReady(connection: FirstCheckConnection) {
  if (
    connection.credentialSource !== "own" ||
    !connection.enabled ||
    connection.status !== "connected"
  )
    return false;
  if (!ownKeyProvidersFor("rank_check").includes(connection.provider)) return false;
  try {
    const credentials = decryptProviderCredentials(connection.credentialsEncrypted);
    return connection.provider === "dataforseo"
      ? Boolean(credentials.login?.trim() && credentials.password?.trim())
      : Boolean(credentials.apiKey?.trim());
  } catch {
    return false;
  }
}

/** Display readiness is conservative; clicking still uses the authoritative launch guards. */
export async function readFirstCheckSourceReady(
  projectId: string,
  connections: readonly FirstCheckConnection[],
  now = new Date(),
): Promise<boolean> {
  const selected = primaryProviderConnection(connections, "serp");
  if (!selected) return false;
  try {
    return await readDeploymentFirstCheckSourceReady(
      projectId,
      selected,
      firstCheckOwnKeyReady(selected),
      now,
    );
  } catch {
    return false;
  }
}
