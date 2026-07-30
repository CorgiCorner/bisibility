import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type SavedKeywordRow, savedKeywordTrend } from "@/lib/saved-keywords/model";
import { requireReadableProject } from "./_auth";

const savedKeywordSelect = {
  cpc: true,
  difficulty: true,
  intent: true,
  location: true,
  publicId: true,
  savedAt: true,
  sourceSeed: true,
  text: true,
  trend: true,
  variantCount: true,
  volume: true,
} as const;

export async function listSavedKeywords(
  projectId: string,
): Promise<{ rows: SavedKeywordRow[]; total: number }> {
  const { project } = await requireReadableProject(projectId);
  const where = { projectId: project.id };
  const [savedKeywords, total] = await Promise.all([
    prisma.savedKeyword.findMany({
      orderBy: [{ volume: { nulls: "last", sort: "desc" } }, { savedAt: "desc" }, { id: "desc" }],
      select: savedKeywordSelect,
      where,
    }),
    prisma.savedKeyword.count({ where }),
  ]);
  return {
    rows: savedKeywords.map((savedKeyword) => ({
      ...savedKeyword,
      savedAt: savedKeyword.savedAt.toISOString(),
      trend: savedKeywordTrend(savedKeyword.trend),
    })),
    total,
  };
}

export async function savedKeywordCount(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  return prisma.savedKeyword.count({ where: { projectId: project.id } });
}
