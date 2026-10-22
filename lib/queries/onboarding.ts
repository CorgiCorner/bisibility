import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { keywordMembershipSelect } from "@/lib/keywords/membership-select";
import { createKeywordMembershipProjector } from "@/lib/keywords/schedule-membership";
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

export async function getOnboardingSampleKeyword(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const keyword = await prisma.keyword.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { text: true },
    where: { projectId: project.id },
  });
  return keyword?.text ?? null;
}

export async function getOnboardingKeywordTexts(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const rows = await prisma.keyword.findMany({
    distinct: ["textNormalized"],
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { text: true },
    where: { projectId: project.id, archivedAt: null },
  });
  return rows.map((row) => row.text);
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

export async function getOnboardingTrackingStartedAt(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const check = await prisma.rankCheck.findFirst({
    where: { keyword: { projectId: project.id } },
    orderBy: { checkedAt: "asc" },
    select: { checkedAt: true },
  });
  return check?.checkedAt.toISOString() ?? null;
}

export async function getOnboardingNextCheckAt(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const keywords = await prisma.keyword.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, checkSchedule: { select: keywordMembershipSelect } },
    where: { projectId: project.id, archivedAt: null },
  });
  const membership = createKeywordMembershipProjector(new Date());
  return (
    keywords
      .flatMap((keyword) => {
        const next = membership(keyword.checkSchedule, keyword.id).nextCheckAt;
        return next ? [next] : [];
      })
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
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

export async function existingOnboardingPlaceLocationKeys(cityKeys: readonly string[]) {
  if (cityKeys.length === 0) {
    return new Set<string>();
  }
  const rows = await prisma.location.findMany({
    select: { canonicalKey: true },
    where: { canonicalKey: { in: [...cityKeys] }, kind: { in: ["city", "region"] } },
  });
  return new Set(rows.map((row) => row.canonicalKey));
}

/** Stored metadata keeps region/city kind and display text intact when onboarding resumes. */
export async function getOnboardingLocationDetails(keys: readonly string[]) {
  if (keys.length === 0) return [];
  return prisma.location.findMany({
    select: {
      id: true,
      canonicalKey: true,
      countryCode: true,
      cityName: true,
      displayName: true,
      kind: true,
      gl: true,
      hl: true,
      languageLabel: true,
    },
    where: { canonicalKey: { in: [...keys] } },
  });
}
