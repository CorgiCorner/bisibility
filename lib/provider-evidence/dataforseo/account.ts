import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { retainedRecoveryAccount } from "@/lib/provider-evidence/recovery/account-extension";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials } from "@/lib/providers/crypto";

export async function originalRecoveryAccount(identity: ProviderDispatchIdentity) {
  if (identity.payerKind === "hosted") return retainedRecoveryAccount(identity);
  if (identity.payerKind !== "byok" || identity.payerAccountRef !== identity.connectionId)
    return null;
  const connection = await prisma.providerConnection.findUnique({
    where: { id: identity.connectionId },
  });
  if (
    !connection ||
    connection.provider !== identity.provider ||
    connection.credentialSource === "hosted" ||
    ownCredentialVersion(identity.provider, connection.id, connection.credentialsEncrypted) !==
      identity.providerCredentialVersion
  )
    return null;
  const credentials = decryptProviderCredentials(connection.credentialsEncrypted);
  if (!credentials.login || !credentials.password) return null;
  return {
    accountId: identity.connectionId,
    credentialVersion: identity.providerCredentialVersion,
    login: credentials.login,
    password: credentials.password,
  };
}
