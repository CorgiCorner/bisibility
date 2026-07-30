import "server-only";

import { prisma } from "@/lib/db/prisma";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { activeApiKeyWhere } from "./api-key-settings";

export async function getOnboardingGscPropertyLabel(projectId: string | null) {
  if (!projectId) return null;
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true },
    where: { projectId_provider: { projectId, provider: "gsc" } },
  });
  if (!connection) return null;
  try {
    return decryptProviderCredentials(connection.credentialsEncrypted).login ?? null;
  } catch {
    return null;
  }
}

export async function hasActiveOnboardingApiKey(projectId: string | null) {
  if (!projectId) return false;
  const now = new Date();
  const apiKey = await prisma.apiKey.findFirst({
    select: { id: true },
    where: {
      ...activeApiKeyWhere(now),
      projectId,
    },
  });
  return Boolean(apiKey);
}

export async function existingOnboardingCityLocationKeys(cityKeys: readonly string[]) {
  if (cityKeys.length === 0) {
    return new Set<string>();
  }
  const rows = await prisma.location.findMany({
    select: { canonicalKey: true },
    where: { canonicalKey: { in: [...cityKeys] }, kind: "city" },
  });
  return new Set(rows.map((row) => row.canonicalKey));
}
