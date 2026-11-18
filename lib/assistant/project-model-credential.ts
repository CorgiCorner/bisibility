import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import type { AssistantProvider } from "./wire";

export type ProjectModelCredential = {
  id: string;
  userId: string;
  provider: string;
  status: string;
  last4: string;
  versionHash: string;
  encryptedSecret: string;
};

const PREFIX = "project-model:";
export function isProjectModelCredential(id: string) {
  return id.startsWith(PREFIX);
}

/** A project key is shared by its AI features; personal legacy keys remain private to their user. */
export async function readProjectModelCredential(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  provider: AssistantProvider,
  retainedId?: string,
): Promise<ProjectModelCredential | null> {
  const id = retainedId?.startsWith(PREFIX) ? retainedId.slice(PREFIX.length) : undefined;
  if (retainedId && !id) return null;
  if (id)
    await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${id} AND "projectId"=${projectId} FOR SHARE`;
  const connection = await tx.providerConnection.findFirst({
    where: { ...(id ? { id } : {}), projectId, provider, kind: "model", credentialSource: "own" },
    select: { id: true, credentialsEncrypted: true, enabled: true, status: true },
    orderBy: { id: "asc" },
  });
  if (!connection) return null;
  let apiKey: string | undefined;
  try {
    if (connection.credentialsEncrypted)
      apiKey = decryptProviderCredentials(connection.credentialsEncrypted).apiKey;
  } catch {
    // An unreadable project key cannot silently switch the run to a personal key.
  }
  const versionHash = ownCredentialVersion(
    provider,
    connection.id,
    connection.credentialsEncrypted,
  );
  const active = Boolean(
    apiKey && versionHash && connection.enabled && connection.status === "connected",
  );
  return {
    id: `${PREFIX}${connection.id}`,
    userId,
    provider,
    status: active ? "active" : "invalid",
    last4: apiKey?.slice(-4) ?? "",
    versionHash: versionHash ?? "",
    // Existing Assistant transport consumes an encrypted scalar, while model connections store an envelope.
    encryptedSecret: active && apiKey ? encryptSecret(apiKey) : "",
  };
}
