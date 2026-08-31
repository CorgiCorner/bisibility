import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";
import type { ResolvedSearchInsightsConnection, SearchInsightsConnection } from "./credentials";

export const ORGANIC_SESSIONS_SOURCE = "ga4";

export function resolveOrganicSessionsProperty(connection: {
  credentialsEncrypted: string | null;
  id: string;
  provider: string;
}) {
  try {
    const credentials = trafficRuntimeCredentials(connection);
    const normalized = normalizeGa4PropertyId(credentials.login ?? "");
    return normalized.ok ? { credentials, property: normalized.value } : null;
  } catch {
    return null;
  }
}

export async function readOrganicSessionsConnection(
  projectId: string,
): Promise<ResolvedSearchInsightsConnection> {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, enabled: true, id: true, provider: true, status: true },
    where: { projectId_provider: { projectId, provider: ORGANIC_SESSIONS_SOURCE } },
  });
  if (!connection) return { connection: null, problem: "missing" };
  if (!connection.enabled) return { connection: null, problem: "disabled" };
  if (connection.status !== "connected") return { connection: null, problem: "needs_reauth" };

  const resolved = resolveOrganicSessionsProperty(connection);
  return resolved
    ? {
        connection: {
          connectionId: connection.id,
          credentials: resolved.credentials,
          property: resolved.property,
        },
        problem: null,
      }
    : { connection: null, problem: "unreadable" };
}

export async function resolveOrganicSessionsConnection(
  projectId: string,
): Promise<SearchInsightsConnection | null> {
  return (await readOrganicSessionsConnection(projectId)).connection;
}
