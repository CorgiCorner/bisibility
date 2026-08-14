import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { requireReadableProject } from "./_auth";
import { activeApiKeyWhere } from "./api-key-settings";

export async function getOnboardingProjectMarketKeys(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const markets = await prisma.projectMarket.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { location: { select: { canonicalKey: true } } },
    where: {
      projectId: project.id,
      status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
    },
  });
  return markets.map((market) => market.location.canonicalKey);
}

export async function getOnboardingKeywordCount(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const [result] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT lower(btrim("text")))::int AS "count"
    FROM "keywords"
    WHERE "projectId" = ${project.id}
  `;
  return result?.count ?? 0;
}

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
