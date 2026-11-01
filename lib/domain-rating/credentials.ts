import "server-only";

import { prisma } from "@/lib/db/prisma";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { hostedDomainRatingKey } from "./hosted-extension";

export async function resolveDomainRatingCredentials(projectId: string, now: Date) {
  const own = await prisma.providerConnection.findUnique({
    where: { projectId_provider: { projectId, provider: "ahrefs" } },
    select: { id: true, enabled: true, status: true, credentialsEncrypted: true },
  });
  // A paused or broken own connection must never silently switch to a shared key.
  if (own?.credentialsEncrypted) {
    if (!own.enabled || own.status !== "connected") return null;
    try {
      const key = decryptProviderCredentials(own.credentialsEncrypted).apiKey;
      return key ? { key, source: "own" as const, connectionId: own.id } : null;
    } catch {
      return null;
    }
  }
  const key = await hostedDomainRatingKey(projectId, now);
  return key ? { key, source: "hosted" as const, connectionId: null } : null;
}
