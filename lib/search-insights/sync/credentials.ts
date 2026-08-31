import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readGscCredentials } from "@/lib/providers/analytics/gsc-credentials";
import { ProviderConfigurationError } from "@/lib/providers/failure-class";
import type { ProviderCredentials } from "@/lib/providers/types";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";

// The Search Console integration id, as stored on the connection row and on every
// imported row's `source` column.
export const SEARCH_INSIGHTS_SOURCE = "gsc";

export type SearchInsightsConnection = {
  connectionId: string;
  credentials: ProviderCredentials;
  property: string;
};

// Why the module cannot read. Only "needs_reauth" is fixed by reconnecting; a disabled
// connection, a missing one and a stored property the normalizer rejects are not, so the
// import strip must not ask for a reconnect on those.
export type SearchInsightsConnectionProblem =
  | "disabled"
  | "missing"
  | "needs_reauth"
  | "unreadable";

export type ResolvedSearchInsightsConnection =
  | { connection: SearchInsightsConnection; problem: null }
  | { connection: null; problem: SearchInsightsConnectionProblem };

export async function readSearchInsightsConnection(
  projectId: string,
): Promise<ResolvedSearchInsightsConnection> {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, enabled: true, id: true, provider: true, status: true },
    where: { projectId_provider: { projectId, provider: SEARCH_INSIGHTS_SOURCE } },
  });
  if (!connection) return { connection: null, problem: "missing" };
  if (!connection.enabled) return { connection: null, problem: "disabled" };
  if (connection.status !== "connected") return { connection: null, problem: "needs_reauth" };

  // Runtime credentials persist a rotated refresh token, which a multi-hour backfill
  // will hit at least once.
  const credentials = trafficRuntimeCredentials(connection);
  try {
    return {
      connection: {
        connectionId: connection.id,
        credentials,
        property: readGscCredentials(credentials).property,
      },
      problem: null,
    };
  } catch {
    return { connection: null, problem: "unreadable" };
  }
}

// The provider derives the site it queries from the connection, while the row key travels
// beside it. A property switch mid-import would otherwise file the new property's rows
// under the old property's key, so a write whose two halves disagree refuses instead.
export function assertRequestedProperty(connectedProperty: string, requestedProperty: string) {
  if (connectedProperty !== requestedProperty) {
    throw new ProviderConfigurationError(
      "The Search Console connection points at a different property than this import.",
    );
  }
}

// Null covers every reason the module cannot read. Callers that only need data turn that
// into an empty state, never into an error; callers that report why use the resolved form.
export async function resolveSearchInsightsConnection(
  projectId: string,
): Promise<SearchInsightsConnection | null> {
  return (await readSearchInsightsConnection(projectId)).connection;
}
