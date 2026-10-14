import "server-only";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";

export async function readMapsConnection(
  tx: LocalTransaction,
  projectId: string,
  publicId: string,
) {
  const connection = await tx.providerConnection.findFirst({
    where: {
      projectId,
      publicId,
      provider: "dataforseo",
      kind: "serp",
      enabled: true,
      status: "connected",
      credentialSource: "own",
    },
    select: { id: true, publicId: true, provider: true, credentialsEncrypted: true },
  });
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  const version =
    connection &&
    ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted);
  if (!connection?.credentialsEncrypted || !version || !project)
    throw new Error("Maps own-key connection is unavailable.");
  return {
    ...connection,
    credentialsEncrypted: connection.credentialsEncrypted,
    version,
    ownerId: project.ownerId,
    projectId,
  };
}
export type MapsConnection = Awaited<ReturnType<typeof readMapsConnection>>;
export function sameMapsConnection(original: MapsConnection, current: MapsConnection) {
  if (
    original.id !== current.id ||
    original.version !== current.version ||
    original.ownerId !== current.ownerId ||
    original.projectId !== current.projectId
  )
    throw new Error("Original Maps credential custody changed.");
}
export function mapsCredentials(connection: MapsConnection) {
  const credentials = decryptProviderCredentials(connection.credentialsEncrypted);
  requireDataForSeoLogin(credentials);
  return credentials;
}
